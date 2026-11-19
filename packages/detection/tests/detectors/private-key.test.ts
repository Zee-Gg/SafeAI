/*
  Private key (PEM) detector: no regex, plain string search, runs on the whole text.
  Covers every private-key label, BEGIN without END, keys crossing a chunk border, JSON-escaped
  keys on one line, public keys/certificates NOT caught, and no hang on adversarial input.
*/
import { DEFAULT_POLICY } from '@safeai/shared';
import { describe, expect, it } from 'vitest';

import { CHUNK_SIZE } from '../../src/chunking';
import { isPrivateKeyLabel, privateKeyDetector } from '../../src/detectors/private-key';
import { detect } from '../../src/engine';
import { fakePrivateKey, policyWith } from '../fixtures/fake-data';

const ctx = { policy: policyWith() };
const found = (text: string) => privateKeyDetector.detect(text, ctx);

describe('private key detector', () => {
  it('runs on the whole text and uses no regex', () => {
    expect(privateKeyDetector.scope).toBe('fullText');
    expect(privateKeyDetector.regexes).toEqual([]);
  });

  it.each([
    'PRIVATE KEY',
    'RSA PRIVATE KEY',
    'EC PRIVATE KEY',
    'DSA PRIVATE KEY',
    'OPENSSH PRIVATE KEY',
    'ENCRYPTED PRIVATE KEY',
    'PGP PRIVATE KEY BLOCK',
  ])('catches a whole "%s" block with high confidence', (label) => {
    const key = fakePrivateKey(label);
    const text = `here is my key:\n${key}\nthanks`;
    expect(found(text)).toEqual([
      {
        start: 16,
        end: 16 + key.length,
        value: key,
        category: 'api_key',
        confidence: 'high',
        ruleId: 'api_key.private_key',
      },
    ]);
  });

  it.each(['PUBLIC KEY', 'RSA PUBLIC KEY', 'CERTIFICATE', 'CERTIFICATE REQUEST'])(
    'does not catch a "%s" block (not secret)',
    (label) => {
      expect(found(fakePrivateKey(label))).toEqual([]);
    },
  );

  it('catches two keys separately', () => {
    const a = fakePrivateKey('RSA PRIVATE KEY');
    const b = fakePrivateKey('EC PRIVATE KEY');
    expect(found(`${a}\n\n${b}`).map((d) => d.value)).toEqual([a, b]);
  });

  it('BEGIN without END: caught up to the first empty line (no hang)', () => {
    const header = '-----BEGIN PRIVATE KEY-----';
    const text = `${header}\nLINE1FAKE\nLINE2FAKE\r\n\nafter the blank line`;
    expect(found(text).map((d) => d.value)).toEqual([`${header}\nLINE1FAKE\nLINE2FAKE`]);
  });

  it('BEGIN without END and no empty line: caught up to the end of the text', () => {
    const text = `-----BEGIN RSA PRIVATE KEY-----\n${'FAKELINE\n'.repeat(5)}tail`;
    expect(found(text)[0]?.end).toBe(text.length);
  });

  it('BEGIN without END stops before the next BEGIN, and the next key is still found', () => {
    const broken = '-----BEGIN PRIVATE KEY-----\nFAKEBROKEN';
    const good = fakePrivateKey('EC PRIVATE KEY');
    const values = found(`${broken}\n${good}`).map((d) => d.value);
    expect(values).toEqual([broken, good]);
  });

  it('a mismatched END label counts as "no END"', () => {
    const text = '-----BEGIN RSA PRIVATE KEY-----\nFAKE\n-----END EC PRIVATE KEY-----\n\nnext';
    expect(found(text)[0]?.value).toBe(
      '-----BEGIN RSA PRIVATE KEY-----\nFAKE\n-----END EC PRIVATE KEY-----',
    );
  });

  it('catches a JSON-escaped key written on one line', () => {
    const escaped =
      '-----BEGIN PRIVATE KEY-----\\nFAKEBODYLINE\\nFAKEBODYLINE\\n-----END PRIVATE KEY-----';
    const text = `{"private_key": "${escaped}\\n"}`;
    expect(found(text).map((d) => d.value)).toEqual([escaped]);
  });

  it('ignores a BEGIN with no closing dashes or an over-long label', () => {
    expect(found('-----BEGIN PRIVATE KEY without dashes')).toEqual([]);
    expect(found(`-----BEGIN ${'X'.repeat(60)} PRIVATE KEY-----\nbody`)).toEqual([]);
  });

  it('isPrivateKeyLabel only accepts private key labels', () => {
    expect(isPrivateKeyLabel('RSA PRIVATE KEY')).toBe(true);
    expect(isPrivateKeyLabel('PGP PRIVATE KEY BLOCK')).toBe(true);
    expect(isPrivateKeyLabel('PUBLIC KEY')).toBe(false);
  });

  it('does not hang on thousands of BEGIN lines without END', () => {
    const text = '-----BEGIN PRIVATE KEY-----\nFAKE\n'.repeat(5_000);
    const started = Date.now();
    expect(found(text)).toHaveLength(5_000);
    // Generous on purpose: catches runaway slowness (seconds), not milliseconds; see M6 bench.
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('finds a key that crosses a chunk border exactly once (engine, whole-text scope)', () => {
    const key = fakePrivateKey('RSA PRIVATE KEY', 40); // ~2,700 characters, longer than the overlap
    const prefix = 'x'.repeat(CHUNK_SIZE - 1_000); // the key straddles the 20,000 cut
    const text = `${prefix}\n${key}\n${'y'.repeat(30_000)}`;
    const result = detect(text, DEFAULT_POLICY);
    const keys = result.detections.filter((d) => d.ruleId === 'api_key.private_key');
    expect(keys).toHaveLength(1);
    expect(keys[0]?.value).toBe(key);
    expect(keys[0]?.start).toBe(prefix.length + 1);
  });
});
