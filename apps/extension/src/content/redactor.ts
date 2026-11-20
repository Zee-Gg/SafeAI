/*
  The redactor: turns the items the user chose to protect into stable placeholders.
  Values already in this conversation's memory reuse their placeholder; new values get the next
  free number for their label. Replacement runs from the END of the text backwards so earlier
  positions stay correct. Adds the one-time hint line when needed. Pure: no messages, no storage.
*/
import {
  PLACEHOLDER_LABEL,
  type DetectorCategory,
  type MappingEntry,
  type MappingRecord,
} from '@safeai/shared';

import {
  formatPlaceholder,
  matchKey,
  nextFreeNumber,
  type PlaceholderCounters,
} from './placeholders';

/** The line added (once per conversation) so the AI keeps placeholders intact. */
export const HINT_LINE = '(Note: keep any [LABEL_n] placeholders exactly as written.)';

/** One thing to replace: where it is in the text, its value and its category. */
export interface RedactionItem {
  start: number;
  end: number;
  value: string;
  category: DetectorCategory;
}

/** The placeholder chosen for each item, plus the memory changes this would cause. */
export interface PlaceholderPlan {
  /** The kept items (sorted by position, overlaps removed) with their placeholders. */
  assignments: { item: RedactionItem; placeholder: string }[];
  /** Placeholders this conversation hasn't used before (to save in the service worker). */
  newEntries: MappingEntry[];
  /** The counters after these new placeholders. */
  counters: PlaceholderCounters;
}

/** What buildRedaction returns. */
export interface Redaction extends PlaceholderPlan {
  /** The text ChatGPT will receive. */
  redactedText: string;
  /** True when the hint line was added (the caller then marks it as sent for this chat). */
  hintNeeded: boolean;
  /** How many places in the text were replaced. */
  replacedCount: number;
  /** How many replacements per category (for the badge message). */
  replacedByCategory: Partial<Record<DetectorCategory, number>>;
}

/**
 * Decides the placeholder for every item WITHOUT changing the text (also used by the review
 * panel's "What ChatGPT will see" preview). Items are sorted by position; an item overlapping an
 * earlier one is dropped. Reuses this conversation's placeholders; new values get new numbers.
 */
export function planPlaceholders(
  text: string,
  items: readonly RedactionItem[],
  mapping: MappingRecord,
  now = Date.now(),
): PlaceholderPlan {
  const counters: PlaceholderCounters = { ...mapping.counters };
  const known = new Map<string, string>();
  for (const entry of mapping.entries) known.set(matchKey(entry.category, entry.value), entry.placeholder);

  const sorted = [...items]
    .filter((item) => item.start >= 0 && item.end <= text.length && item.end > item.start)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const assignments: PlaceholderPlan['assignments'] = [];
  const newEntries: MappingEntry[] = [];
  let lastEnd = -1;
  for (const item of sorted) {
    if (item.start < lastEnd) continue; // overlaps the previous kept item
    lastEnd = item.end;

    const key = matchKey(item.category, item.value);
    let placeholder = known.get(key);
    if (placeholder === undefined) {
      const label = PLACEHOLDER_LABEL[item.category];
      const n = nextFreeNumber(label, counters, text);
      counters[label] = n;
      placeholder = formatPlaceholder(label, n);
      known.set(key, placeholder);
      newEntries.push({ placeholder, value: item.value, category: item.category, createdAt: now });
    }
    assignments.push({ item, placeholder });
  }
  return { assignments, newEntries, counters };
}

/**
 * Builds the protected text: every chosen item replaced by its stable placeholder (working from
 * the end backwards), plus the hint line when `placeholderHint` is on, at least one placeholder is
 * used, and this conversation hasn't had the hint yet.
 */
export function buildRedaction(
  text: string,
  items: readonly RedactionItem[],
  mapping: MappingRecord,
  options: { placeholderHint: boolean },
): Redaction {
  const plan = planPlaceholders(text, items, mapping);

  let redactedText = text;
  const replacedByCategory: Partial<Record<DetectorCategory, number>> = {};
  for (let i = plan.assignments.length - 1; i >= 0; i--) {
    const assignment = plan.assignments[i];
    if (!assignment) continue;
    const { item, placeholder } = assignment;
    redactedText = redactedText.slice(0, item.start) + placeholder + redactedText.slice(item.end);
    replacedByCategory[item.category] = (replacedByCategory[item.category] ?? 0) + 1;
  }

  const replacedCount = plan.assignments.length;
  const hintNeeded = options.placeholderHint && replacedCount > 0 && !mapping.hintSent;
  if (hintNeeded) redactedText = `${redactedText}\n\n${HINT_LINE}`;

  return { ...plan, redactedText, hintNeeded, replacedCount, replacedByCategory };
}
