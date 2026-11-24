/*
  The send flow: what happens on every intercepted send attempt on ChatGPT.
  Protection ON: scan → nothing found? send as typed. Otherwise open the REVIEW PANEL (also for
  "too long" and blocked messages) → your decision → safety re-check → stable placeholders →
  write → verify → save placeholder memory → send → log.
  Protection OFF ("Paused"): ChatGPT sends normally; we only log.
  SAFETY RULES: scan not complete → not sent; a "block" item → not sent; writing/verifying the
  protected text fails → not sent; our own re-send is never intercepted again.
  PRIVACY: real values never logged (not even in dev); logs carry counts/categories/timing only.
*/
import { detect, type DetectResult } from '@safeai/detection';
import {
  CATEGORY_LABEL,
  EMPTY_MAPPING,
  MEMORY_UNREADABLE_ERROR,
  type ConversationKey,
  type InterceptRecord,
  type Policy,
} from '@safeai/shared';
import type { ContentScriptContext } from '#imports';

import type { SiteAdapter } from '../adapters/types';
import { devLog } from '../lib/logger';
import { sendToBackground } from '../lib/messaging';
import { summarizeProtection } from '../ui/protection-text';
import type { ReviewDecision } from '../ui/review/model';
import { openReviewPanel } from '../ui/review/mountReviewPanel';
import type { BadgeStore } from '../ui/StatusBadge';
import type { ConversationTracker } from './conversation';
import { replaceComposerText, type ReplaceMethod } from './editor-writer';
import { allowNextSubmit, type InterceptMode, type Trigger } from './interceptor';
import { getActivePolicy } from './policy-source';
import { buildRedaction, type Redaction } from './redactor';

// Pause before re-sending, so ChatGPT's own code has noticed the new text.
const BEFORE_RESEND_MS = 50;
// After re-sending, ChatGPT empties the input box. We wait up to this long to confirm it.
const SEND_CONFIRM_MS = 1500;

/** What the send flow needs from the rest of the content script. */
export interface SendFlowDeps {
  ctx: ContentScriptContext;
  adapter: SiteAdapter;
  badge: BadgeStore;
  conversation: ConversationTracker;
}

