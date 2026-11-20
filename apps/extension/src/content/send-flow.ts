/*
  The send flow: what happens on every intercepted send attempt on ChatGPT.
  Protection ON: scan → (M3/M4: review panel) → stable placeholders → write → verify → send →
  save placeholder memory → log. Protection OFF ("Paused"): ChatGPT sends normally; we only log.
  M2: no panel yet — every "redact" item is protected directly, through the new redactor and the
  service worker's placeholder memory, so stable placeholders can already be tested by hand.
  SAFETY RULES: scan not complete → not sent; a "block" item → not sent; writing/verifying the
  protected text fails → not sent; our own re-send is never intercepted again.
  PRIVACY: real values never logged (not even in dev); logs carry counts/categories/timing only.
*/
import { detect } from '@safeai/detection';
import {
  CATEGORY_LABEL,
  type ConversationKey,
  type InterceptRecord,
} from '@safeai/shared';

import type { SiteAdapter } from '../adapters/types';
import { devLog } from '../lib/logger';
import { sendToBackground } from '../lib/messaging';
import { summarizeProtection } from '../ui/protection-text';
import type { BadgeStore } from '../ui/StatusBadge';
import type { ConversationTracker } from './conversation';
import { replaceComposerText } from './editor-writer';
import { allowNextSubmit, type InterceptMode, type Trigger } from './interceptor';
import { getActivePolicy } from './policy-source';
import { buildRedaction, type Redaction } from './redactor';

// Pause before re-sending, so ChatGPT's own code has noticed the new text.
const BEFORE_RESEND_MS = 50;
// After re-sending, ChatGPT empties the input box. We wait up to this long to confirm it.
const SEND_CONFIRM_MS = 1500;

/** What the send flow needs from the rest of the content script. */
export interface SendFlowDeps {
  adapter: SiteAdapter;
  badge: BadgeStore;
  conversation: ConversationTracker;
}

