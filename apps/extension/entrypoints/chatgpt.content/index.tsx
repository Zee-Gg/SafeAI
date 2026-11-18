/*
  The content script for chatgpt.com. It runs inside the ChatGPT page (in an "isolated world":
  it shares the page's HTML but not its JavaScript variables) and starts everything there:
  the status badge, the send interceptor and the send flow (observe or test-replace).
  CORE SAFETY RULE: in replace mode, if we can't protect a message, we DON'T send it.
*/
import '../../src/styles/ui.css';

import {
  ContentPingRequestSchema,
  type ContentPingReply,
  type InterceptRecord,
} from '@safeai/shared';
import { createShadowRootUi, defineContentScript } from '#imports';
import { createRoot, type Root } from 'react-dom/client';
import { browser } from 'wxt/browser';

import { chatgptAdapter } from '../../src/adapters/chatgpt';
import type { SiteAdapter } from '../../src/adapters/types';
import { replaceComposerText } from '../../src/content/editor-writer';
import {
  allowNextSubmit,
  startInterceptor,
  stopInterceptor,
  type InterceptMode,
  type Trigger,
} from '../../src/content/interceptor';
import { transformForTest } from '../../src/content/test-transform';
import { devLog, devLogText } from '../../src/lib/logger';
import { sendToBackground } from '../../src/lib/messaging';
import { settingsItem } from '../../src/lib/storage';
import { createBadgeStore, StatusBadge, type BadgeStore } from '../../src/ui/StatusBadge';

const COMPOSER_WAIT_MS = 15_000;
const COMPOSER_POLL_MS = 500;
// Pause before re-sending, so ChatGPT's own code has noticed the new text.
const BEFORE_RESEND_MS = 50;
// After re-sending, ChatGPT empties the input box. We wait up to this long to confirm it.
const SEND_CONFIRM_MS = 1500;

