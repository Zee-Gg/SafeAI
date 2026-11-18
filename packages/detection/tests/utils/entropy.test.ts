/*
  Tests for Shannon entropy ("how random does this look?").
*/
import { describe, expect, it } from 'vitest';

import { shannonEntropy } from '../../src/utils/entropy';

describe('shannonEntropy', () => {
  it('is 0 for empty text and for one repeated character', () => {
    expect(shannonEntropy('')).toBe(0);
    expect(shannonEntropy('aaaaaaaa')).toBe(0);
  });

  it('is exactly 1 bit for two characters used equally', () => {
    expect(shannonEntropy('abababab')).toBeCloseTo(1, 10);
  });

  it('is exactly 4 bits for 16 different characters used once each', () => {
    expect(shannonEntropy('0123456789abcdef')).toBeCloseTo(4, 10);
  });

  it('scores an ordinary word lower than a random-looking token', () => {
    const word = shannonEntropy('internationalization');
    const token = shannonEntropy('q7Vx2LmP9aTz4KbR8nWc'); // fake, made up for this test
    expect(word).toBeLessThan(3.5);
    expect(token).toBeGreaterThan(4);
  });

  it('counts an emoji as one character, not two', () => {
    expect(shannonEntropy('😀😀')).toBe(0);
  });
});
