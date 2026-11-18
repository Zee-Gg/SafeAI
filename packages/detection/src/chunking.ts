/*
  Splits long text into overlapping chunks, so no regex ever runs on one huge string.
  Chunks are 20,000 characters and overlap by 500, so anything shorter than 500 characters that
  sits on a cut is fully inside the next chunk. Cuts move back to a nearby space when possible.
*/
import type { Detection } from './types';

/** One piece of the text and where it starts in the original. */
export interface Chunk {
  text: string;
  offset: number;
}

export const CHUNK_SIZE = 20_000;
export const CHUNK_OVERLAP = 500;
/** How far back from a cut we look for a space to cut at instead. */
export const SNAP_WINDOW = 200;

// One whitespace character (space, tab, line break, …).
const WHITESPACE = /\s/;

/** Splits text into overlapping chunks. Text up to `size` characters stays one chunk. */
export function splitIntoChunks(
  text: string,
  size = CHUNK_SIZE,
  overlap = CHUNK_OVERLAP,
  snapWindow = SNAP_WINDOW,
): Chunk[] {
  if (size <= overlap + snapWindow) {
    throw new RangeError('Chunk size must be larger than overlap + snap window');
  }
  if (text.length <= size) return [{ text, offset: 0 }];

  const chunks: Chunk[] = [];
  let start = 0;
  for (;;) {
    let end = start + size;
    if (end >= text.length) {
      chunks.push({ text: text.slice(start), offset: start });
      return chunks;
    }
    end = chooseCut(text, end, snapWindow);
    chunks.push({ text: text.slice(start, end), offset: start });
    start = end - overlap; // always moves forward, because size > overlap + snapWindow
  }
}

/**
 * Moves a cut back to just after the nearest whitespace within the last `snapWindow`
 * characters. With no whitespace there, keeps the cut, but never splits an emoji in half.
 */
function chooseCut(text: string, end: number, snapWindow: number): number {
  for (let i = end - 1; i >= end - snapWindow; i--) {
    if (WHITESPACE.test(text.charAt(i))) return i + 1;
  }
  const previous = text.charCodeAt(end - 1);
  const isHighSurrogate = previous >= 0xd800 && previous <= 0xdbff;
  return isHighSurrogate ? end - 1 : end;
}

/** Removes detections found twice in an overlap (same category, start and end); keeps the first. */
export function dedupeAcrossChunks(detections: readonly Detection[]): Detection[] {
  const seen = new Set<string>();
  return detections.filter((detection) => {
    if (seen.has(detection.id)) return false;
    seen.add(detection.id);
    return true;
  });
}
