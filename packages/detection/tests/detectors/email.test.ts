/*
  Email detector: what it must catch, what it must NOT catch, exact positions, and speed on
  "pathological" text (long runs of letters that could make a careless regex very slow).
*/
import { DEFAULT_POLICY } from '@safeai/shared';
import { describe, expect, it } from 'vitest';

import { emailDetector } from '../../src/detectors/email';
import { FAKE_EMAILS } from '../fixtures/fake-data';

const ctx = { policy: DEFAULT_POLICY };
const values = (text: string) => emailDetector.detect(text, ctx).map((d) => d.value);

describe('email detector', () => {
  it.each(Object.values(FAKE_EMAILS))('catches %s', (email) => {
    expect(values(`Contact: ${email} please`)).toEqual([email]);
  });

  it('reports exact positions, category, confidence and rule', () => {
    const text = `email me at ${FAKE_EMAILS.simple}`;
    expect(emailDetector.detect(text, ctx)).toEqual([
      {
        start: 12,
        end: 12 + FAKE_EMAILS.simple.length,
        value: FAKE_EMAILS.simple,
        category: 'email',
        confidence: 'high',
        ruleId: 'email',
      },
    ]);
  });

  it.each([
    ['ali@example.com.', 'full stop'],
    ['ali@example.com,', 'comma'],
    ['ali@example.com)', 'closing bracket'],
    ['ali@example.com!', 'exclamation mark'],
  ])('trims trailing punctuation: %s (%s)', (text) => {
    expect(values(text)).toEqual(['ali@example.com']);
  });

  it('finds several emails and each one separately', () => {
    expect(values('a@example.com, b@example.org;c@example.net')).toEqual([
      'a@example.com',
      'b@example.org',
      'c@example.net',
    ]);
  });

  it.each([
    ['follow @username on X', 'social handle'],
    ['ssh user@localhost', 'no dot in the domain'],
    ['logo@2x.png and icon@3x.webp', 'retina image file names'],
    ['ali@-example.com', 'domain label starts with a hyphen'],
    ['ali@example..com', 'empty domain label'],
    ['.ali@example.com', 'name starts with a dot'],
    ['ali.@example.com', 'name ends with a dot'],
    ['a..b@example.com', 'two dots in a row in the name'],
    ['ali@example.c', 'one-letter ending'],
    ['ali@example.com2', 'ending glued to a digit'],
    ['just some text', 'no email at all'],
  ])('does not catch %j (%s)', (text) => {
    expect(values(text)).toEqual([]);
  });

  it('stays fast on 20,000 letters in a row with no @ (no catastrophic backtracking)', () => {
    const started = Date.now();
    expect(values('a'.repeat(20_000))).toEqual([]);
    expect(values(`${'a.'.repeat(10_000)}@`)).toEqual([]);
    expect(values(`x@${'a'.repeat(20_000)}`)).toEqual([]);
    expect(Date.now() - started).toBeLessThan(200);
  });
});
