/*
  The review panel's logic, kept apart from its look (no React here): turns a scan result plus
  your choices into the rows you see, the items to protect, the preview pieces and the summary.
  Rows are per VALUE (same category + same text), so ticking a row covers every place it appears,
  and your choices survive a re-scan (they are matched by category + value, not by position).
*/
import type { Confidence, DetectResult } from '@safeai/detection';
import {
  CATEGORY_GROUP,
  type CategoryGroup,
  type DetectorCategory,
  type MappingRecord,
  type Policy,
} from '@safeai/shared';

import { planPlaceholders, type RedactionItem } from '../../content/redactor';

/** Everything the panel needs to open. Real values: kept only in the panel, never stored. */
export interface ReviewInput {
  /** The message as you typed it. */
  text: string;
  /** The scan of `text`. */
  result: DetectResult;
  /** The policy used for the scan (decides locked rows). */
  policy: Policy;
  /** This conversation's placeholder memory (for the "What ChatGPT will see" preview). */
  mapping: MappingRecord;
  /** Scans a changed message again (after "Remove from message"). */
  rescan: (text: string) => DetectResult;
}

/** What you chose in the panel. */
export type ReviewDecision =
  | { kind: 'cancel' }
  | { kind: 'edit' }
  /** Send `text` (the panel's working copy) with `items` replaced (empty = send as is). */
  | { kind: 'send'; text: string; items: RedactionItem[] };

/** How a row behaves: from the policy (redact / warn / block) or added by you. */
export type RowKind = 'redact' | 'warn' | 'block' | 'added';

/** One place a value appears in the message. */
export interface Span {
  start: number;
  end: number;
}

/** One row in the panel: a value, where it appears, and whether it will be protected. */
export interface ReviewRow {
  /** category + value: stable across re-scans. */
  key: string;
  category: DetectorCategory;
  value: string;
  kind: RowKind;
  /** null for items you added yourself. */
  confidence: Confidence | null;
  /** Required by your policy: always protected, can't be unticked. */
  locked: boolean;
  /** Will be replaced by a placeholder (always false for blocked rows). */
  selected: boolean;
  /** Every place it appears in the message, in order. */
  spans: Span[];
}

/** Something you selected in the message and chose to protect. */
export interface AddedItem {
  category: DetectorCategory;
  value: string;
}

/** The groups in the order the panel shows them (most dangerous first). */
export const GROUP_ORDER: readonly CategoryGroup[] = [
  'secrets',
  'personal',
  'financial',
  'business',
];

/** The longest piece of text you can select and protect. */
export const MAX_ADDED_LENGTH = 500;

/** The key that identifies a row across re-scans. */
export function rowKey(category: DetectorCategory, value: string): string {
  return `${category}\u0000${value}`;
}

/** Every place `value` appears in `text` (non-overlapping, left to right). */
export function findAll(text: string, value: string): Span[] {
  const spans: Span[] = [];
  if (value === '') return spans;
  let from = 0;
  for (;;) {
    const start = text.indexOf(value, from);
    if (start === -1) return spans;
    spans.push({ start, end: start + value.length });
    from = start + value.length;
  }
}

/**
 * Builds the panel's rows from the scan, the items you added and your choices
 * (row key → ticked or not). Rows are sorted by group, then by first position.
 */
export function buildRows(
  text: string,
  result: DetectResult,
  added: readonly AddedItem[],
  choices: ReadonlyMap<string, boolean>,
  policy: Policy,
): ReviewRow[] {
  const byKey = new Map<string, ReviewRow>();

  for (const d of result.detections) {
    if (d.action === 'allow') continue;
    const key = rowKey(d.category, d.value);
    const existing = byKey.get(key);
    if (existing) {
      existing.spans.push({ start: d.start, end: d.end });
      continue;
    }
    const kind: RowKind = d.action;
    const locked = kind === 'redact' && !policy.rules[d.category].allowUserOverride;
    byKey.set(key, {
      key,
      category: d.category,
      value: d.value,
      kind,
      confidence: d.confidence,
      locked,
      selected: kind === 'block' ? false : locked ? true : (choices.get(key) ?? kind === 'redact'),
      spans: [{ start: d.start, end: d.end }],
    });
  }

  for (const item of added) {
    const key = rowKey(item.category, item.value);
    const existing = byKey.get(key);
    if (existing) {
      // The scan already found it: adding it just ticks that row (unless it's blocked).
      if (existing.kind !== 'block' && !existing.locked)
        existing.selected = choices.get(key) ?? true;
      continue;
    }
    const spans = findAll(text, item.value);
    if (spans.length === 0) continue; // no longer in the message
    byKey.set(key, {
      key,
      category: item.category,
      value: item.value,
      kind: 'added',
      confidence: null,
      locked: false,
      selected: choices.get(key) ?? true,
      spans,
    });
  }

  const rows = [...byKey.values()];
  for (const row of rows) row.spans.sort((a, b) => a.start - b.start);
  return rows.sort(
    (a, b) =>
      GROUP_ORDER.indexOf(CATEGORY_GROUP[a.category]) -
        GROUP_ORDER.indexOf(CATEGORY_GROUP[b.category]) ||
      (a.spans[0]?.start ?? 0) - (b.spans[0]?.start ?? 0),
  );
}

