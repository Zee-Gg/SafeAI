/*
  Tests for text normalization and the index map back to original positions.
  The key promise: whatever we find in the normalized text maps back to the exact original characters.
*/
import { describe, expect, it } from 'vitest';

import { normalizeForMatching, normalizeTerm, toOriginalRange } from '../../src/utils/normalize';

/** Finds `needle` in the normalized text and returns the ORIGINAL text it maps back to. */
function findOriginal(text: string, needle: string): string {
  const map = normalizeForMatching(text);
  const at = map.normalized.indexOf(needle);
  expect(at).toBeGreaterThanOrEqual(0);
  const range = toOriginalRange(map, at, at + needle.length);
  return text.slice(range.start, range.end);
}

describe('normalizeTerm', () => {
  it('lowercases, trims and collapses whitespace', () => {
    expect(normalizeTerm('  ABC   Corp\tHoldings \n')).toBe('abc corp holdings');
  });

  it('applies NFKC (full-width letters and ligatures become normal ones)', () => {
    expect(normalizeTerm('ＡＢＣ')).toBe('abc');
    expect(normalizeTerm('ﬁnance')).toBe('finance');
  });

  it('treats a decomposed accent (e + ´) like the composed letter é', () => {
    expect(normalizeTerm('Café')).toBe(normalizeTerm('Café'));
  });
});

describe('normalizeForMatching', () => {
  it('collapses spaces, tabs and line breaks into one space', () => {
    expect(normalizeForMatching('ABC  \t\n Corp').normalized).toBe('abc corp');
  });

  it('keeps a single leading/trailing space (it does not trim)', () => {
    expect(normalizeForMatching('  hi  ').normalized).toBe(' hi ');
  });

  it('turns a no-break space into a normal space', () => {
    expect(normalizeForMatching('ABC Corp').normalized).toBe('abc corp');
  });

  it('maps back across extra spaces', () => {
    expect(findOriginal('Hello   ABC    Corp!', 'abc corp')).toBe('ABC    Corp');
  });

  it('maps back across line breaks', () => {
    expect(findOriginal('Client:\nABC\r\nCorp\nend', 'abc corp')).toBe('ABC\r\nCorp');
  });

  it('maps back correctly after emojis (2 units each in JavaScript)', () => {
    expect(findOriginal('😀😀 Meet ABC Corp 🎉', 'abc corp')).toBe('ABC Corp');
  });

  it('maps back correctly in Urdu and Arabic text', () => {
    expect(findOriginal('یہ رپورٹ ABC Corp کے لیے ہے', 'abc corp')).toBe('ABC Corp');
    expect(findOriginal('شركة  النور   للتجارة', 'النور للتجارة')).toBe('النور   للتجارة');
  });

  it('includes the whole original character when NFKC expanded it', () => {
    // "ﬁ" (one character) becomes "fi"; a match ending inside it must include all of "ﬁ".
    expect(findOriginal('ﬁnance team', 'fi')).toBe('ﬁ');
    expect(findOriginal('ﬁnance team', 'finance')).toBe('ﬁnance');
  });

  it('maps a match at the very end of the text', () => {
    expect(findOriginal('Talk to ABC Corp', 'abc corp')).toBe('ABC Corp');
  });

  it('maps a decomposed accent back to both original characters', () => {
    expect(findOriginal('Visit Café Bleu', 'café')).toBe('Café');
  });

  it('handles empty text', () => {
    const map = normalizeForMatching('');
    expect(map).toEqual({ normalized: '', indexMap: [], sourceLength: 0 });
    expect(toOriginalRange(map, 0, 0)).toEqual({ start: 0, end: 0 });
  });
});
