/*
  Every message the extension parts (popup, content script, background) send to each other.
  Each message has a "type" field, a Zod schema (checked at runtime) and a TypeScript type (checked while coding).
  PRIVACY: messages carry metadata only — never prompt text. Schemas are "strict", so an extra
  field such as `text` is rejected instead of silently passed along.
*/
import { z } from 'zod';

import { DETECTOR_CATEGORIES } from './categories';
import { SITE_IDS } from './sites';

/* ---------- Building blocks ---------- */

/** Schema for a supported site id. */
export const SiteIdSchema = z.enum(SITE_IDS);

/** Schema for a non-negative whole number (counts, timestamps). */
const Count = z.number().int().nonnegative();

/** What happened when a user tried to send a message. Metadata only, no text. */
export const InterceptRecordSchema = z.strictObject({
  /** Which AI site. */
  site: SiteIdSchema,
  /** When it happened (milliseconds since 1970, from Date.now()). */
  at: Count,
  /** How many characters the prompt had (the number only, not the text). */
  charCount: Count,
  /** "observe" = we only watched; "replace" = we changed the text before sending. */
  mode: z.enum(['observe', 'replace']),
  /** How many items were replaced with placeholders. */
  replacedCount: Count,
  /** Which technique changed the text ("none" if nothing was changed). */
  method: z.enum(['insertText', 'paste', 'none']),
  /** False means we could not protect the message, so it was NOT sent. */
  success: z.boolean(),
  /** How many detections per category, e.g. { email: 2, api_key: 1 }. Counts only, never values. */
  countsByCategory: z.partialRecord(z.enum(DETECTOR_CATEGORIES), Count),
  /** How long detection took, in milliseconds. */
  durationMs: z.number().nonnegative(),
  /** false = detection didn't finish (too long / a detector failed), so the message was NOT sent. */
  complete: z.boolean(),
});
export type InterceptRecord = z.infer<typeof InterceptRecordSchema>;

/* ---------- Requests: content script / popup → background ---------- */

/** Asks the background worker for its lifecycle-lab counters. */
export const PingRequestSchema = z.strictObject({ type: z.literal('PING') });

/** Asks the background worker for the last intercept. */
export const GetStatusRequestSchema = z.strictObject({ type: z.literal('GET_STATUS') });

/** Tells the background worker that a send attempt happened. */
export const LogInterceptRequestSchema = z.strictObject({
  type: z.literal('LOG_INTERCEPT'),
  payload: InterceptRecordSchema,
});

/** Any message the background worker accepts. Zod picks the right schema using "type". */
export const BackgroundRequestSchema = z.discriminatedUnion('type', [
  PingRequestSchema,
  GetStatusRequestSchema,
  LogInterceptRequestSchema,
]);
export type BackgroundRequest = z.infer<typeof BackgroundRequestSchema>;

/* ---------- Requests: popup → content script ---------- */

/** The popup asks "is SafeAI running on this tab?". No permission needed. */
export const ContentPingRequestSchema = z.strictObject({ type: z.literal('CONTENT_PING') });
export type ContentPingRequest = z.infer<typeof ContentPingRequestSchema>;

/* ---------- Replies ---------- */

/** Reply to PING. */
export const PingReplySchema = z.strictObject({
  /** Normal variable in the worker: resets when the worker sleeps. */
  memoryCount: Count,
  /** Kept in chrome.storage: survives the worker sleeping. */
  storageCount: Count,
  /** When the worker last started (ms since 1970). */
  workerStartedAt: Count,
});

/** Reply to GET_STATUS. */
export const GetStatusReplySchema = z.strictObject({
  lastIntercept: InterceptRecordSchema.nullable(),
  workerStartedAt: Count,
});

/** Reply to LOG_INTERCEPT. */
export const LogInterceptReplySchema = z.strictObject({ ok: z.literal(true) });

/** Reply to CONTENT_PING. */
export const ContentPingReplySchema = z.strictObject({ site: SiteIdSchema });

/** Reply sent when a message is invalid or something went wrong. */
export const ErrorReplySchema = z.strictObject({ ok: z.literal(false), error: z.string() });
export type ErrorReply = z.infer<typeof ErrorReplySchema>;

/** Which reply schema belongs to which request type. */
export const REPLY_SCHEMAS = {
  PING: PingReplySchema,
  GET_STATUS: GetStatusReplySchema,
  LOG_INTERCEPT: LogInterceptReplySchema,
  CONTENT_PING: ContentPingReplySchema,
} as const;

/** Every message type name, e.g. "PING". */
export type MessageType = keyof typeof REPLY_SCHEMAS;

/** The reply type for a given request type, e.g. ReplyFor<'PING'> = PingReply. */
export type ReplyFor<T extends MessageType> = z.infer<(typeof REPLY_SCHEMAS)[T]>;

export type PingReply = ReplyFor<'PING'>;
export type GetStatusReply = ReplyFor<'GET_STATUS'>;
export type LogInterceptReply = ReplyFor<'LOG_INTERCEPT'>;
export type ContentPingReply = ReplyFor<'CONTENT_PING'>;
