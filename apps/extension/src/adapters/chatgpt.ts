/*
  ChatGPT's adapter: where the input box and send button are, and how to read the typed text.
  ALL ChatGPT selectors live in SELECTORS below. They are GUESSES based on ChatGPT's current
  page and will break when ChatGPT changes its HTML — when that happens, only this file changes.
  Each entry is a list of fallbacks, tried in order.
*/
import { devLog } from '../lib/logger';
import type { SiteAdapter } from './types';

/** CSS selectors for ChatGPT's page, best guess first. */
export const SELECTORS = {
  /** The input box: a contenteditable ProseMirror <div> (older versions used a <textarea>). */
  composer: [
    '#prompt-textarea',
    'div.ProseMirror[contenteditable="true"]',
    'form div[contenteditable="true"]',
    'textarea[name="prompt-textarea"]',
  ],
  /** The send button (the arrow). It usually only appears once text is typed. */
  sendButton: [
    '[data-testid="send-button"]',
    '#composer-submit-button',
    'button[aria-label="Send prompt"]',
    'form button[type="submit"]',
  ],
  /**
   * Phase 4: one message in the conversation. ChatGPT marks each one with its author
   * ("user" = your sent message, "assistant" = a reply).
   */
  message: ['[data-message-author-role]'],
} as const;

const COMPOSER_SELECTOR = SELECTORS.composer.join(', ');
const SEND_BUTTON_SELECTOR = SELECTORS.sendButton.join(', ');
const MESSAGE_SELECTOR = SELECTORS.message.join(', ');

/** Returns the first element matching any selector in the list (tried in order). */
function findFirst(selectors: readonly string[]): HTMLElement | null {
  for (const selector of selectors) {
    const found = document.querySelector<HTMLElement>(selector);
    if (found) return found;
  }
  return null;
}

/** The ChatGPT implementation of SiteAdapter. */
export const chatgptAdapter: SiteAdapter = {
  id: 'chatgpt',

  getComposer: () => findFirst(SELECTORS.composer),

  isInsideComposer: (el) => el.closest(COMPOSER_SELECTOR) !== null,

  getSendButton: () => findFirst(SELECTORS.sendButton),

  // closest() also matches when the click lands on the arrow icon INSIDE the button.
  isSendButton: (el) => el.closest(SEND_BUTTON_SELECTOR) !== null,

  messageSelector: MESSAGE_SELECTOR,

  findMessage: (node) => {
    const element = node instanceof Element ? node : node.parentElement;
    return element?.closest<HTMLElement>(MESSAGE_SELECTOR) ?? null;
  },

  getMessages: () => [...document.querySelectorAll<HTMLElement>(MESSAGE_SELECTOR)],

  isReply: (message) => message.getAttribute('data-message-author-role') === 'assistant',

  readText: (composer) => {
    if (composer instanceof HTMLTextAreaElement) return composer.value;
    // innerText (not textContent) keeps the line breaks between ProseMirror paragraphs.
    return composer.innerText;
  },

  checkSelectors: () => {
    const result = {
      composer: findFirst(SELECTORS.composer) !== null,
      sendButton: findFirst(SELECTORS.sendButton) !== null,
    };
    if (!result.composer) {
      devLog(
        'ChatGPT input box NOT found. Selectors tried:',
        SELECTORS.composer,
        '→ Right-click the input box → Inspect, and add its id/attributes to SELECTORS.composer in src/adapters/chatgpt.ts',
      );
    }
    return result;
  },
};
