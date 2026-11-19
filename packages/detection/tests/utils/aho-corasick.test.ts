/*
  Tests for our own Aho-Corasick matcher: every occurrence, overlapping patterns, patterns
  inside other patterns, failure links, and 5,000 patterns in one pass.
*/
import { describe, expect, it } from 'vitest';

import { buildAutomaton, searchAll } from '../../src/utils/aho-corasick';

/** Runs a search and returns [matched text, pattern number] pairs, sorted by position. */
function find(patterns: string[], text: string): [string, number][] {
  return searchAll(buildAutomaton(patterns), text)
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .map((m) => [text.slice(m.start, m.end), m.pattern]);
}

describe('Aho-Corasick', () => {
  it('finds every occurrence of every pattern with exact positions', () => {
    const matches = searchAll(buildAutomaton(['he', 'she']), 'she said he');
    expect(matches).toEqual([
      { start: 0, end: 3, pattern: 1 },
      { start: 1, end: 3, pattern: 0 },
      { start: 9, end: 11, pattern: 0 },
    ]);
  });

  it('handles the classic example (he, she, his, hers) via failure links', () => {
    expect(find(['he', 'she', 'his', 'hers'], 'ushers')).toEqual([
      ['she', 1],
      ['he', 0],
      ['hers', 3],
    ]);
  });

  it('finds a pattern that is a prefix, suffix or middle of another', () => {
    // Sorted by start, then end: "abc" (0–3) comes before "abc corp" (0–8).
    expect(find(['abc corp', 'abc', 'corp', 'c c'], 'abc corp')).toEqual([
      ['abc', 1],
      ['abc corp', 0],
      ['c c', 3],
      ['corp', 2],
    ]);
  });

  it('finds overlapping occurrences of the same pattern', () => {
    expect(find(['aa'], 'aaaa').map(([value]) => value)).toEqual(['aa', 'aa', 'aa']);
  });

  it('ignores empty patterns and finds nothing in empty text', () => {
    expect(find(['', 'x'], 'axa')).toEqual([['x', 1]]);
    expect(find(['x'], '')).toEqual([]);
    expect(find([], 'anything')).toEqual([]);
  });

  it('works with Unicode (Urdu, Arabic) and emojis', () => {
    expect(find(['کراچی', '🎉'], 'شہر کراچی 🎉')).toEqual([
      ['کراچی', 0],
      ['🎉', 1],
    ]);
  });

  it('reports duplicate patterns under each of their numbers', () => {
    expect(find(['dup', 'dup'], 'a dup')).toEqual([
      ['dup', 0],
      ['dup', 1],
    ]);
  });

  it('searches 5,000 patterns over 10,000 characters in one pass, quickly', () => {
    const patterns = Array.from({ length: 5_000 }, (_, i) => `term${i}x`);
    const text = `${'filler words '.repeat(700)} term42x and term4999x`;
    const automaton = buildAutomaton(patterns);
    const started = Date.now();
    const found = searchAll(automaton, text);
    // Generous on purpose: catches runaway slowness (seconds), not milliseconds; see M6 bench.
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(found.map((m) => m.pattern).sort((a, b) => a - b)).toEqual([42, 4999]);
  });
});
