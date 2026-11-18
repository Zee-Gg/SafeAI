/*
  Tests for matchAll: exact positions for whole matches and capture groups.
*/
import { describe, expect, it } from 'vitest';

import { matchAll } from '../../src/utils/match';

// "password" then ": " then the value (captured as group 1 and as named group "value").
const PASSWORD_LIKE = /password: (?<value>\S+)/dg;

describe('matchAll', () => {
  it('returns the positions of whole matches', () => {
    // One or more digits.
    const digits = /\d+/dg;
    expect(matchAll(digits, 'a12b345')).toEqual([
      { start: 1, end: 3, value: '12' },
      { start: 4, end: 7, value: '345' },
    ]);
  });

  it('returns the position of a numbered capture group', () => {
    const text = 'x password: hunter2 y';
    expect(matchAll(PASSWORD_LIKE, text, 1)).toEqual([{ start: 12, end: 19, value: 'hunter2' }]);
  });

  it('returns the position of a named capture group', () => {
    const text = 'password: one password: two';
    expect(matchAll(PASSWORD_LIKE, text, 'value').map((m) => m.value)).toEqual(['one', 'two']);
  });

  it('skips matches where the requested group did not take part', () => {
    // "a", optionally followed by a "b" captured as group 1.
    const optional = /a(b)?/dg;
    expect(matchAll(optional, 'ab a', 1)).toEqual([{ start: 1, end: 2, value: 'b' }]);
    expect(matchAll(optional, 'ab a', 'missing')).toEqual([]);
  });

  it('does not change the shared regex lastIndex', () => {
    matchAll(PASSWORD_LIKE, 'password: x');
    expect(PASSWORD_LIKE.lastIndex).toBe(0);
  });

  it('throws if the regex lacks the g or d flag (a programming mistake)', () => {
    // The letter "a" (missing flags on purpose).
    expect(() => matchAll(/a/g, 'a')).toThrow(/"g" and "d"/);
    expect(() => matchAll(/a/d, 'a')).toThrow(/"g" and "d"/);
  });
});
