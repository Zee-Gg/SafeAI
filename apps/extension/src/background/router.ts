/*
  The background worker's message router: checks each incoming message with Zod, then decides
  what to do with it. It never throws — bad input gets an { ok: false, error } reply instead.
  PRIVACY: LOG_INTERCEPT is metadata only. Placeholder-memory messages carry real values, so they
  pass the strict sender guard first (sender-guard.ts), and their payloads are NEVER logged.
*/
import {
  BackgroundRequestSchema,
  InterceptRecordSchema,
  MEMORY_UNREADABLE_ERROR,
  type BackgroundRequest,
  type ErrorReply,
  type GetStatusReply,
  type MappingGetReply,
  type MappingStatsReply,
  type OkReply,
  type PingReply,
} from '@safeai/shared';
import { browser, type Browser } from 'wxt/browser';

import { devLog } from '../lib/logger';
import { lastInterceptItem } from '../lib/storage';
import { bumpCounters, workerStartedAt } from './lifecycle-lab';
import { activeStore, clearAllMemory, countAllConversations } from './store-manager';
import { VaultReadError } from './vault-db';
import {
  clearNewKeyOwners,
  isChatGptContentScript,
  isExtensionPage,
  mayUseConversation,
  releaseNewKey,
} from './sender-guard';

/** Every reply the router can send. */
export type BackgroundReply =
  PingReply | GetStatusReply | OkReply | MappingGetReply | MappingStatsReply | ErrorReply;

// Refusals say just "Not allowed". Dev builds add which check refused it (still no values).
const WRONG_CONVERSATION: ErrorReply = {
  ok: false,
  error: import.meta.env.DEV ? 'Not allowed (conversation check)' : 'Not allowed',
};
const WRONG_SENDER: ErrorReply = {
  ok: false,
  error: import.meta.env.DEV ? 'Not allowed (sender check)' : 'Not allowed',
};

/**
 * Who may send each message type. Messages with real values: only the ChatGPT content script.
 * Popup-only tools: only our own extension pages. Everything else: any part of our extension.
 */
function isSenderAllowed(
  type: BackgroundRequest['type'],
  sender: Browser.runtime.MessageSender,
): boolean {
  switch (type) {
    case 'MAPPING_GET':
    case 'MAPPING_SAVE':
    case 'MAPPING_MARK_HINT':
    case 'MAPPING_REKEY':
      return isChatGptContentScript(sender);
    case 'MAPPING_CLEAR_ALL':
    case 'MAPPING_STATS':
      return isExtensionPage(sender);
    default:
      return true;
  }
}

/** Validates one incoming message and returns the reply for it. Never throws. */
export async function handleMessage(
  message: unknown,
  sender: Browser.runtime.MessageSender,
): Promise<BackgroundReply> {
  // Only accept messages from our own extension (popup, extension pages or content script).
  if (sender.id !== browser.runtime.id) {
    return { ok: false, error: 'Unknown sender' };
  }

  const parsed = BackgroundRequestSchema.safeParse(message);
  if (!parsed.success) {
    // Report only the field paths and problems — never the values (they could contain text).
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(message)'}: ${issue.message}`)
      .join('; ');
    devLog('Rejected invalid message:', problems);
    return { ok: false, error: `Invalid message — ${problems}` };
  }

  const request = parsed.data;
  if (!isSenderAllowed(request.type, sender)) {
    devLog('Refused message from a sender that is not allowed:', request.type); // type only
    return WRONG_SENDER;
  }

  try {
    switch (request.type) {
      case 'PING': {
        const counters = await bumpCounters();
        return { ...counters, workerStartedAt };
      }
      case 'GET_STATUS': {
        // A record saved by an older version (without today's fields) doesn't match today's
        // shape: report "nothing yet" instead of sending an invalid reply.
        const stored = InterceptRecordSchema.safeParse(await lastInterceptItem.getValue());
        return { lastIntercept: stored.success ? stored.data : null, workerStartedAt };
      }
      case 'LOG_INTERCEPT': {
        await lastInterceptItem.setValue(request.payload);
        devLog('Intercept logged:', request.payload); // metadata only
        return { ok: true };
      }

      // ---- Placeholder memory: values inside, so nothing below is ever logged. ----
      case 'MAPPING_GET': {
        if (!(await mayUseConversation(sender, request.key))) return WRONG_CONVERSATION;
        return { mapping: await (await activeStore()).getMapping(request.key) };
      }
      case 'MAPPING_SAVE': {
        if (!(await mayUseConversation(sender, request.key))) return WRONG_CONVERSATION;
        await (await activeStore()).saveEntries(request.key, request.entries, request.counters);
        return { ok: true };
      }
      case 'MAPPING_MARK_HINT': {
        if (!(await mayUseConversation(sender, request.key))) return WRONG_CONVERSATION;
        await (await activeStore()).markHintSent(request.key);
        return { ok: true };
      }
      case 'MAPPING_REKEY': {
        // Only a new-chat key can be moved, only by the tab that owns it, and only to the
        // conversation that tab is now showing.
        const allowed =
          request.fromKey.startsWith('chatgpt:new:') &&
          !request.toKey.startsWith('chatgpt:new:') &&
          (await mayUseConversation(sender, request.fromKey)) &&
          (await mayUseConversation(sender, request.toKey));
        if (!allowed) return WRONG_CONVERSATION;
        await (await activeStore()).rekey(request.fromKey, request.toKey);
        await releaseNewKey(request.fromKey);
        return { ok: true };
      }
      case 'MAPPING_CLEAR_ALL': {
        await clearAllMemory(); // both stores + the unreadable-memory notice
        await clearNewKeyOwners();
        return { ok: true };
      }
      case 'MAPPING_STATS': {
        return { conversations: await countAllConversations() };
      }
    }
  } catch (error) {
    // Encrypted memory that can't be decrypted: say so (no details), so the message isn't sent
    // with guessed placeholders and the user can be pointed to the popup.
    if (error instanceof VaultReadError) return { ok: false, error: MEMORY_UNREADABLE_ERROR };
    // Generic message only: errors here could otherwise echo values. Dev: the error's NAME only.
    const name = error instanceof Error ? error.name : typeof error;
    devLog('Handler failed for', request.type, '— error type:', name);
    return {
      ok: false,
      error: import.meta.env.DEV ? `Something went wrong (${name})` : 'Something went wrong',
    };
  }
}
