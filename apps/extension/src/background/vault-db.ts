/*
  The encrypted vault's low level: the extension's own IndexedDB database and AES-GCM encryption.
  SERVICE WORKER ONLY. Web pages can't open the extension's IndexedDB, and content scripts never
  call this file.
  - The encryption key is a NON-EXTRACTABLE Web Crypto key, created once and stored in the same
    database. Chrome can use it to encrypt/decrypt, but no code can read the raw key out.
  - Every record is encrypted on its own, with a fresh random 12-byte IV each time it's written.
    The conversation key is used as "additional data", so a record can't be moved under another
    conversation's key without decryption failing.
  - Only non-secret details are stored in plain form: the conversation key and when it was last used.
  No libraries: plain IndexedDB wrapped in small promise helpers.
*/

const DB_NAME = 'safeai-vault';
const DB_VERSION = 1;
const KEYS = 'keys'; // { id: 'main', key: CryptoKey }
const RECORDS = 'records'; // VaultRow, keyPath "conversation"
const KEY_ID = 'main';

/** One stored conversation: encrypted data plus its plain, non-secret details. */
export interface VaultRow {
  /** e.g. "chatgpt:abc123" (not secret: a ChatGPT conversation id). */
  conversation: string;
  /** Random 12 bytes, new on every write. */
  iv: Uint8Array<ArrayBuffer>;
  /** The AES-GCM ciphertext of the JSON MappingRecord. */
  data: ArrayBuffer;
  /** Milliseconds since 1970: retention counts from here. */
  lastUsedAt: number;
}

/** Thrown when a record can't be decrypted (wrong/missing key, damaged data). Carries no data. */
export class VaultReadError extends Error {
  constructor() {
    super('Placeholder memory unreadable');
    this.name = 'VaultReadError';
  }
}

/* ---------- IndexedDB helpers ---------- */

let dbPromise: Promise<IDBDatabase> | null = null;

/** Opens (and on first use creates) the vault database. */
function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(KEYS)) db.createObjectStore(KEYS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(RECORDS)) {
        db.createObjectStore(RECORDS, { keyPath: 'conversation' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null; // allow a retry next time
      reject(request.error ?? new Error('IndexedDB open failed'));
    };
  });
  return dbPromise;
}

/** Turns an IDBRequest into a promise. */
function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

/** Runs `work` in one transaction and resolves when the transaction has fully committed. */
async function inStore<T>(
  store: string,
  mode: IDBTransactionMode,
  work: (objectStore: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await openDb();
  const tx = db.transaction(store, mode);
  const committed = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
  const result = await work(tx.objectStore(store));
  await committed;
  return result;
}

/* ---------- The encryption key ---------- */

let keyPromise: Promise<CryptoKey> | null = null;

/** The vault key: loaded from the database, or created (non-extractable) on first use. */
function getKey(): Promise<CryptoKey> {
  keyPromise ??= (async () => {
    const stored = await inStore(KEYS, 'readonly', (s) =>
      done(s.get(KEY_ID) as IDBRequest<{ id: string; key: CryptoKey } | undefined>),
    );
    if (stored) return stored.key;
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false, // NON-extractable: the raw key can never be read out
      ['encrypt', 'decrypt'],
    );
    // `add` (not `put`): if two starts raced, the first key wins and we use that one.
    try {
      await inStore(KEYS, 'readwrite', (s) => done(s.add({ id: KEY_ID, key })));
      return key;
    } catch {
      const winner = await inStore(KEYS, 'readonly', (s) =>
        done(s.get(KEY_ID) as IDBRequest<{ id: string; key: CryptoKey } | undefined>),
      );
      if (!winner) throw new Error('Vault key unavailable');
      return winner.key;
    }
  })().catch((error: unknown) => {
    keyPromise = null; // allow a retry next time
    throw error;
  });
  return keyPromise;
}

/* ---------- Encrypt / decrypt ---------- */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Encrypts any JSON-able value for `conversation`. */
export async function encryptFor(
  conversation: string,
  value: unknown,
): Promise<{ iv: Uint8Array<ArrayBuffer>; data: ArrayBuffer }> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(conversation) },
    key,
    encoder.encode(JSON.stringify(value)),
  );
  return { iv, data };
}

/** Decrypts a row back to its JSON value. Throws VaultReadError if that's impossible. */
export async function decryptRow(row: VaultRow): Promise<unknown> {
  try {
    const key = await getKey();
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: row.iv, additionalData: encoder.encode(row.conversation) },
      key,
      row.data,
    );
    return JSON.parse(decoder.decode(plain)) as unknown;
  } catch {
    throw new VaultReadError(); // no details: they could only describe the data
  }
}

/* ---------- Rows ---------- */

/** One conversation's row, or undefined. */
export function getRow(conversation: string): Promise<VaultRow | undefined> {
  return inStore(RECORDS, 'readonly', (s) =>
    done(s.get(conversation) as IDBRequest<VaultRow | undefined>),
  );
}

/** Writes (adds or replaces) a row. */
export async function putRow(row: VaultRow): Promise<void> {
  await inStore(RECORDS, 'readwrite', (s) => done(s.put(row)));
}

/** Deletes one conversation's row. */
export async function deleteRow(conversation: string): Promise<void> {
  await inStore(RECORDS, 'readwrite', (s) => done(s.delete(conversation)));
}

/** Every row (encrypted; used for cleanup and migration). */
export function getAllRows(): Promise<VaultRow[]> {
  return inStore(RECORDS, 'readonly', (s) => done(s.getAll() as IDBRequest<VaultRow[]>));
}

/** How many conversations are stored. */
export function countRows(): Promise<number> {
  return inStore(RECORDS, 'readonly', (s) => done(s.count()));
}

/** Deletes every row (the key is kept, so new records can be written straight away). */
export async function clearRows(): Promise<void> {
  await inStore(RECORDS, 'readwrite', (s) => done(s.clear()));
}
