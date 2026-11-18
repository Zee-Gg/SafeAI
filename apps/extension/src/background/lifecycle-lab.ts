/*
  EXPERIMENT: proves that the background service worker "forgets" normal variables.
  Chrome stops an idle service worker after ~30 seconds. When a message arrives, Chrome starts it
  again by re-running this file from the top: `memoryCount` is back to 0 and `workerStartedAt` is
  new. `storageCount` lives in chrome.storage, so it survives. Lesson: never keep important
  state only in worker variables — put it in storage.
*/
import { storageCountItem } from '../lib/storage';

/** When this copy of the worker started (set once, each time the file loads). */
export const workerStartedAt = Date.now();

// A plain variable: lives only as long as this copy of the worker is awake.
let memoryCount = 0;

/** Adds 1 to both counters and returns their new values. */
export async function bumpCounters(): Promise<{ memoryCount: number; storageCount: number }> {
  memoryCount += 1;
  const storageCount = (await storageCountItem.getValue()) + 1;
  await storageCountItem.setValue(storageCount);
  return { memoryCount, storageCount };
}
