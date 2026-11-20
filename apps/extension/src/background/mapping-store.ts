/*
  Placeholder memory ("mapping"): which placeholder stands for which real value, per conversation.
  Lives ONLY in the service worker, in chrome.storage.session: kept in memory, wiped when the
  browser closes, and not readable by content scripts by default. The MappingStore interface
  lets Phase 4 swap in an encrypted, longer-lived store without changing any caller.
  PRIVACY: values are never logged and never written to chrome.storage.local.
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
  /** Forgets every conversation. */
  clearAll(): Promise<void>;
  /** How many conversations are remembered (a count only). */
  countConversations(): Promise<number>;
}

/** Prefix of every mapping key in session storage, e.g. "mapping:chatgpt:abc". */
const PREFIX = 'mapping:';

/** Merges two records: entries de-duplicated by placeholder, counters take the higher number. */
function merge(base: MappingRecord, extra: MappingRecord): MappingRecord {
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

/** The Phase 3 implementation, on chrome.storage.session. */
export class SessionMappingStore implements MappingStore {
  /** Per-conversation queue: each write waits for the previous one, so none is lost. */
  private readonly queues = new Map<string, Promise<unknown>>();

  /** Runs `task` after every earlier task for the same keys has finished. */
  private enqueue<T>(keys: readonly string[], task: () => Promise<T>): Promise<T> {
    const previous = Promise.all(keys.map((k) => this.queues.get(k) ?? Promise.resolve()));
    const run = previous.then(task, task);
    const settled = run.catch(() => undefined);
    for (const k of keys) this.queues.set(k, settled);
    return run;
  }

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
    return this.enqueue([key], async () => {
      const current = await this.read(key);
      await this.write(key, merge(current, { entries: [...entries], counters: { ...counters }, hintSent: false }));
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
      await this.write(toKey, merge(to, from));
      await storage.removeItem(`session:${PREFIX}${fromKey}`);
    });
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

/** The store the router uses. Phase 4 replaces this line with an encrypted store. */
export const mappingStore: MappingStore = new SessionMappingStore();
