/*
  Tests for the Unicode-aware whole-word check.
*/
import { describe, expect, it } from 'vitest';

import { isWholeWordMatch, isWordChar } from '../../src/utils/boundaries';

describe('isWordChar', () => {
  it.each(['a', 'Z', '7', '_', 'é', 'ب', 'ی', '中', '́'])('%j is a word character', (c) => {
    expect(isWordChar(c)).toBe(true);
  });

  it.each([' ', '.', "'", '-', '😀', '\n', ''])('%j is not a word character', (c) => {
    expect(isWordChar(c)).toBe(false);
  });
});

describe('isWholeWordMatch', () => {
  /** Checks whether `needle` (first occurrence) is a whole word inside `text`. */
  function whole(text: string, needle: string): boolean {
    const start = text.indexOf(needle);
    return isWholeWordMatch(text, start, start + needle.length);
  }

  it('accepts a term surrounded by spaces or punctuation', () => {
    expect(whole('Meet ABC Corp today', 'ABC Corp')).toBe(true);
    expect(whole("ABC Corp's offer", 'ABC Corp')).toBe(true);
    expect(whole('(ABC Corp)', 'ABC Corp')).toBe(true);
  });

  it('accepts a term at the very start and end of the text', () => {
    expect(whole('ABC Corp', 'ABC Corp')).toBe(true);
  });

  it('rejects a term glued to more letters', () => {
    expect(whole('ABC Corporation', 'ABC Corp')).toBe(false);
    expect(whole('XABC Corp', 'ABC Corp')).toBe(false);
  });

  it('treats Urdu letters as word characters', () => {
    expect(whole('ABC Corpکے', 'ABC Corp')).toBe(false);
    expect(whole('ABC Corp کے', 'ABC Corp')).toBe(true);
  });

  it('treats emojis next to the term as boundaries', () => {
    expect(whole('😀ABC Corp😀', 'ABC Corp')).toBe(true);
  });

  it('rejects a term glued to an accented letter', () => {
    expect(whole('éABC Corp', 'ABC Corp')).toBe(false);
  });
});