/** Builds the send flow. Call handleAttempt() for every send the interceptor catches. */
export function createSendFlow({ ctx, adapter, badge, conversation }: SendFlowDeps) {
  let busy = false; // true while a message is being reviewed or protected

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
        ...metadataOf(text, result),
        action: 'paused',
        replacedCount: 0,
        method: 'none',
      });
    }, 0);
  }

  /** Protection ON: the original send was BLOCKED. Scan it, review it, then send it ourselves. */
  async function protectAndSend(): Promise<void> {
    if (busy) return; // already handling a message: this extra attempt stays blocked
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

      // 2. Nothing found (and the scan finished) → send exactly as typed. No panel.
      if (result.complete && result.detections.length === 0) {
        const sent = await resend(composer);
        if (!sent) badge.showError("Couldn't send — please press Send again");
        logIntercept({
          ...metadataOf(original, result),
          action: 'sent_clean',
          replacedCount: 0,
          method: 'none',
        });
        return;
      }

      // 3. The panel's preview needs this conversation's placeholders (not for "Too long").
      const key = conversation.currentKey();
      const mapping = result.complete ? await loadMapping(key) : EMPTY_LOADED;
      if (!mapping.ok) {
        badge.showError(memoryError(mapping.error));
        logIntercept({
          ...metadataOf(original, result),
          action: 'write_failed',
          replacedCount: 0,
          method: 'none',
        });
        return;
      }

      // 4. Open the review panel and wait for your decision.
      const panel = await openReviewPanel(ctx, {
        text: original,
        result,
        policy,
        mapping: mapping.data.mapping,
        rescan: (text) => detect(text, policy),
      });
      const decision = await panel.decision;

      if (decision.kind !== 'send') {
        await panel.close();
        if (decision.kind === 'edit') badge.showInfo('Edit your message, then press Enter again');
        logIntercept({
          ...metadataOf(original, result),
          action: result.complete ? 'cancelled' : 'incomplete',
          replacedCount: 0,
          method: 'none',
        });
        adapter.getComposer()?.focus(); // back to ChatGPT's box, text unchanged
        return;
      }

      // 5. Send what you approved (the panel shows a spinner meanwhile), then close the panel.
      await sendApproved(original, decision, policy, key);
      await panel.close();
    } finally {
      busy = false;
    }
  }

  /** Re-checks, protects, writes, verifies, saves and sends the message you approved. */
  async function sendApproved(
    original: string,
    decision: Extract<ReviewDecision, { kind: 'send' }>,
    policy: Policy,
    key: ConversationKey,
  ): Promise<void> {
    // SAFETY: scan the final text again (it may differ after "Remove from message").
    const final = detect(decision.text, policy);
    const metadata = metadataOf(decision.text, final);
    const fail = (
      message: string,
      action: InterceptRecord['action'],
      method: ReplaceMethod = 'none',
    ) => {
      badge.showError(message);
      logIntercept({ ...metadata, action, replacedCount: 0, method });
    };
    if (!final.complete) return fail("Couldn't check this message safely — not sent", 'incomplete');
    const blocked = final.detections.filter((d) => d.action === 'block');
    if (blocked.length > 0) {
      const labels = [...new Set(blocked.map((d) => CATEGORY_LABEL[d.category]))];
      return fail(`Not sent: contains ${labels.join(', ')}`, 'blocked');
    }

    // SAFETY: ChatGPT's box must still hold the message you reviewed.
    const composer = adapter.getComposer();
    if (!composer || adapter.readText(composer) !== original) {
      return fail('Your message changed while reviewing — not sent', 'write_failed');
    }

    // Fresh memory (another tab may have added placeholders to this chat meanwhile).
    const loaded = await loadMapping(key);
    if (!loaded.ok) return fail(memoryError(loaded.error), 'write_failed');
    const redaction = buildRedaction(decision.text, decision.items, loaded.data.mapping, {
      placeholderHint: policy.placeholderHint,
    });

    // Write the final text into ChatGPT's editor and read it back (only if it changed).
    let method: ReplaceMethod = 'none';
    if (redaction.redactedText !== original) {
      const written = await replaceComposerText(composer, redaction.redactedText);
      if (!written.success) return fail("Couldn't protect this message — not sent", 'write_failed');
      method = written.method;
    }

    // Remember the new placeholders BEFORE sending: the box already shows them, so even if the
    // automatic send fails and you press Send yourself, the memory stays consistent.
    await saveMapping(key, redaction);

    const sent = await resend(composer);
    if (sent) {
      conversation.afterSave(key); // a brand-new chat → move its memory to the real id
      if (redaction.replacedCount > 0)
        badge.showSuccess(summarizeProtection(redaction.replacedByCategory));
    } else {
      badge.showError(
        redaction.replacedCount > 0
          ? 'Protected, but not sent — please press Send'
          : "Couldn't send — please press Send again",
      );
    }
    const action: InterceptRecord['action'] = !sent
      ? 'write_failed'
      : redaction.replacedCount > 0
        ? 'protected'
        : final.detections.length > 0
          ? 'sent_unredacted'
          : 'sent_clean';
    logIntercept({ ...metadata, action, replacedCount: redaction.replacedCount, method });
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

/** Log metadata of a scan: counts, timing and length only — never text. */
function metadataOf(text: string, result: DetectResult) {
  return {
    charCount: text.length,
    countsByCategory: result.countsByCategory,
    durationMs: result.durationMs,
    complete: result.complete,
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

/** Stand-in "loaded memory" for the Too long state, which shows no placeholders. */
const EMPTY_LOADED = {
  ok: true as const,
  data: { mapping: EMPTY_MAPPING },
};

/** The badge text when placeholder memory is unavailable (dev builds add the reason). */
function memoryError(reason: string): string {
  // Phase 4: encrypted memory that can't be decrypted. Never guess placeholders: don't send.
  if (reason === MEMORY_UNREADABLE_ERROR) {
    return "Placeholder memory can't be read — not sent. Open SafeAI's popup";
  }
  const detail = import.meta.env.DEV ? ` (dev: ${reason})` : '';
  return `Couldn't load placeholder memory — not sent${detail}`;
}

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
