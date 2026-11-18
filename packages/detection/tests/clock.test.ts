/*
  Tests for the clock: uses performance.now() when present, Date.now() otherwise.
*/
import { describe, expect, it } from 'vitest';

import { createClock, now } from '../src/clock';

describe('clock', () => {
  it('uses performance.now() when it exists', () => {
    const clock = createClock({ performance: { now: () => 42.5 } });
    expect(clock()).toBe(42.5);
  });

  it('falls back to Date.now() when performance is missing', () => {
    const before = Date.now();
    const value = createClock({})();
    expect(value).toBeGreaterThanOrEqual(before);
    expect(Number.isInteger(value)).toBe(true);
  });

  it('the default clock moves forward', () => {
    const a = now();
    const b = now();
    expect(b).toBeGreaterThanOrEqual(a);
  });
});
