/*
  Small helpers for stable placeholders like [EMAIL_1]:
  - matchKey: when do two values count as "the same" (so they share one placeholder)?
  - nextFreeNumber: the next number for a label, skipping numbers whose placeholder text already
    appears in the user's message (so a placeholder never collides with real text).
*/
import { normalizeTerm } from '@safeai/detection';
import { isCustomTermCategory, PLACEHOLDER_LABEL, type DetectorCategory } from '@safeai/shared';

/** Highest number used per label in one conversation, e.g. { EMAIL: 2, API_KEY: 1 }. */
export type PlaceholderCounters = Record<string, number>;

/** Builds a placeholder, e.g. ("EMAIL", 3) → "[EMAIL_3]". */
export function formatPlaceholder(label: string, n: number): string {
  return `[${label}_${n}]`;
}

/**
 * The key used to decide if two values are "the same" for placeholder reuse:
 * emails ignore upper/lower case; custom terms use the engine's normalization (case, Unicode
 * look-alikes, extra spaces); everything else must match exactly. The label is part of the key,
 * so the same text in two different categories gets two placeholders.
 */
export function matchKey(category: DetectorCategory, value: string): string {
  const label = PLACEHOLDER_LABEL[category];
  let comparable = value;
  if (category === 'email') comparable = value.toLowerCase();
  else if (isCustomTermCategory(category)) comparable = normalizeTerm(value);
  return `${label}\u0000${comparable}`;
}

/**
 * The next number for `label`: one above the highest used so far, then skipping any number whose
 * placeholder (e.g. "[EMAIL_3]") already appears literally in `text`.
 */
export function nextFreeNumber(label: string, counters: PlaceholderCounters, text: string): number {
  let n = (counters[label] ?? 0) + 1;
  while (text.includes(formatPlaceholder(label, n))) n++;
  return n;
}