/** Every place of every ticked row, as items for the redactor. */
export function selectedItems(rows: readonly ReviewRow[]): RedactionItem[] {
  return rows
    .filter((row) => row.selected)
    .flatMap((row) =>
      row.spans.map((span) => ({ ...span, value: row.value, category: row.category })),
    );
}

/** Counts that drive the footer: blocked rows, protectable rows, ticked rows. */
export function countRows(rows: readonly ReviewRow[]) {
  const blocked = rows.filter((row) => row.kind === 'block').length;
  const protectable = rows.length - blocked;
  const selected = rows.filter((row) => row.selected).length;
  return { blocked, protectable, selected, unticked: protectable - selected };
}

/** The footer's one-line summary (also read out by screen readers). */
export function summaryText(counts: ReturnType<typeof countRows>): string {
  if (counts.blocked > 0) {
    return `Remove ${counts.blocked} blocked ${counts.blocked === 1 ? 'item' : 'items'} to send`;
  }
  if (counts.protectable === 0) return 'Nothing left to protect';
  return `${counts.selected} of ${counts.protectable} ${counts.protectable === 1 ? 'item' : 'items'} will be protected`;
}

/** The main button's label: what will really happen when you press it. */
export function primaryLabel(counts: ReturnType<typeof countRows>): string {
  if (counts.selected > 0) return 'Protect and Send';
  if (counts.protectable > 0) return 'Send Without Redaction';
  return 'Send';
}

/** Deletes every copy of `value` from the message ("Remove from message"). */
export function removeValue(text: string, value: string): string {
  return value === '' ? text : text.split(value).join('');
}

/* ---------- Preview pieces ---------- */

/** A piece of the "Your message" preview: plain text, or a highlighted row value. */
export interface MessagePiece {
  start: number;
  end: number;
  row: ReviewRow | null;
}

/** Splits the message into plain and highlighted pieces (overlaps: the earlier/longer wins). */
export function messagePieces(text: string, rows: readonly ReviewRow[]): MessagePiece[] {
  const marks = rows
    .flatMap((row) => row.spans.map((span) => ({ ...span, row })))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const pieces: MessagePiece[] = [];
  let pos = 0;
  for (const mark of marks) {
    if (mark.start < pos) continue; // overlaps a piece we already placed
    if (mark.start > pos) pieces.push({ start: pos, end: mark.start, row: null });
    pieces.push(mark);
    pos = mark.end;
  }
  if (pos < text.length) pieces.push({ start: pos, end: text.length, row: null });
  return pieces;
}

/** A piece of the "What ChatGPT will see" preview: plain text or a placeholder. */
export type OutputPiece = { kind: 'text'; text: string } | { kind: 'placeholder'; text: string };

/** What ChatGPT would receive: pieces, each row's placeholder, and whether the hint is added. */
export function previewOutput(
  text: string,
  rows: readonly ReviewRow[],
  mapping: MappingRecord,
  placeholderHint: boolean,
) {
  const plan = planPlaceholders(text, selectedItems(rows), mapping);
  const pieces: OutputPiece[] = [];
  const placeholderByRow = new Map<string, string>();
  let pos = 0;
  for (const { item, placeholder } of plan.assignments) {
    if (item.start > pos) pieces.push({ kind: 'text', text: text.slice(pos, item.start) });
    pieces.push({ kind: 'placeholder', text: placeholder });
    placeholderByRow.set(rowKey(item.category, item.value), placeholder);
    pos = item.end;
  }
  if (pos < text.length) pieces.push({ kind: 'text', text: text.slice(pos) });
  const hint = placeholderHint && plan.assignments.length > 0 && !mapping.hintSent;
  return { pieces, placeholderByRow, hint };
}

/** Shortens a long value in the middle ("sk_live_…abcdEF"); newlines shown as spaces. */
export function shortenValue(value: string, max = 36): { text: string; shortened: boolean } {
  const flat = value.replace(/\s+/g, ' ');
  if (flat.length <= max) return { text: flat, shortened: flat !== value };
  const head = Math.ceil((max - 1) * 0.6);
  const tail = max - 1 - head;
  return { text: `${flat.slice(0, head)}…${flat.slice(-tail)}`, shortened: true };
}
