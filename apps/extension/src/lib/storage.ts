/*
  Typed storage items, built with WXT's storage helper (it wraps chrome.storage).
  "local:" means chrome.storage.local — private to the extension, unlike a website's localStorage,
  which the website itself can read. PRIVACY: nothing stored here ever contains prompt text.
*/
import type { InterceptRecord } from '@safeai/shared';
import { storage } from '#imports';

/** User settings shown in the popup. */
export interface Settings {
  /** ON = swap emails for [EMAIL_1]… before sending (Phase 1 test). OFF = only observe. */
  testReplaceMode: boolean;
}

/** Settings used on first install, or when nothing is saved yet. */
export const DEFAULT_SETTINGS: Settings = { testReplaceMode: false };

/** The user's settings. */
export const settingsItem = storage.defineItem<Settings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
});

/** Lifecycle-lab counter that survives the service worker going to sleep. */
export const storageCountItem = storage.defineItem<number>('local:storageCount', {
  fallback: 0,
});

/** Metadata about the most recent send attempt (never the text itself). */
export const lastInterceptItem = storage.defineItem<InterceptRecord | null>('local:lastIntercept', {
  fallback: null,
});
