/*
  Placeholder memory ("mapping"): which placeholder stands for which real value, per conversation.
  Lives ONLY in the service worker. Two implementations share one interface:
  - SessionMappingStore (this file): chrome.storage.session — memory only, wiped when the browser
    closes. Used when the policy's mappingRetentionDays is 0.
  - EncryptedMappingStore (vault-store.ts, Phase 4): AES-GCM encrypted IndexedDB records kept for
    mappingRetentionDays after last use. The default.
  store-manager.ts picks the active one. PRIVACY: values are never logged and never written to
  chrome.storage.local.
*/
import {
  EMPTY_MAPPING,
  MappingRecordSchema,
  type ConversationKey,
  type MappingEntry,
  type MappingRecord,
} from '@safeai/shared';
import { storage } from '#imports';
import { browser } from 'wxt/browser';

/** What any placeholder-memory implementation must be able to do. */
export interface MappingStore {
  /** One conversation's memory (an empty record if there's none yet). */
  getMapping(key: ConversationKey): Promise<MappingRecord>;
  /** Adds new entries (existing placeholders are kept) and raises the per-label counters. */
  saveEntries(
    key: ConversationKey,
    entries: readonly MappingEntry[],
    counters: Readonly<Record<string, number>>,
  ): Promise<void>;
  /** Records that the placeholder hint line was sent in this conversation. */
  markHintSent(key: ConversationKey): Promise<void>;
  /** Moves a new chat's memory to its real key (merging if the target already has some). */
  rekey(fromKey: ConversationKey, toKey: ConversationKey): Promise<void>;
  /** Merges a whole record into a conversation (used when moving data between stores). */
  importRecord(key: ConversationKey, record: MappingRecord): Promise<void>;
  /** Every readable conversation, for moving data to the other store. */
  exportAll(): Promise<{ key: ConversationKey; record: MappingRecord }[]>;
  /** Forgets every conversation. */
  clearAll(): Promise<void>;
  /** How many conversations are remembered (a count only). */
  countConversations(): Promise<number>;
}

/** Merges two records: entries de-duplicated by placeholder, counters take the higher number. */
export function mergeRecords(base: MappingRecord, extra: MappingRecord): MappingRecord {
  const byPlaceholder = new Map(base.entries.map((e) => [e.placeholder, e]));
  for (const entry of extra.entries) {
    if (!byPlaceholder.has(entry.placeholder)) byPlaceholder.set(entry.placeholder, entry);
  }
  const counters = { ...base.counters };
  for (const [label, n] of Object.entries(extra.counters)) {
    counters[label] = Math.max(counters[label] ?? 0, n);
  }
  return {
    entries: [...byPlaceholder.values()],
    counters,
    hintSent: base.hintSent || extra.hintSent,
  };
}

/**
 * Per-conversation queue: each task waits for earlier tasks on the same keys, so two quick
 * writes can't overwrite each other.
 */
export function createKeyQueue() {
  const queues = new Map<string, Promise<unknown>>();
  return function enqueue<T>(keys: readonly string[], task: () => Promise<T>): Promise<T> {
    const previous = Promise.all(keys.map((k) => queues.get(k) ?? Promise.resolve()));
    const run = previous.then(task, task);
    const settled = run.catch(() => undefined);
    for (const k of keys) queues.set(k, settled);
    return run;
  };
}

/** Prefix of every mapping key in session storage, e.g. "mapping:chatgpt:abc". */
const PREFIX = 'mapping:';

/** The memory-only store, on chrome.storage.session (retention 0, and Phase 3's store). */
export class SessionMappingStore implements MappingStore {
  private readonly enqueue = createKeyQueue();

  private async read(key: ConversationKey): Promise<MappingRecord> {
    const raw = await storage.getItem<unknown>(`session:${PREFIX}${key}`);
    const parsed = MappingRecordSchema.safeParse(raw);
    return parsed.success ? parsed.data : { ...EMPTY_MAPPING };
  }

  private async write(key: ConversationKey, record: MappingRecord): Promise<void> {
    await storage.setItem(`session:${PREFIX}${key}`, record);
  }

  getMapping(key: ConversationKey): Promise<MappingRecord> {
    return this.enqueue([key], () => this.read(key));
  }

  saveEntries(
    key: ConversationKey,
    entries: readonly MappingEntry[],
    counters: Readonly<Record<string, number>>,
  ): Promise<void> {
    return this.importRecord(key, {
      entries: [...entries],
      counters: { ...counters },
      hintSent: false,
    });
  }

  markHintSent(key: ConversationKey): Promise<void> {
    return this.enqueue([key], async () => {
      const current = await this.read(key);
      await this.write(key, { ...current, hintSent: true });
    });
  }

  rekey(fromKey: ConversationKey, toKey: ConversationKey): Promise<void> {
    return this.enqueue([fromKey, toKey], async () => {
      if (fromKey === toKey) return;
      const [from, to] = await Promise.all([this.read(fromKey), this.read(toKey)]);
      await this.write(toKey, mergeRecords(to, from));
      await storage.removeItem(`session:${PREFIX}${fromKey}`);
    });
  }

  importRecord(key: ConversationKey, record: MappingRecord): Promise<void> {
    return this.enqueue([key], async () => {
      const current = await this.read(key);
      await this.write(key, mergeRecords(current, record));
    });
  }

  async exportAll(): Promise<{ key: ConversationKey; record: MappingRecord }[]> {
    const all = await browser.storage.session.get(null);
    const result: { key: ConversationKey; record: MappingRecord }[] = [];
    for (const [storageKey, value] of Object.entries(all)) {
      if (!storageKey.startsWith(PREFIX)) continue;
      const parsed = MappingRecordSchema.safeParse(value);
      if (parsed.success) {
        result.push({
          key: storageKey.slice(PREFIX.length) as ConversationKey,
          record: parsed.data,
        });
      }
    }
    return result;
  }

  async clearAll(): Promise<void> {
    const keys = Object.keys(await browser.storage.session.get(null)).filter((k) =>
      k.startsWith(PREFIX),
    );
    if (keys.length > 0) await browser.storage.session.remove(keys);
  }

  async countConversations(): Promise<number> {
    const all = await browser.storage.session.get(null);
    return Object.keys(all).filter((k) => k.startsWith(PREFIX)).length;
  }
}
