/*
  Text normalization for matching custom terms: lowercase, Unicode NFKC (so look-alike forms
  such as full-width letters or "ﬁ" become normal ones) and every whitespace run → one space.
  normalizeForMatching also keeps an index map, so a match found in the normalized text can be
  mapped back to the exact characters in the ORIGINAL text (which is what we must replace).
*/

/** Normalized text plus the way back to the original. */
export interface NormalizedText {
  /** The normalized text (lowercase, NFKC, whitespace runs collapsed to one space). */
  normalized: string;
  /** indexMap[i] = position in the ORIGINAL text of normalized character i. */
  indexMap: number[];
  /** Length of the original text (needed to map a match that ends at the very end). */
  sourceLength: number;
}

// A Unicode "mark": accents and vowel signs that attach to the previous letter (é = e + ´).
const COMBINING_MARK = /^\p{M}$/u;
// One whitespace character (space, tab, line break, no-break space, …).
const WHITESPACE_CHAR = /^\s$/u;
// A whole string made only of whitespace.
const ALL_WHITESPACE = /^\s+$/u;

/**
 * Lowercases, applies NFKC and collapses whitespace, keeping a map back to original positions.
 * Accents are processed together with their base letter, so "e + ´" and "é" normalize alike.
 */
export function normalizeForMatching(text: string): NormalizedText {
  const out: string[] = [];
  const indexMap: number[] = [];
  const codePoints = [...text];
  let position = 0; // position in the original text (UTF-16 units)
  let lastWasSpace = false;

  for (let i = 0; i < codePoints.length;) {
    // Group a base character with any accents that follow it.
    let cluster = codePoints[i] ?? '';
    let j = i + 1;
    while (j < codePoints.length && COMBINING_MARK.test(codePoints[j] ?? '')) {
      cluster += codePoints[j];
      j++;
    }

    const piece = cluster.normalize('NFKC').toLowerCase();
    if (WHITESPACE_CHAR.test(cluster) || ALL_WHITESPACE.test(piece)) {
      if (!lastWasSpace) {
        out.push(' ');
        indexMap.push(position);
        lastWasSpace = true;
      }
    } else {
      for (const unit of piece.split('')) {
        out.push(unit);
        indexMap.push(position);
      }
      lastWasSpace = false;
    }

    position += cluster.length;
    i = j;
  }

  return { normalized: out.join(''), indexMap, sourceLength: text.length };
}

/** Normalizes a custom term exactly like text is normalized, then trims it. */
export function normalizeTerm(term: string): string {
  return normalizeForMatching(term).normalized.trim();
}

/**
 * Maps a match [start, end) in the normalized text back to [start, end) in the original text.
 * If the match ends in the middle of a character that NFKC expanded (e.g. "ﬁ" → "fi"), the
 * whole original character is included.
 */
export function toOriginalRange(
  map: NormalizedText,
  start: number,
  end: number,
): { start: number; end: number } {
  const { indexMap, sourceLength } = map;
  const originalStart = indexMap[start] ?? sourceLength;
  const lastSource = indexMap[end - 1] ?? originalStart;
  // Skip forward past any other normalized characters produced by the same original character.
  let k = end;
  while (k < indexMap.length && indexMap[k] === lastSource) k++;
  const originalEnd = indexMap[k] ?? sourceLength;
  return { start: originalStart, end: originalEnd };
}
