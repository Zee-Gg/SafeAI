/*
  The encrypted placeholder vault (Phase 4): the default MappingStore. Each conversation's memory
  is one AES-GCM encrypted IndexedDB record (see vault-db.ts), kept for the policy's
  mappingRetentionDays after it was last used, then deleted by the hourly cleanup.
  NEVER GUESS: if a record can't be decrypted, reading it throws VaultReadError (the message is
  then not sent, and the popup shows a notice). A record that can't be read is never overwritten.
  PRIVACY: decrypted values exist only briefly in this worker's memory; never logged.
*/
import {
  EMPTY_MAPPING,
  MappingRecordSchema,
  type ConversationKey,
  type MappingEntry,
  type MappingRecord,
} from '@safeai/shared';

import { vaultStatusItem } from '../lib/storage';
import { createKeyQueue, mergeRecords, type MappingStore } from './mapping-store';
import {
  clearRows,
  countRows,
  decryptRow,
  deleteRow,
  encryptFor,
  getAllRows,
  getRow,
  putRow,
  VaultReadError,
  type VaultRow,
} from './vault-db';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Notes (metadata only: a count and a time) that a record couldn't be decrypted. */
async function noteUnreadable(): Promise<void> {
  const current = await vaultStatusItem.getValue();
  await vaultStatusItem.setValue({
    unreadableCount: current.unreadableCount + 1,
    lastFailureAt: Date.now(),
  });
}

export class EncryptedMappingStore implements MappingStore {
  private readonly enqueue = createKeyQueue();

  /** Decrypts and validates a row. Unreadable → noted and VaultReadError thrown. */
  private async decode(row: VaultRow): Promise<MappingRecord> {
    try {
      const parsed = MappingRecordSchema.safeParse(await decryptRow(row));
      if (!parsed.success) throw new VaultReadError();
      return parsed.data;
    } catch {
      await noteUnreadable();
      throw new VaultReadError();
    }
  }

  /** The current record (empty if none). Throws VaultReadError if it exists but can't be read. */
  private async read(key: ConversationKey): Promise<MappingRecord> {
    const row = await getRow(key);
    return row ? this.decode(row) : { ...EMPTY_MAPPING };
  }

  private async write(key: ConversationKey, record: MappingRecord): Promise<void> {
    const { iv, data } = await encryptFor(key, record);
    await putRow({ conversation: key, iv, data, lastUsedAt: Date.now() });
  }

  getMapping(key: ConversationKey): Promise<MappingRecord> {
    return this.enqueue([key], async () => {
      const row = await getRow(key);
      if (!row) return { ...EMPTY_MAPPING };
      const record = await this.decode(row);
      // Using a conversation keeps it alive: retention counts from the last use.
      await putRow({ ...row, lastUsedAt: Date.now() });
      return record;
    });
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
      await deleteRow(fromKey);
    });
  }

  importRecord(key: ConversationKey, record: MappingRecord): Promise<void> {
    return this.enqueue([key], async () => {
      const current = await this.read(key); // throws if unreadable: never overwrite it
      await this.write(key, mergeRecords(current, record));
    });
  }

  async exportAll(): Promise<{ key: ConversationKey; record: MappingRecord }[]> {
    const result: { key: ConversationKey; record: MappingRecord }[] = [];
    for (const row of await getAllRows()) {
      try {
        result.push({ key: row.conversation as ConversationKey, record: await this.decode(row) });
      } catch {
        // Unreadable: skipped (already noted). It can't be moved, only cleared.
      }
    }
    return result;
  }

  /** Deletes conversations not used for more than `days` days. Returns how many were deleted. */
  async deleteExpired(days: number, now = Date.now()): Promise<number> {
    const cutoff = now - days * DAY_MS;
    let deleted = 0;
    for (const row of await getAllRows()) {
      if (row.lastUsedAt >= cutoff) continue;
      // Check again inside the queue: the chat may have been used a moment ago.
      const removed = await this.enqueue([row.conversation], async () => {
        const fresh = await getRow(row.conversation);
        if (!fresh || fresh.lastUsedAt >= cutoff) return false;
        await deleteRow(row.conversation);
        return true;
      });
      if (removed) deleted++;
    }
    return deleted;
  }

  async clearAll(): Promise<void> {
    await clearRows();
  }

  countConversations(): Promise<number> {
    return countRows();
  }
}
