/*
  Typed storage items, built with WXT's storage helper (it wraps chrome.storage).
  "local:" means chrome.storage.local — private to the extension, unlike a website's localStorage,
  which the website itself can read. PRIVACY: nothing stored here ever contains prompt text or
  detected values. (Placeholder memory lives ONLY in the service worker: the encrypted vault in
  IndexedDB, or session storage when retention is 0. See src/background/store-manager.ts.)
*/
import type { InterceptRecord, Policy } from '@safeai/shared';
import { storage } from '#imports';

/** User settings shown in the popup. */
export interface Settings {
  /** ON (default) = scan and protect before sending. OFF ("Paused") = only observe. */
  protectionEnabled: boolean;
}

/** Settings used on first install, or when nothing is saved yet. */
export const DEFAULT_SETTINGS: Settings = { protectionEnabled: true };

/** The user's settings. */
export const settingsItem = storage.defineItem<Settings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
});

/**
 * True if protection is on. Anything other than an explicit `false` counts as ON, so an
 * old Phase 1/2 value ({ testReplaceMode }) that hasn't been migrated yet still protects.
 */
export function isProtectionEnabled(settings: Partial<Settings> | null | undefined): boolean {
  return settings?.protectionEnabled !== false;
}

/**
 * Migrates Phase 1/2 settings ({ testReplaceMode }) to { protectionEnabled: true }.
 * Approved in Phase 3 M1: everyone starts with protection ON, whatever the old test switch was.
 * Called by the service worker on install/update. Safe to run more than once.
 */
export async function migrateSettings(): Promise<void> {
  const raw = await storage.getItem<Record<string, unknown>>('local:settings');
  if (raw && typeof raw.protectionEnabled === 'boolean' && !('testReplaceMode' in raw)) return;
  await settingsItem.setValue({ protectionEnabled: true });
}

/** Lifecycle-lab counter that survives the service worker going to sleep. */
export const storageCountItem = storage.defineItem<number>('local:storageCount', {
  fallback: 0,
});

/** Metadata about the most recent send attempt (never the text itself). */
export const lastInterceptItem = storage.defineItem<InterceptRecord | null>('local:lastIntercept', {
  fallback: null,
});

/**
 * DEV BUILDS ONLY: a policy saved from the Detection Playground ("Use these settings in ChatGPT").
 * It may contain custom terms (e.g. client names). In production builds this is `null`, so the
 * bundler removes it completely (not even the storage key name ships).
 */
export const devPolicyOverrideItem = import.meta.env.DEV
  ? storage.defineItem<Policy | null>('local:devPolicyOverride', { fallback: null })
  : null;

/**
 * Phase 4: notes that encrypted placeholder memory couldn't be read (metadata only: a count and
 * a time, never values). The popup shows a notice while unreadableCount > 0; "Clear placeholder
 * memory" resets it.
 */
export interface VaultStatus {
  unreadableCount: number;
  lastFailureAt: number | null;
}

export const vaultStatusItem = storage.defineItem<VaultStatus>('local:vaultStatus', {
  fallback: { unreadableCount: 0, lastFailureAt: null },
});
