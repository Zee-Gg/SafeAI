/*
  Random-looking secret detector: entropy thresholds, context for "high", hex-only strings as
  "low", and everything it must skip (UUIDs, paths, URLs, words, big images, public keys).
*/
import { describe, expect, it } from 'vitest';

import { secretEntropyDetector } from '../../src/detectors/secret-entropy';
import { FAKE_HIGH_ENTROPY, FAKE_PUBLIC_KEYS, fakeChars, policyWith } from '../fixtures/fake-data';

const ctx = { policy: policyWith() };
const found = (text: string) => secretEntropyDetector.detect(text, ctx);
const summary = (text: string) => found(text).map((d) => [d.value, d.confidence, d.ruleId]);

describe('secret entropy detector', () => {
  it('a random-looking token next to a secret word is high', () => {
    expect(summary(`SECRET_KEY=${FAKE_HIGH_ENTROPY}`)).toEqual([
      [FAKE_HIGH_ENTROPY, 'high', 'secret.entropy'],
    ]);
    expect(summary(`my auth: ${FAKE_HIGH_ENTROPY}`)[0]?.[1]).toBe('high');
  });

  it('the same token without context is medium', () => {
    expect(summary(`value ${FAKE_HIGH_ENTROPY} here`)).toEqual([
      [FAKE_HIGH_ENTROPY, 'medium', 'secret.entropy'],
    ]);
  });

  it('reports exact positions', () => {
    const text = `x ${FAKE_HIGH_ENTROPY} y`;
    const [hit] = found(text);
    expect(text.slice(hit?.start, hit?.end)).toBe(FAKE_HIGH_ENTROPY);
    expect(hit?.category).toBe('secret');
  });

  it('hex-only strings of 32/40/64 characters are low', () => {
    for (const length of [32, 40, 64]) {
      const hex = fakeChars(length, '0123456789abcdef', 5);
      expect(summary(`value ${hex}`)).toEqual([[hex, 'low', 'secret.hex']]);
    }
  });

  it('hex strings after hash words (commit, sha256, md5…) are skipped', () => {
    const hash = fakeChars(40, '0123456789abcdef', 5);
    expect(found(`commit ${hash}`)).toEqual([]);
    expect(found(`sha256: ${fakeChars(64, '0123456789abcdef', 5)}`)).toEqual([]);
  });

  it('hex strings of other lengths are skipped', () => {
    expect(found(`value ${fakeChars(36, '0123456789abcdef', 5)}`)).toEqual([]);
  });

  it.each([
    ['550e8400-e29b-41d4-a716-446655440000', 'UUID'],
    ['internationalization_and_localization', 'letters only'],
    ['20261118123045001234', 'digits only'],
    ['aaaa1111aaaa1111aaaa1111', 'repetitive (low entropy)'],
    ['short1A2b', 'too short'],
    [`src/components/${FAKE_HIGH_ENTROPY}.tsx`, 'file path'],
    [`C:\\Users\\${FAKE_HIGH_ENTROPY}`, 'Windows path'],
    [`https://example.com/files/${FAKE_HIGH_ENTROPY}`, 'URL (handled elsewhere)'],
    ...Object.values(FAKE_PUBLIC_KEYS).map((key) => [key, 'public key'] as [string, string]),
  ])('does not catch %j (%s)', (text) => {
    expect(found(text)).toEqual([]);
  });

  it('skips big inline base64 images', () => {
    const image = `data:image/png;base64,${fakeChars(600)}`;
    expect(found(image)).toEqual([]);
  });

  it('stays fast on 50,000 characters without spaces', () => {
    // Build the inputs BEFORE starting the stopwatch, so only detection is timed.
    const oneHugeToken = fakeChars(50_000);
    const manyCandidatesInOneWord = `${fakeChars(30)}.`.repeat(1_500);
    const started = Date.now();
    found(oneHugeToken);
    found(manyCandidatesInOneWord);
    // A generous limit on purpose: this guards against runaway (quadratic) slowness, which
    // would take many seconds. Tests run in parallel with coverage on, so tight limits are
    // unreliable. Real speed numbers come from the M6 benchmarks.
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
