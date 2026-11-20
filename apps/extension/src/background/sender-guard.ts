/*
  Who is allowed to send which message (Phase 3 strict router guard, approved in M1).
  Only BROWSER-PROVIDED sender information is trusted (extension id, origin, tab, frame) — never
  anything written inside the message itself. Messages carrying real values must come from our
  ChatGPT content script, in the top frame of a chatgpt.com tab, for the right conversation.
*/
import { storage } from '#imports';
import { browser, type Browser } from 'wxt/browser';

import { devLog } from '../lib/logger';

const CHATGPT_ORIGIN = 'https://chatgpt.com';

// The conversation id in a ChatGPT URL path: "/c/<id>" (also inside project URLs).
const CONVERSATION_IN_PATH = /\/c\/([\w-]{1,128})(?:[/?#]|$)/;

/** The origin of the sender as reported by Chrome (origin, or the URL's origin). */
function senderOrigin(sender: Browser.runtime.MessageSender): string | null {
  if (sender.origin) return sender.origin;
  if (!sender.url) return null;
  try {
    return new URL(sender.url).origin;
  } catch {
    return null;
  }
}

/** True only for our own content script, in the top frame of a https://chatgpt.com tab. */
export function isChatGptContentScript(sender: Browser.runtime.MessageSender): boolean {
  const checks = {
    ownExtension: sender.id === browser.runtime.id,
    chatgptOrigin: senderOrigin(sender) === CHATGPT_ORIGIN,
    inTab: sender.tab?.id !== undefined,
    topFrame: sender.frameId === 0,
  };
  const allowed = Object.values(checks).every(Boolean);
  // Dev builds: which check failed (true/false + the origin only — no URL path, no payload).
  if (!allowed) devLog('Sender guard failed:', checks, 'origin:', senderOrigin(sender));
  return allowed;
}

/**
 * True only for our own extension pages (e.g. the popup), never a web page or content script:
 * the page's URL must start with our extension's own base URL (chrome-extension://<our id>/).
 */
export function isExtensionPage(sender: Browser.runtime.MessageSender): boolean {
  const ownBase = browser.runtime.getURL('/');
  return sender.id === browser.runtime.id && (sender.url ?? '').startsWith(ownBase);
}

/** The conversation id in the sender's URL ("/c/<id>"), or null on a new-chat page. */
export function conversationIdFromSenderUrl(sender: Browser.runtime.MessageSender): string | null {
  if (!sender.url) return null;
  try {
    return CONVERSATION_IN_PATH.exec(new URL(sender.url).pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

/* ---------- New-chat key ownership (kept in session storage, survives the worker sleeping) ---------- */

const OWNERS_KEY = 'session:newKeyOwners';

async function readOwners(): Promise<Record<string, number>> {
  return (await storage.getItem<Record<string, number>>(OWNERS_KEY)) ?? {};
}

/**
 * Checks that `sender` may use conversation `key`:
 * - "chatgpt:<id>": only when the sender's page is that conversation (/c/<id>);
 * - "chatgpt:new:<random>": only the tab that first used it (the first use claims it).
 */
export async function mayUseConversation(
  sender: Browser.runtime.MessageSender,
  key: string,
): Promise<boolean> {
  const tabId = sender.tab?.id;
  if (tabId === undefined) return false;

  if (key.startsWith('chatgpt:new:')) {
    const owners = await readOwners();
    const owner = owners[key];
    if (owner === undefined) {
      owners[key] = tabId; // first use: this tab claims the new-chat key
      await storage.setItem(OWNERS_KEY, owners);
      return true;
    }
    return owner === tabId;
  }

  const id = key.slice('chatgpt:'.length);
  return conversationIdFromSenderUrl(sender) === id;
}

/** After a re-key, the new-chat key is no longer needed: forget who owned it. */
export async function releaseNewKey(key: string): Promise<void> {
  const owners = await readOwners();
  if (!(key in owners)) return;
  delete owners[key];
  await storage.setItem(OWNERS_KEY, owners);
}

/** Forgets all new-chat ownership (used by "Clear placeholder memory"). */
export async function clearNewKeyOwners(): Promise<void> {
  await storage.removeItem(OWNERS_KEY);
}
