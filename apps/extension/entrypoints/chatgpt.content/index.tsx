/*
  The content script for chatgpt.com. It runs inside the ChatGPT page (in an "isolated world":
  it shares the page's HTML but not its JavaScript variables) and starts everything there:
  the status badge, the send interceptor and the send flow (observe or test-replace).
  Phase 2: Test replace mode uses the REAL detection engine with DEFAULT_POLICY.
  CORE SAFETY RULES: if detection didn't complete, if anything must be blocked, or if we can't
  write the protected text, the message is NOT sent.
*/
import '../../src/styles/ui.css';

import { detect } from '@safeai/detection';
import {
  CATEGORY_LABEL,
  ContentPingRequestSchema,
  DEFAULT_POLICY,
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
import { summarizeProtection, testRedact } from '../../src/content/test-redact';
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

  /** Observe mode: ChatGPT sends normally; we only record metadata (counts, never values). */
  function observe(trigger: Trigger): void {
    const composer = adapter.getComposer();
    if (!composer) return devLog('Send attempt, but the input box was not found');
    const text = adapter.readText(composer);
    if (text.trim() === '') return; // Enter on an empty box doesn't send anything

    devLogText(`Observed send (${trigger})`, text);
    // Run the engine AFTER this event has finished, so ChatGPT's send is never delayed.
    window.setTimeout(() => {
      const result = detect(text, DEFAULT_POLICY);
      logIntercept({
        mode: 'observe',
        charCount: text.length,
        replacedCount: 0,
        method: 'none',
        success: true,
        countsByCategory: result.countsByCategory,
        durationMs: result.durationMs,
        complete: result.complete,
      });
    }, 0);
  }

  /** Replace mode: the original send was BLOCKED. Check it, protect it, then send it ourselves. */
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
          countsByCategory: {},
          durationMs: 0,
          complete: false,
        });
        return;
      }

      const original = adapter.readText(composer);
      if (original.trim() === '') return;
      devLogText(`Original (${trigger})`, original);

      // 1. Run the real detection engine.
      const result = detect(original, DEFAULT_POLICY);
      const metadata = {
        mode: 'replace' as const,
        charCount: original.length,
        countsByCategory: result.countsByCategory,
        durationMs: result.durationMs,
        complete: result.complete,
      };

      // 2. SAFETY RULE: if the check didn't finish, we can't know what's inside — don't send.
      if (!result.complete) {
        badge.showError(
          result.failedDetectors.length > 0
            ? "Couldn't check this message safely — not sent"
            : 'Message too long to check safely — not sent',
        );
        logIntercept({ ...metadata, replacedCount: 0, method: 'none', success: false });
        return;
      }

      // 3. Work out the protected text. "block" items stop the message entirely.
      const redaction = testRedact(original, result.detections);
      if (redaction.blocked.length > 0) {
        const labels = [...new Set(redaction.blocked.map((d) => CATEGORY_LABEL[d.category]))];
        badge.showError(`Not sent: contains ${labels.join(', ')}`);
        logIntercept({ ...metadata, replacedCount: 0, method: 'none', success: false });
        return;
      }

      // 4. Nothing to replace ("warn" items are left as they are in Phase 2): send normally.
      if (redaction.replaced === 0) {
        const sent = await resend(composer);
        if (!sent) badge.showError("Couldn't send — please press Send again");
        logIntercept({ ...metadata, replacedCount: 0, method: 'none', success: sent });
        return;
      }

      // 5. Swap the text inside ChatGPT's editor (verified by reading it back).
      const written = await replaceComposerText(composer, redaction.text);
      if (!written.success) {
        // SAFETY RULE: we couldn't protect it, so we do NOT send it.
        badge.showError("Couldn't protect this message — not sent");
        logIntercept({
          ...metadata,
          replacedCount: redaction.replaced,
          method: 'none',
          success: false,
        });
        return;
      }
      devLogText(`Protected (${written.method})`, adapter.readText(composer));

      // 6. Send the protected version.
      const sent = await resend(composer);
      if (sent) {
        badge.showSuccess(summarizeProtection(redaction.replacedByCategory));
      } else {
        // The box already holds the PROTECTED text, so nothing leaks — the user can press Send.
        badge.showError('Protected, but not sent — please press Send');
      }
      logIntercept({
        ...metadata,
        replacedCount: redaction.replaced,
        method: written.method,
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
