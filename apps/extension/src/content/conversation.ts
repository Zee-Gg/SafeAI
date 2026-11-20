/*
  Which ChatGPT conversation are we in? The key is "chatgpt:<id>" from the URL (/c/<id>), or
  "chatgpt:new:<random>" for a brand-new chat that has no id yet. ChatGPT is a single-page app,
  so we follow URL changes with WXT's `wxt:locationchange` event. When a new chat gets its real
  id after the first send, its placeholder memory is re-keyed to "chatgpt:<id>".
*/
import type { ConversationKey } from '@safeai/shared';
import type { ContentScriptContext } from '#imports';

import { devLog } from '../lib/logger';
import { sendToBackground } from '../lib/messaging';

// The conversation id in a ChatGPT URL path: "/c/<id>" (also inside project URLs /g/…/c/<id>).
const CONVERSATION_IN_PATH = /\/c\/([\w-]{1,128})(?:[/?#]|$)/;

/** The conversation id in a ChatGPT URL, or null on a new-chat page. */
export function conversationIdFromUrl(url: string): string | null {
  try {
    return CONVERSATION_IN_PATH.exec(new URL(url).pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** A fresh key for a chat that has no id yet (random, so two new chats never share memory). */
function newChatKey(): ConversationKey {
  return `chatgpt:new:${crypto.randomUUID()}`;
}

/** Tracks the current conversation key and re-keys new chats. */
export interface ConversationTracker {
  /** The key for the conversation on screen right now. */
  currentKey(): ConversationKey;
  /**
   * Call AFTER placeholders for `savedKey` were saved. If it was a new chat, its memory is moved
   * to the real id — now if ChatGPT already shows it, otherwise as soon as the URL changes.
   */
  afterSave(savedKey: ConversationKey): void;
}

/** Starts tracking (listens to WXT's location-change event until the script is invalidated). */
export function createConversationTracker(
  ctx: ContentScriptContext,
  onChange?: (key: ConversationKey) => void,
): ConversationTracker {
  const keyForUrl = (url: string): ConversationKey => {
    const id = conversationIdFromUrl(url);
    return id ? `chatgpt:${id}` : newChatKey();
  };

  let key = keyForUrl(location.href);
  let pendingRekeyFrom: ConversationKey | null = null;

  const rekey = (fromKey: ConversationKey, toKey: ConversationKey) => {
    void sendToBackground({ type: 'MAPPING_REKEY', fromKey, toKey }).then((result) => {
      if (!result.ok) devLog('Re-key failed:', result.error); // keys only, never values
    });
  };

  ctx.addEventListener(window, 'wxt:locationchange', ({ newUrl }) => {
    const id = conversationIdFromUrl(newUrl.href);
    if (id) {
      const realKey: ConversationKey = `chatgpt:${id}`;
      if (pendingRekeyFrom) {
        rekey(pendingRekeyFrom, realKey);
        pendingRekeyFrom = null;
      }
      key = realKey;
    } else {
      // Back on a new-chat page: a fresh, empty memory.
      key = newChatKey();
      pendingRekeyFrom = null;
    }
    onChange?.(key);
  });

  return {
    currentKey: () => key,
    afterSave(savedKey) {
      if (!savedKey.startsWith('chatgpt:new:')) return;
      const id = conversationIdFromUrl(location.href);
      if (id) {
        // ChatGPT already gave the chat its id before our save finished: re-key right away.
        rekey(savedKey, `chatgpt:${id}`);
        key = `chatgpt:${id}`;
      } else {
        pendingRekeyFrom = savedKey; // re-key when the URL changes
      }
    },
  };
}
