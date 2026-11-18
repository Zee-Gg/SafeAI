/*
  The background worker's message router: checks each incoming message with Zod, then decides
  what to do with it. It never throws — bad input gets an { ok: false, error } reply instead.
  PRIVACY: LOG_INTERCEPT payloads are metadata only; the strict schema rejects any extra field.
*/
import {
  BackgroundRequestSchema,
  type ErrorReply,
  type GetStatusReply,
  type LogInterceptReply,
  type PingReply,
} from '@safeai/shared';
import { browser, type Browser } from 'wxt/browser';

import { devLog } from '../lib/logger';
import { lastInterceptItem } from '../lib/storage';
import { bumpCounters, workerStartedAt } from './lifecycle-lab';

/** Every reply the router can send. */
export type BackgroundReply = PingReply | GetStatusReply | LogInterceptReply | ErrorReply;

/** Validates one incoming message and returns the reply for it. Never throws. */
export async function handleMessage(
  message: unknown,
  sender: Browser.runtime.MessageSender,
): Promise<BackgroundReply> {
  // Only accept messages from our own extension (popup or content script).
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

  try {
    const request = parsed.data;
    switch (request.type) {
      case 'PING': {
        const counters = await bumpCounters();
        return { ...counters, workerStartedAt };
      }
      case 'GET_STATUS': {
        return { lastIntercept: await lastInterceptItem.getValue(), workerStartedAt };
      }
      case 'LOG_INTERCEPT': {
        await lastInterceptItem.setValue(request.payload);
        devLog('Intercept logged:', request.payload);
        return { ok: true };
      }
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
