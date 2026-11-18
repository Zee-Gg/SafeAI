/*
  The content script for chatgpt.com. It runs inside the ChatGPT page (in an "isolated world":
  it shares the page's HTML but not its JavaScript variables) and starts everything there:
  the status badge, the send interceptor and the send flow.
  M5: observe mode only — it never blocks a message. Replace mode is wired up in M6.
*/
import '../../src/styles/ui.css';

import { ContentPingRequestSchema, type ContentPingReply } from '@safeai/shared';
import { createShadowRootUi, defineContentScript } from '#imports';
import { createRoot, type Root } from 'react-dom/client';
import { browser } from 'wxt/browser';

import { chatgptAdapter } from '../../src/adapters/chatgpt';
import type { SiteAdapter } from '../../src/adapters/types';
import { startInterceptor, stopInterceptor, type Trigger } from '../../src/content/interceptor';
import { devLog, devLogText } from '../../src/lib/logger';
import { sendToBackground } from '../../src/lib/messaging';
import { createBadgeStore, StatusBadge, type BadgeStore } from '../../src/ui/StatusBadge';

const COMPOSER_WAIT_MS = 15_000;
const COMPOSER_POLL_MS = 500;

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

    // 3. Watch for send attempts.
    startInterceptor(
      adapter,
      () => 'observe',
      (trigger) => handleAttempt(adapter, trigger),
    );

    // 4. Clean up if the extension is reloaded or updated (this copy of the script goes stale).
    ctx.onInvalidated(() => {
      stopInterceptor();
      browser.runtime.onMessage.removeListener(onMessage);
    });

    // 5. Dev builds: show whether our selectors found ChatGPT's input box.
    void reportSelectors(adapter, badge, ctx.signal);
  },
});

/** Runs once per send attempt. Reads the text only to count it — the text never leaves this tab. */
function handleAttempt(adapter: SiteAdapter, trigger: Trigger): void {
  const composer = adapter.getComposer();
  if (!composer) {
    devLog('Send attempt, but the input box was not found');
    return;
  }
  const text = adapter.readText(composer);
  if (text.trim() === '') return; // Enter on an empty box doesn't send anything

  devLogText(`Observed send (${trigger})`, text);

  // PRIVACY: metadata only — the character COUNT, never the characters.
  void sendToBackground({
    type: 'LOG_INTERCEPT',
    payload: {
      site: 'chatgpt',
      at: Date.now(),
      charCount: text.length,
      mode: 'observe',
      replacedCount: 0,
      method: 'none',
      success: true,
    },
  }).then((result) => {
    if (!result.ok) devLog('LOG_INTERCEPT failed:', result.error);
  });
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
    await new Promise((resolve) => setTimeout(resolve, COMPOSER_POLL_MS));
  }

  const check = adapter.checkSelectors();
  devLog('Selector check:', check);
  // The send button only appears after you type, so "–" for it at this point is normal.
  badge.setDevInfo(
    `dev · input ${check.composer ? '✓' : '✗ not found'} · send ${check.sendButton ? '✓' : '– (appears after typing)'}`,
  );
}