export default defineContentScript({
  matches: ['https://chatgpt.com/*'],
  // Put our CSS inside the badge's Shadow DOM instead of the page, so it can't affect ChatGPT.
  cssInjectionMode: 'ui',

  async main(ctx) {
    const adapter = chatgptAdapter;
    const badge = createBadgeStore();

    // 1. The badge, mounted inside a Shadow DOM at the end of <body>.
    const ui = await createShadowRootUi<Root>(ctx, {
      name: 'safeai-badge',
      position: 'inline',
      anchor: 'body',
      append: 'last',
      onMount(container) {
        // React shouldn't render straight into <body>, so we add a wrapper <div> first.
        const wrapper = document.createElement('div');
        container.append(wrapper);
        const root = createRoot(wrapper);
        root.render(<StatusBadge store={badge} />);
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });
    ui.mount();

    // 2. Answer the popup's "are you there?" (CONTENT_PING). Ignore every other message.
    const onMessage = (
      message: unknown,
      _sender: unknown,
      sendResponse: (reply: ContentPingReply) => void,
    ) => {
      if (!ContentPingRequestSchema.safeParse(message).success) return false;
      sendResponse({ site: 'chatgpt' });
      return false; // we replied synchronously
    };
    browser.runtime.onMessage.addListener(onMessage);

    // 3. Read the "Test replace mode" setting, and WATCH it so the popup toggle works instantly.
    let mode: InterceptMode = 'observe';
    const applySettings = (testReplaceMode: boolean) => {
      mode = testReplaceMode ? 'replace' : 'observe';
      badge.setMode(testReplaceMode ? 'replaceOn' : 'observing');
    };
    applySettings((await settingsItem.getValue()).testReplaceMode);
    const unwatchSettings = settingsItem.watch((settings) =>
      applySettings(settings?.testReplaceMode ?? false),
    );

    // 4. Watch for send attempts. getMode is read at the moment of each event.
    const flow = createSendFlow(adapter, badge);
    startInterceptor(
      adapter,
      () => mode,
      (trigger, attemptMode) => flow.handleAttempt(trigger, attemptMode),
    );

    // 5. Clean up if the extension is reloaded or updated (this copy of the script goes stale).
    ctx.onInvalidated(() => {
      stopInterceptor();
      browser.runtime.onMessage.removeListener(onMessage);
      unwatchSettings();
    });

    // 6. Dev builds: show whether our selectors found ChatGPT's input box.
    void reportSelectors(adapter, badge, ctx.signal);
  },
});

/** Builds the send flow: what happens on each send attempt in observe and replace mode. */
function createSendFlow(adapter: SiteAdapter, badge: BadgeStore) {
  let busy = false; // true while a replace is in progress

  /** Observe mode: ChatGPT sends normally; we only record metadata. */
  function observe(trigger: Trigger): void {
    const composer = adapter.getComposer();
    if (!composer) return devLog('Send attempt, but the input box was not found');
    const text = adapter.readText(composer);
    if (text.trim() === '') return; // Enter on an empty box doesn't send anything

    devLogText(`Observed send (${trigger})`, text);
    logIntercept({
      mode: 'observe',
      charCount: text.length,
      replacedCount: 0,
      method: 'none',
      success: true,
    });
  }

  /** Replace mode: the original send was BLOCKED. Protect the text, then send it ourselves. */
  async function replaceAndSend(trigger: Trigger): Promise<void> {
    if (busy) return devLog('Already protecting a message — this attempt was blocked and ignored');
    busy = true;
    try {
      const composer = adapter.getComposer();
      if (!composer) {
        badge.showError("Couldn't find ChatGPT's input box — not sent");
        logIntercept({
          mode: 'replace',
          charCount: 0,
          replacedCount: 0,
          method: 'none',
          success: false,
        });
        return;
      }

      const original = adapter.readText(composer);
      if (original.trim() === '') return;
      const { text: protectedText, count } = transformForTest(original);
      devLogText(`Original (${trigger})`, original);

      // Nothing to protect: just let it go.
      if (count === 0) {
        const sent = await resend(composer);
        if (!sent) badge.showError("Couldn't send — please press Send again");
        logIntercept({
          mode: 'replace',
          charCount: original.length,
          replacedCount: 0,
          method: 'none',
          success: sent,
        });
        return;
      }

      // Swap the text inside ChatGPT's editor (verified by reading it back).
      const result = await replaceComposerText(composer, protectedText);
      if (!result.success) {
        // SAFETY RULE: we couldn't protect it, so we do NOT send it.
        badge.showError("Couldn't protect this message — not sent");
        logIntercept({
          mode: 'replace',
          charCount: original.length,
          replacedCount: count,
          method: 'none',
          success: false,
        });
        return;
      }
      devLogText(`Protected (${result.method})`, adapter.readText(composer));

      const sent = await resend(composer);
      if (sent) {
        badge.showSuccess(`Replaced ${count} email${count === 1 ? '' : 's'}`);
      } else {
        // The box already holds the PROTECTED text, so nothing leaks — the user can press Send.
        badge.showError('Protected, but not sent — please press Send');
      }
      logIntercept({
        mode: 'replace',
        charCount: original.length,
        replacedCount: count,
        method: result.method,
        success: sent,
      });
    } finally {
      busy = false;
    }
  }

  /** Re-sends the message ourselves (bypassing our own interceptor). True if ChatGPT took it. */
  async function resend(composer: HTMLElement): Promise<boolean> {
    await wait(BEFORE_RESEND_MS);

    // Preferred: click ChatGPT's own send button.
    const button = adapter.getSendButton();
    if (button && !(button instanceof HTMLButtonElement && button.disabled)) {
      allowNextSubmit();
      button.click();
      if (await waitForEmptyComposer()) return true;
    }

    // Fallback: press Enter inside the editor.
    allowNextSubmit();
    composer.focus();
    composer.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        bubbles: true,
        cancelable: true,
      }),
    );
    return waitForEmptyComposer();
  }

  /** ChatGPT empties the input box once a message is sent — we use that as confirmation. */
  async function waitForEmptyComposer(): Promise<boolean> {
    const deadline = Date.now() + SEND_CONFIRM_MS;
    while (Date.now() < deadline) {
      await wait(100);
      const composer = adapter.getComposer(); // ChatGPT may have swapped the element
      if (!composer || adapter.readText(composer).trim() === '') return true;
    }
    return false;
  }

  return {
    /** Called by the interceptor once per send attempt. */
    handleAttempt(trigger: Trigger, attemptMode: InterceptMode): void {
      if (attemptMode === 'observe') observe(trigger);
      else void replaceAndSend(trigger);
    },
  };
}

/** Sends metadata about one attempt to the background. PRIVACY: counts only, never text. */
function logIntercept(fields: Omit<InterceptRecord, 'site' | 'at'>): void {
  void sendToBackground({
    type: 'LOG_INTERCEPT',
    payload: { site: 'chatgpt', at: Date.now(), ...fields },
  }).then((result) => {
    if (!result.ok) devLog('LOG_INTERCEPT failed:', result.error);
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Waits for ChatGPT's input box to appear, then shows the selector check on the badge (dev only). */
async function reportSelectors(
  adapter: SiteAdapter,
  badge: BadgeStore,
  signal: AbortSignal,
): Promise<void> {
  if (!import.meta.env.DEV) return;

  // ChatGPT is a single-page app: the input box is added after the page loads, so we poll briefly.
  const deadline = Date.now() + COMPOSER_WAIT_MS;
  while (!adapter.getComposer() && Date.now() < deadline && !signal.aborted) {
    await wait(COMPOSER_POLL_MS);
  }

  const check = adapter.checkSelectors();
  devLog('Selector check:', check);
  // The send button only appears after you type, so "–" for it at this point is normal.
  badge.setDevInfo(
    `dev · input ${check.composer ? '✓' : '✗ not found'} · send ${check.sendButton ? '✓' : '– (appears after typing)'}`,
  );
}
