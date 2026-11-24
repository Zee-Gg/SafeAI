/*
  Chooses where placeholder memory lives and keeps it tidy (Phase 4):
  - mappingRetentionDays > 0 (default 7): the encrypted vault (vault-store.ts).
  - mappingRetentionDays = 0: memory only (session storage), wiped when the browser closes.
  The service worker reads the retention from the policy ITSELF (DEFAULT_POLICY, or the dev
  override in dev builds); it never trusts a retention value sent in a message.
  "Maintenance" runs at start-up, every hour (chrome.alarms) and when the dev policy changes:
  1. moves data into the active store, then empties the other one (this also moves Phase 3's
     session data into the vault once, after the update);
  2. deletes vault conversations not used for longer than the retention period.
  Mapping requests wait for any running maintenance, so they never see half-moved data.
*/
import { DEFAULT_POLICY, PolicySchema } from '@safeai/shared';

import { devLog } from '../lib/logger';
import { devPolicyOverrideItem, vaultStatusItem } from '../lib/storage';
import { SessionMappingStore, type MappingStore } from './mapping-store';
import { EncryptedMappingStore } from './vault-store';

const sessionStore = new SessionMappingStore();
const vaultStore = new EncryptedMappingStore();

/** The retention from the policy the worker itself trusts (default 7 days). */
export async function getRetentionDays(): Promise<number> {
  if (import.meta.env.DEV && devPolicyOverrideItem) {
    const override = PolicySchema.safeParse(await devPolicyOverrideItem.getValue());
    if (override.success) return override.data.mappingRetentionDays;
  }
  return DEFAULT_POLICY.mappingRetentionDays;
}

let maintenance: Promise<void> = Promise.resolve();

/** The store to use right now (waits for any running maintenance first). */
export async function activeStore(): Promise<MappingStore> {
  await maintenance;
  return (await getRetentionDays()) === 0 ? sessionStore : vaultStore;
}

/** Starts maintenance (queued behind any maintenance already running). Never throws. */
export function runMaintenance(reason: string): Promise<void> {
  maintenance = maintenance.then(async () => {
    try {
      const days = await getRetentionDays();
      const [from, to] = days === 0 ? [vaultStore, sessionStore] : [sessionStore, vaultStore];
      const moved = await moveAll(from, to);
      const expired = days > 0 ? await vaultStore.deleteExpired(days) : 0;
      devLog('Maintenance', reason, '— moved:', moved, 'expired:', expired); // counts only
    } catch (error) {
      devLog('Maintenance failed:', error instanceof Error ? error.name : typeof error);
    }
  });
  return maintenance;
}

/**
 * Moves every conversation from one store to the other, then empties the source. If any record
 * couldn't be moved, the source is kept (tried again next time) — except unreadable vault
 * records when switching to memory-only: those can never be read, and 0 days means "don't keep".
 */
async function moveAll(from: MappingStore, to: MappingStore): Promise<number> {
  const records = await from.exportAll();
  let failed = 0;
  for (const { key, record } of records) {
    try {
      await to.importRecord(key, record);
    } catch {
      failed++;
    }
  }
  if (failed === 0 && (records.length > 0 || (await from.countConversations()) > 0)) {
    await from.clearAll();
  }
  return records.length - failed;
}

/** "Clear placeholder memory": both stores, plus the unreadable-memory notice. */
export async function clearAllMemory(): Promise<void> {
  await maintenance;
  await Promise.all([sessionStore.clearAll(), vaultStore.clearAll()]);
  await vaultStatusItem.setValue({ unreadableCount: 0, lastFailureAt: null });
}

/** How many conversations are remembered, in both stores (a count only). */
export async function countAllConversations(): Promise<number> {
  await maintenance;
  const [a, b] = await Promise.all([
    sessionStore.countConversations(),
    vaultStore.countConversations(),
  ]);
  return a + b;
}
