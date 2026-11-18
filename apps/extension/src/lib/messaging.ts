/*
  Safe helpers for sending messages between the extension parts.
  Every outgoing message is checked against its Zod schema BEFORE it is sent (so a message with an
  extra field like `text` never leaves), and every reply is checked before we trust it.
*/
import {
  BackgroundRequestSchema,
  ContentPingReplySchema,
  ContentPingRequestSchema,
  ErrorReplySchema,
  REPLY_SCHEMAS,
  type BackgroundRequest,
  type ContentPingReply,
  type ContentPingRequest,
  type ReplyFor,
} from '@safeai/shared';
import { browser } from 'wxt/browser';

/** Either the data we wanted, or a readable error. Callers must check `ok` first. */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** Turns anything that was thrown into a readable message. */
function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Sends a message to the background worker, waits for the reply and validates it. */
export async function sendToBackground<T extends BackgroundRequest['type']>(
  message: Extract<BackgroundRequest, { type: T }>,
): Promise<Result<ReplyFor<T>>> {
  // 1. Check our own message first (privacy safety net).
  const outgoing = BackgroundRequestSchema.safeParse(message);
  if (!outgoing.success) {
    return { ok: false, error: `Refused to send invalid ${message.type} message` };
  }

  // 2. Send it. This throws if the background could not be reached.
  let reply: unknown;
  try {
    reply = await browser.runtime.sendMessage(outgoing.data);
  } catch (error) {
    return { ok: false, error: `Background unreachable: ${toMessage(error)}` };
  }

  // 3. The background may have answered with an error.
  const errorReply = ErrorReplySchema.safeParse(reply);
  if (errorReply.success) return { ok: false, error: errorReply.data.error };

  // 4. Check the reply has the shape we expect for this message type.
  const parsed = REPLY_SCHEMAS[message.type].safeParse(reply);
  if (!parsed.success) return { ok: false, error: `Unexpected reply to ${message.type}` };

  // TypeScript can't link REPLY_SCHEMAS[T] to ReplyFor<T> by itself; the schema check above makes this safe.
  return { ok: true, data: parsed.data as ReplyFor<T> };
}

/**
 * Asks the SafeAI content script in a tab "are you there?". Needs no extra permission.
 * Fails (ok: false) when the tab has no SafeAI content script, e.g. any site other than ChatGPT.
 */
export async function pingContentScript(tabId: number): Promise<Result<ContentPingReply>> {
  const message: ContentPingRequest = ContentPingRequestSchema.parse({ type: 'CONTENT_PING' });
  let reply: unknown;
  try {
    reply = await browser.tabs.sendMessage(tabId, message);
  } catch (error) {
    return { ok: false, error: `No SafeAI on this tab: ${toMessage(error)}` };
  }
  const parsed = ContentPingReplySchema.safeParse(reply);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, error: 'Unexpected reply to CONTENT_PING' };
}
