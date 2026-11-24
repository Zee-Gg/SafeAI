/*
  The background service worker: the extension's always-available "back office".
  It answers messages from the popup and the content script (via router.ts), sets default
  settings on first install, and (Phase 4) keeps placeholder memory tidy: maintenance at start-up,
  every hour (chrome.alarms) and when the dev policy changes — see store-manager.ts.
  Chrome puts it to sleep when idle and wakes it when needed.
*/
import { defineBackground } from '#imports';
import { browser } from 'wxt/browser';

import { handleMessage } from '../src/background/router';
import { runMaintenance } from '../src/background/store-manager';
import { devLog } from '../src/lib/logger';
import {
  DEFAULT_SETTINGS,
  devPolicyOverrideItem,
  migrateSettings,
  settingsItem,
} from '../src/lib/storage';

const CLEANUP_ALARM = 'safeai-memory-cleanup';
const CLEANUP_EVERY_MINUTES = 60;

export default defineBackground(() => {
  // WHY THIS LISTENER IS ADDED FIRST, SYNCHRONOUSLY (no `await` before it):
  // When the worker is asleep and a message arrives, Chrome starts the worker just to deliver it.
  // Chrome only hands the message to listeners that exist by the time this first run finishes.
  // A listener added later (after an await or a timer) would miss that message.
  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    void handleMessage(message, sender).then(sendResponse);
    // Returning true tells Chrome "I will reply later" (our reply is async), so it keeps the
    // message channel open until sendResponse is called.
    return true;
  });

  // First install: write the default settings (protection ON).
  // Update (e.g. from Phase 2): migrate the old { testReplaceMode } setting to protection ON.
  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') {
      void settingsItem.setValue(DEFAULT_SETTINGS);
      devLog('Installed — default settings saved');
    } else if (reason === 'update') {
      void migrateSettings();
      devLog('Updated — settings migrated');
    }
  });

  // Hourly cleanup. The listener is added synchronously too (same reason as above): the alarm
  // may be what wakes the worker up.
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === CLEANUP_ALARM) void runMaintenance('hourly');
  });
  // Alarms usually survive restarts, but Chrome may drop them (e.g. after an update): re-create
  // it if it's missing.
  void browser.alarms.get(CLEANUP_ALARM).then((existing) => {
    if (!existing) {
      void browser.alarms.create(CLEANUP_ALARM, { periodInMinutes: CLEANUP_EVERY_MINUTES });
    }
  });

  // Every start: move data into the active store (incl. Phase 3 → vault once) and delete
  // expired conversations. Mapping requests wait until this has finished.
  void runMaintenance('startup');

  // Dev builds: a changed Playground policy may change the retention → tidy up straight away.
  devPolicyOverrideItem?.watch(() => {
    void runMaintenance('policy changed');
  });

  devLog('Service worker started');
});
