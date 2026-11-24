/*
  Finds placeholders (and the agreed variations) in a piece of text, for on-screen restoring.
  Pure: no DOM, no messages. A match is only used when its LABEL and NUMBER belong to a
  placeholder this conversation really has. Never guess.
  Accepted forms (Phase 4 answer 1), for a known [EMAIL_1]:
    [EMAIL_1]   [ EMAIL_1 ]   [EMAIL 1]   [EMAIL-1]   [Email_1] / [email_1]   EMAIL_1 (capitals, whole word)
  Not accepted: [EMAIL] (no number), Email 1 (no brackets AND changed), [EMAIL_01].
  "Longest first": numbers are read whole, so [EMAIL_10] is EMAIL_10, never EMAIL_1 + "0".
  Streaming safety: a form that might still be growing is not matched yet ("[EMAIL_1" without
  "]", or a bare EMAIL_1 at the very end of the text), so a half-arrived [EMAIL_10] is never
  shown as EMAIL_1's value.
*/
import type { DetectorCategory, MappingEntry } from '@safeai/shared';

/** A real value and its category, looked up by "LABEL_n" (e.g. "EMAIL_1"). */
export interface RestoreValue {
  value: string;
  category: DetectorCategory;
}

/** All placeholders of the current conversation: "EMAIL_1" → its value. */
export type RestoreTable = ReadonlyMap<string, RestoreValue>;

/** One place in a text to show a real value instead. */
export interface Restoration {
  start: number;
  end: number;
  value: string;
}

// [LABEL_n] with optional spaces inside the brackets, "_", " " or "-" before the number, any
// letter case. Quantifiers are bounded, so the search stays linear.
const BRACKETED = String.raw`\[ {0,2}([A-Za-z][A-Za-z_]{0,29}?)[ _\-](\d{1,6}) {0,2}\]`;
// LABEL_n without brackets: capitals only, a whole word, not right after "[" (a bracketed form
// still arriving), and followed by a character that isn't a letter, digit, "_" or "]".
const BARE = String.raw`(?<![\w[])([A-Z][A-Z_]{0,29})_(\d{1,6})(?=[^\w\]])`;
const PATTERN = new RegExp(`${BRACKETED}|${BARE}`, 'g');

/** Builds the lookup table from a conversation's placeholder memory. */
export function buildRestoreTable(entries: readonly MappingEntry[]): Map<string, RestoreValue> {
  const table = new Map<string, RestoreValue>();
  for (const entry of entries) {
    // "[EMAIL_1]" → "EMAIL_1"
    table.set(entry.placeholder.slice(1, -1), { value: entry.value, category: entry.category });
  }
  return table;
}

/** Every known placeholder (or accepted variation) in `text`, left to right. */
export function findRestorations(text: string, table: RestoreTable): Restoration[] {
  if (table.size === 0) return [];
  const found: Restoration[] = [];
  PATTERN.lastIndex = 0;
  for (let match = PATTERN.exec(text); match !== null; match = PATTERN.exec(text)) {
    const [whole, bracketLabel, bracketNumber, bareLabel, bareNumber] = match;
    const label = bracketLabel !== undefined ? bracketLabel.toUpperCase() : bareLabel;
    const number = bracketNumber ?? bareNumber;
    if (label === undefined || number === undefined) continue;
    const known = table.get(`${label}_${number}`);
    if (known)
      found.push({ start: match.index, end: match.index + whole.length, value: known.value });
  }
  return found;
}
