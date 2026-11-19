/*
  JWT detector: three base64url parts (first two start with "eyJ"), whole-text scope, linear regex.
*/
import { DEFAULT_POLICY } from '@safeai/shared';
import { describe, expect, it } from 'vitest';

import { CHUNK_SIZE } from '../../src/chunking';
import { jwtDetector } from '../../src/detectors/jwt';
import { detect } from '../../src/engine';
import { FAKE_KEYS, policyWith } from '../fixtures/fake-data';

const ctx = { policy: policyWith() };
const found = (text: string) => jwtDetector.detect(text, ctx);

describe('JWT detector', () => {
  it('runs on the whole text', () => {
    expect(jwtDetector.scope).toBe('fullText');
  });

  it('catches a JWT with exact positions', () => {
    const text = `Authorization: Bearer ${FAKE_KEYS.jwt}`;
    expect(found(text)).toEqual([
      {
        start: 22,
        end: 22 + FAKE_KEYS.jwt.length,
        value: FAKE_KEYS.jwt,
        category: 'api_key',
        confidence: 'high',
        ruleId: 'api_key.jwt',
      },
    ]);
  });

  it('catches an unsigned JWT (empty third part)', () => {
    const unsigned = FAKE_KEYS.jwt.slice(0, FAKE_KEYS.jwt.lastIndexOf('.') + 1);
    expect(found(`t=${unsigned} `).map((d) => d.value)).toEqual([unsigned]);
  });

  it.each([
    ['eyJ', 'just the start'],
    [FAKE_KEYS.jwt.split('.').slice(0, 2).join(''), 'parts glued together'],
    ['eyJhbGciOi.notjson.sig', 'second part does not start with eyJ'],
    ['version.1.2', 'version string'],
    [`x${FAKE_KEYS.jwt}`, 'glued to a letter before it'],
  ])('does not catch %j (%s)', (text) => {
    expect(found(text)).toEqual([]);
  });

  it('stays fast on 200,000 base64url characters with no dots', () => {
    const noDots = `eyJ${'a'.repeat(200_000)}`;
    const oneDotOnly = `eyJ${'a'.repeat(100_000)}.eyJ${'b'.repeat(100_000)}`;
    const started = Date.now();
    expect(found(noDots)).toEqual([]);
    expect(found(oneDotOnly)).toEqual([]);
    // Generous on purpose: catches runaway slowness (seconds), not milliseconds; see M6 bench.
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('finds a 1,200-character JWT that crosses a chunk border exactly once', () => {
    const longJwt = `${FAKE_KEYS.jwt.split('.').slice(0, 2).join('.')}.${'S'.repeat(1_150)}`;
    const prefix = 'z '.repeat((CHUNK_SIZE - 600) / 2);
    const text = `${prefix}${longJwt} ${'w '.repeat(15_000)}`;
    const jwts = detect(text, DEFAULT_POLICY).detections.filter((d) => d.ruleId === 'api_key.jwt');
    expect(jwts.map((d) => d.value)).toEqual([longJwt]);
  });
});
