/*
  When two detections cover some of the same characters, only one can be replaced, so we keep
  the "winner". Rules, in order: block action > custom term > higher confidence > longer match
  > earlier start. Detections that don't overlap anything are kept unchanged.
*/
import { isCustomTermCategory } from '@safeai/shared';

import type { Confidence, Detection } from './types';

const CONFIDENCE_RANK: Readonly<Record<Confidence, number>> = { high: 3, medium: 2, low: 1 };

/** Negative if `a` should win over `b`, positive if `b` should win. */
export function compareStrength(a: Detection, b: Detection): number {
  const block = Number(b.action === 'block') - Number(a.action === 'block');
  if (block !== 0) return block;
  const custom =
    Number(isCustomTermCategory(b.category)) - Number(isCustomTermCategory(a.category));
  if (custom !== 0) return custom;
  const confidence = CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
  if (confidence !== 0) return confidence;
  const length = b.end - b.start - (a.end - a.start);
  if (length !== 0) return length;
  if (a.start !== b.start) return a.start - b.start;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; // stable final tie-break
}

/** Keeps only non-overlapping detections, choosing winners by the rules above. Sorted by start. */
export function resolveOverlaps(detections: readonly Detection[]): Detection[] {
  const byStrength = [...detections].sort(compareStrength);
  const kept: Detection[] = []; // always sorted by start, never overlapping

  for (const candidate of byStrength) {
    const index = firstStartingAtOrAfter(kept, candidate.start);
    const previous = kept[index - 1];
    const next = kept[index];
    const overlapsPrevious = previous !== undefined && previous.end > candidate.start;
    const overlapsNext = next !== undefined && next.start < candidate.end;
    if (!overlapsPrevious && !overlapsNext) kept.splice(index, 0, candidate);
  }
  return kept;
}

/** Binary search: index of the first kept detection whose start is >= `start`. */
function firstStartingAtOrAfter(kept: readonly Detection[], start: number): number {
  let low = 0;
  let high = kept.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((kept[middle]?.start ?? Infinity) < start) low = middle + 1;
    else high = middle;
  }
  return low;
}
