/*
  Every message the extension parts (popup, content script, background) send to each other.
  Each message has a "type" field, a Zod schema (checked at runtime) and a TypeScript type (checked while coding).
  PRIVACY: messages carry metadata only — EXCEPT the four placeholder-memory messages
  (MAPPING_GET / SAVE / MARK_HINT / REKEY), which may carry real values between the ChatGPT
  content script and our own service worker only (the router enforces who may send them).
  Schemas are "strict", so an unexpected extra field is rejected instead of passed along.
*/
import { z } from 'zod';

import { DETECTOR_CATEGORIES } from './categories';
import { SITE_IDS } from './sites';

/* ---------- Building blocks ---------- */

/** Schema for a supported site id. */
export const SiteIdSchema = z.enum(SITE_IDS);

/** Schema for a non-negative whole number (counts, timestamps). */
const Count = z.number().int().nonnegative();

/** What SafeAI did with one send attempt. */
export const InterceptActionSchema = z.enum([
  'protected', // values replaced with placeholders, then sent
  'sent_clean', // nothing found, sent as typed
  'sent_unredacted', // findings existed, but the user sent without replacing any
  'cancelled', // the user cancelled or chose "Edit message"
  'blocked', // a "block" item stopped the message
  'incomplete', // the scan didn't finish, so the message wasn't sent
  'write_failed', // the protected text couldn't be written/verified, so it wasn't sent
  'paused', // protection is off: sent unchanged, only observed
]);
export type InterceptAction = z.infer<typeof InterceptActionSchema>;

/** What happened when a user tried to send a message. Metadata only, no text. */
export const InterceptRecordSchema = z.strictObject({
  /** Which AI site. */
  site: SiteIdSchema,
  /** When it happened (milliseconds since 1970, from Date.now()). */
  at: Count,
  /** What SafeAI did. */
  action: InterceptActionSchema,
  /** How many characters the prompt had (the number only, not the text). */
  charCount: Count,
  /** How many items were replaced with placeholders. */
  replacedCount: Count,
  /** Which technique changed the text ("none" if nothing was changed). */
  method: z.enum(['insertText', 'paste', 'none']),
  /** How many detections per category, e.g. { email: 2, api_key: 1 }. Counts only, never values. */
  countsByCategory: z.partialRecord(z.enum(DETECTOR_CATEGORIES), Count),
  /** How long detection took, in milliseconds. */
  durationMs: z.number().nonnegative(),
  /** false = detection didn't finish (too long / a detector failed), so the message was NOT sent. */
  complete: z.boolean(),
});
export type InterceptRecord = z.infer<typeof InterceptRecordSchema>;

/* ---------- Placeholder memory (mapping) ---------- */

/**
 * A conversation key: "chatgpt:<id>" for a saved chat (the id from /c/<id>), or
 * "chatgpt:new:<random>" for a brand-new chat that has no id yet.
 */
export const ConversationKeySchema = z
  .string()
  .regex(/^chatgpt:(?:new:[\da-f-]{8,64}|[\w-]{1,128})$/); // the two exact formats above
export type ConversationKey = z.infer<typeof ConversationKeySchema>;

/** One placeholder and the real value it stands for. */
export const MappingEntrySchema = z.strictObject({
  /** e.g. "[EMAIL_1]": square brackets, capital label, underscore, number. */
  placeholder: z.string().regex(/^\[[A-Z_]+_\d{1,6}\]$/), // the [LABEL_n] format
  /** The real value. Only ever kept in the service worker's session memory. */
  value: z.string().min(1).max(10_000),
  category: z.enum(DETECTOR_CATEGORIES),
  createdAt: Count,
});
export type MappingEntry = z.infer<typeof MappingEntrySchema>;

/** Highest number used per label, e.g. { EMAIL: 2, API_KEY: 1 }. */
export const PlaceholderCountersSchema = z.record(z.string().regex(/^[A-Z_]+$/), Count); // label → n

/** Everything SafeAI remembers about one conversation's placeholders. */
export const MappingRecordSchema = z.strictObject({
  entries: z.array(MappingEntrySchema).max(5_000),
  counters: PlaceholderCountersSchema,
  /** Whether the "(Note: keep any [LABEL_n] placeholders…)" line was already sent. */
  hintSent: z.boolean(),
});
export type MappingRecord = z.infer<typeof MappingRecordSchema>;

/** An empty record, for a conversation SafeAI hasn't protected anything in yet. */
export const EMPTY_MAPPING: MappingRecord = { entries: [], counters: {}, hintSent: false };

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

