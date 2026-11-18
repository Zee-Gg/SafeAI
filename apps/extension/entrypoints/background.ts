/*
  The background service worker: the extension's always-available "back office".
  It answers messages from the popup and the content script (via router.ts) and sets default
  settings on first install. Chrome puts it to sleep when idle and wakes it when needed.
*/
import { defineBackground } from '#imports';
import { browser } from 'wxt/browser';

import { handleMessage } from '../src/background/router';
import { devLog } from '../src/lib/logger';
import { DEFAULT_SETTINGS, settingsItem } from '../src/lib/storage';

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

  // First install: write the default settings so every part of the extension sees the same values.
  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') {
      void settingsItem.setValue(DEFAULT_SETTINGS);
      devLog('Installed — default settings saved');
    }
  });

  devLog('Service worker started');
});
