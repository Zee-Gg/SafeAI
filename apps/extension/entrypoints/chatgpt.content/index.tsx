/*
  The content script for chatgpt.com. It runs inside the ChatGPT page (in an "isolated world":
  it shares the page's HTML but not its JavaScript variables) and starts everything there:
  the status badge, the active policy, conversation tracking, the send interceptor and the
  send flow (src/content/send-flow.ts). Protection is ON by default; OFF = "Paused" (observe only).
*/
import '../../src/styles/ui.css';

import { ContentPingRequestSchema, type ContentPingReply } from '@safeai/shared';
import { createShadowRootUi, defineContentScript } from '#imports';
import { createRoot, type Root } from 'react-dom/client';
import { browser } from 'wxt/browser';

import { chatgptAdapter } from '../../src/adapters/chatgpt';
import type { SiteAdapter } from '../../src/adapters/types';
import { createConversationTracker } from '../../src/content/conversation';
import { startInterceptor, stopInterceptor, type InterceptMode } from '../../src/content/interceptor';
import { isDevOverrideActive, startPolicySource } from '../../src/content/policy-source';
import { createSendFlow } from '../../src/content/send-flow';
import { devLog } from '../../src/lib/logger';
import { isProtectionEnabled, settingsItem } from '../../src/lib/storage';
import { createBadgeStore, StatusBadge } from '../../src/ui/StatusBadge';

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

    // 3. Dev builds: the badge's small dev line (selector check, conversation, override).
    const devInfo = { selectors: '', chat: '' };
    const refreshDevInfo = () => {
      if (!import.meta.env.DEV) return;
      const override = isDevOverrideActive() ? ' · dev policy' : '';
      badge.setDevInfo(`dev · ${devInfo.selectors}${devInfo.chat}${override}`);
    };

    // 4. Policy: DEFAULT_POLICY, or (dev builds only) the Playground override.
    const unwatchPolicy = await startPolicySource(refreshDevInfo);

    // 5. Which conversation are we in? (Follows ChatGPT's URL changes; re-keys new chats.)
    const describeChat = (key: string) =>
      key.startsWith('chatgpt:new:') ? ' · chat: new' : ` · chat: ${key.slice(8, 16)}…`;
    const conversation = createConversationTracker(ctx, (key) => {
      devInfo.chat = describeChat(key);
      refreshDevInfo();
    });
    devInfo.chat = describeChat(conversation.currentKey());

    // 6. Protection setting (ON by default), WATCHED so the popup switch works instantly.
    let mode: InterceptMode = 'replace';
    const applySettings = (enabled: boolean) => {
      mode = enabled ? 'replace' : 'observe';
      badge.setMode(enabled ? 'protecting' : 'paused');
    };
    applySettings(isProtectionEnabled(await settingsItem.getValue()));
    const unwatchSettings = settingsItem.watch((settings) =>
      applySettings(isProtectionEnabled(settings)),
    );

    // 7. Watch for send attempts. getMode is read at the moment of each event.
    const flow = createSendFlow({ adapter, badge, conversation });
    startInterceptor(
      adapter,
      () => mode,
      (trigger, attemptMode) => flow.handleAttempt(trigger, attemptMode),
    );

    // 8. Clean up if the extension is reloaded or updated (this copy of the script goes stale).
    ctx.onInvalidated(() => {
      stopInterceptor();
      browser.runtime.onMessage.removeListener(onMessage);
      unwatchSettings();
      unwatchPolicy();
    });

    // 9. Dev builds: check that our selectors find ChatGPT's input box.
    void reportSelectors(adapter, ctx.signal, (text) => {
      devInfo.selectors = text;
      refreshDevInfo();
    });
  },
});

/** Waits for ChatGPT's input box to appear, then reports the selector check (dev only). */
async function reportSelectors(
  adapter: SiteAdapter,
  signal: AbortSignal,
  report: (text: string) => void,
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
  report(
    `input ${check.composer ? '✓' : '✗ not found'} · send ${check.sendButton ? '✓' : '–'}`,
  );
}