/** Builds the send flow. Call handleAttempt() for every send the interceptor catches. */
export function createSendFlow({ adapter, badge, conversation }: SendFlowDeps) {
  let busy = false; // true while a message is being protected

  /** Paused: ChatGPT sends normally; we only record metadata (counts, never values). */
  function observe(): void {
    const composer = adapter.getComposer();
    if (!composer) return;
    const text = adapter.readText(composer);
    if (text.trim() === '') return; // Enter on an empty box doesn't send anything

    // Run the engine AFTER this event has finished, so ChatGPT's send is never delayed.
    window.setTimeout(() => {
      const result = detect(text, getActivePolicy());
      logIntercept({
        action: 'paused',
        charCount: text.length,
        replacedCount: 0,
        method: 'none',
        countsByCategory: result.countsByCategory,
        durationMs: result.durationMs,
        complete: result.complete,
      });
    }, 0);
  }

  /** Protection ON: the original send was BLOCKED. Check it, protect it, then send it ourselves. */
  async function protectAndSend(): Promise<void> {
    if (busy) return; // already protecting a message: this extra attempt stays blocked
    busy = true;
    try {
      const composer = adapter.getComposer();
      if (!composer) {
        badge.showError("Couldn't find ChatGPT's input box — not sent");
        logIntercept({ ...EMPTY_METADATA, action: 'write_failed' });
        return;
      }
      const original = adapter.readText(composer);
      if (original.trim() === '') return;

      // 1. Scan with the active policy.
      const policy = getActivePolicy();
      const result = detect(original, policy);
      const metadata = {
        charCount: original.length,
        countsByCategory: result.countsByCategory,
        durationMs: result.durationMs,
        complete: result.complete,
      };

      // 2. SAFETY: not complete → we can't know what's inside → don't send.
      if (!result.complete) {
        badge.showError(
          result.failedDetectors.length > 0
            ? "Couldn't check this message safely — not sent"
            : 'Message too long to check safely — not sent',
        );
        logIntercept({ ...metadata, action: 'incomplete', replacedCount: 0, method: 'none' });
        return;
      }

      // 3. SAFETY: any "block" item stops the message.
      const blocked = result.detections.filter((d) => d.action === 'block');
      if (blocked.length > 0) {
        const labels = [...new Set(blocked.map((d) => CATEGORY_LABEL[d.category]))];
        badge.showError(`Not sent: contains ${labels.join(', ')}`);
        logIntercept({ ...metadata, action: 'blocked', replacedCount: 0, method: 'none' });
        return;
      }

      // 4. M2 (no panel yet): protect every "redact" item. Nothing to redact → send as typed.
      const items = result.detections.filter((d) => d.action === 'redact');
      if (items.length === 0) {
        const sent = await resend(composer);
        if (!sent) badge.showError("Couldn't send — please press Send again");
        const action = result.detections.length === 0 ? 'sent_clean' : 'sent_unredacted';
        logIntercept({ ...metadata, action, replacedCount: 0, method: 'none' });
        return;
      }

      // 5. Stable placeholders: load this conversation's memory from the service worker.
      const key = conversation.currentKey();
      const loaded = await loadMapping(key);
      if (!loaded.ok) {
        // Dev builds: show WHY (an error reason like "Not allowed" — never a value).
        const reason = import.meta.env.DEV ? ` (dev: ${loaded.error})` : '';
        badge.showError(`Couldn't load placeholder memory — not sent${reason}`);
        logIntercept({ ...metadata, action: 'write_failed', replacedCount: 0, method: 'none' });
        return;
      }
      const redaction = buildRedaction(original, items, loaded.data.mapping, {
        placeholderHint: policy.placeholderHint,
      });

      // 6. Write the protected text into ChatGPT's editor and verify it (read back).
      const written = await replaceComposerText(composer, redaction.redactedText);
      if (!written.success) {
        badge.showError("Couldn't protect this message — not sent");
        logIntercept({
          ...metadata,
          action: 'write_failed',
          replacedCount: redaction.replacedCount,
          method: 'none',
        });
        return;
      }

      // 7. Remember the new placeholders now: the box already shows them, so even if the
      //    automatic send fails and you press Send yourself, the memory stays consistent.
      await saveMapping(key, redaction);

      // 8. Send the protected version.
      const sent = await resend(composer);
      if (sent) {
        conversation.afterSave(key); // a brand-new chat → move its memory to the real id
        badge.showSuccess(summarizeProtection(redaction.replacedByCategory));
      } else {
        badge.showError('Protected, but not sent — please press Send');
      }
      logIntercept({
        ...metadata,
        action: sent ? 'protected' : 'write_failed',
        replacedCount: redaction.replacedCount,
        method: written.method,
      });
    } finally {
      busy = false;
    }
  }

  /** Re-sends the message ourselves (bypassing our own interceptor). True if ChatGPT took it. */
  async function resend(composer: HTMLElement): Promise<boolean> {
    await wait(BEFORE_RESEND_MS);

    // Preferred: click ChatGPT's own send button.
    const button = adapter.getSendButton();
    if (button && !(button instanceof HTMLButtonElement && button.disabled)) {
      allowNextSubmit();
      button.click();
      if (await waitForEmptyComposer()) return true;
    }

    // Fallback: press Enter inside the editor.
    allowNextSubmit();
    composer.focus();
    composer.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        bubbles: true,
        cancelable: true,
      }),
    );
    return waitForEmptyComposer();
  }

  /** ChatGPT empties the input box once a message is sent — we use that as confirmation. */
  async function waitForEmptyComposer(): Promise<boolean> {
    const deadline = Date.now() + SEND_CONFIRM_MS;
    while (Date.now() < deadline) {
      await wait(100);
      const composer = adapter.getComposer(); // ChatGPT may have swapped the element
      if (!composer || adapter.readText(composer).trim() === '') return true;
    }
    return false;
  }

  return {
    /** Called by the interceptor once per send attempt ("observe" = protection paused). */
    handleAttempt(_trigger: Trigger, mode: InterceptMode): void {
      if (mode === 'observe') observe();
      else void protectAndSend();
    },
  };
}

/** Metadata for attempts that never got as far as a scan. */
const EMPTY_METADATA = {
  charCount: 0,
  replacedCount: 0,
  method: 'none' as const,
  countsByCategory: {},
  durationMs: 0,
  complete: false,
};

/** This conversation's placeholder memory from the service worker (or why it's unavailable). */
async function loadMapping(key: ConversationKey) {
  const result = await sendToBackground({ type: 'MAPPING_GET', key });
  if (!result.ok) devLog('Placeholder memory unavailable:', result.error); // reason only, never values
  return result;
}

/** Saves the new placeholders (and the hint status) in the service worker's memory. */
async function saveMapping(key: ConversationKey, redaction: Redaction): Promise<void> {
  if (redaction.newEntries.length > 0) {
    const saved = await sendToBackground({
      type: 'MAPPING_SAVE',
      key,
      entries: redaction.newEntries,
      counters: redaction.counters,
    });
    if (!saved.ok) devLog('Saving placeholder memory failed:', saved.error);
  }
  if (redaction.hintNeeded) {
    const marked = await sendToBackground({ type: 'MAPPING_MARK_HINT', key });
    if (!marked.ok) devLog('Marking the hint failed:', marked.error);
  }
}

/** Sends metadata about one attempt to the background. PRIVACY: counts only, never text. */
function logIntercept(fields: Omit<InterceptRecord, 'site' | 'at'>): void {
  void sendToBackground({
    type: 'LOG_INTERCEPT',
    payload: { site: 'chatgpt', at: Date.now(), ...fields },
  }).then((result) => {
    if (!result.ok) devLog('LOG_INTERCEPT failed:', result.error);
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