/** ChatGPT content script only: get one conversation's placeholder memory (contains values). */
export const MappingGetRequestSchema = z.strictObject({
  type: z.literal('MAPPING_GET'),
  key: ConversationKeySchema,
});

/** ChatGPT content script only: add new entries and the updated counters. */
export const MappingSaveRequestSchema = z.strictObject({
  type: z.literal('MAPPING_SAVE'),
  key: ConversationKeySchema,
  entries: z.array(MappingEntrySchema).max(1_000),
  counters: PlaceholderCountersSchema,
});

/** ChatGPT content script only: remember that the placeholder hint line was sent. */
export const MappingMarkHintRequestSchema = z.strictObject({
  type: z.literal('MAPPING_MARK_HINT'),
  key: ConversationKeySchema,
});

/** ChatGPT content script only: a new chat got its real id, so move its memory to that key. */
export const MappingRekeyRequestSchema = z.strictObject({
  type: z.literal('MAPPING_REKEY'),
  fromKey: ConversationKeySchema,
  toKey: ConversationKeySchema,
});

/** Popup only: forget all placeholder memory. */
export const MappingClearAllRequestSchema = z.strictObject({
  type: z.literal('MAPPING_CLEAR_ALL'),
});

/** Popup only: how many conversations are in placeholder memory (a count, never values). */
export const MappingStatsRequestSchema = z.strictObject({ type: z.literal('MAPPING_STATS') });

/** Any message the background worker accepts. Zod picks the right schema using "type". */
export const BackgroundRequestSchema = z.discriminatedUnion('type', [
  PingRequestSchema,
  GetStatusRequestSchema,
  LogInterceptRequestSchema,
  MappingGetRequestSchema,
  MappingSaveRequestSchema,
  MappingMarkHintRequestSchema,
  MappingRekeyRequestSchema,
  MappingClearAllRequestSchema,
  MappingStatsRequestSchema,
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

/** Simple "done" reply (LOG_INTERCEPT and the mapping writes). */
export const OkReplySchema = z.strictObject({ ok: z.literal(true) });

/** Reply to LOG_INTERCEPT. */
export const LogInterceptReplySchema = OkReplySchema;

/** Reply to MAPPING_GET. */
export const MappingGetReplySchema = z.strictObject({ mapping: MappingRecordSchema });

/** Reply to MAPPING_STATS. */
export const MappingStatsReplySchema = z.strictObject({ conversations: Count });

/** Reply to CONTENT_PING. */
export const ContentPingReplySchema = z.strictObject({ site: SiteIdSchema });

/**
 * Phase 4: the error text when encrypted placeholder memory can't be decrypted. The content
 * script recognises it (and doesn't send the message); it never carries any details.
 */
export const MEMORY_UNREADABLE_ERROR = 'Placeholder memory unreadable';

/** Reply sent when a message is invalid, not allowed, or something went wrong. */
export const ErrorReplySchema = z.strictObject({ ok: z.literal(false), error: z.string() });
export type ErrorReply = z.infer<typeof ErrorReplySchema>;

/** Which reply schema belongs to which request type. */
export const REPLY_SCHEMAS = {
  PING: PingReplySchema,
  GET_STATUS: GetStatusReplySchema,
  LOG_INTERCEPT: LogInterceptReplySchema,
  MAPPING_GET: MappingGetReplySchema,
  MAPPING_SAVE: OkReplySchema,
  MAPPING_MARK_HINT: OkReplySchema,
  MAPPING_REKEY: OkReplySchema,
  MAPPING_CLEAR_ALL: OkReplySchema,
  MAPPING_STATS: MappingStatsReplySchema,
  CONTENT_PING: ContentPingReplySchema,
} as const;

/** Every message type name, e.g. "PING". */
export type MessageType = keyof typeof REPLY_SCHEMAS;

/** The reply type for a given request type, e.g. ReplyFor<'PING'> = PingReply. */
export type ReplyFor<T extends MessageType> = z.infer<(typeof REPLY_SCHEMAS)[T]>;

export type PingReply = ReplyFor<'PING'>;
export type GetStatusReply = ReplyFor<'GET_STATUS'>;
export type OkReply = z.infer<typeof OkReplySchema>;
export type LogInterceptReply = ReplyFor<'LOG_INTERCEPT'>;
export type MappingGetReply = ReplyFor<'MAPPING_GET'>;
export type MappingStatsReply = ReplyFor<'MAPPING_STATS'>;
export type ContentPingReply = ReplyFor<'CONTENT_PING'>;
