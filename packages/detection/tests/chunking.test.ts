/*
  Chunking: long text is split into overlapping pieces, cuts snap to whitespace, and a
  detection sitting on a chunk border is found exactly once with correct positions.
*/
import { DEFAULT_POLICY } from '@safeai/shared';
import { describe, expect, it } from 'vitest';

import { CHUNK_OVERLAP, CHUNK_SIZE, dedupeAcrossChunks, splitIntoChunks } from '../src/chunking';
import { detect } from '../src/engine';
import type { Detection } from '../src/types';
import { FAKE_EMAILS } from './fixtures/fake-data';

describe('splitIntoChunks', () => {
  it('keeps short text as one chunk', () => {
    expect(splitIntoChunks('hello', 50, 10, 5)).toEqual([{ text: 'hello', offset: 0 }]);
  });

  it('covers the whole text with overlapping chunks whose offsets are correct', () => {
    const text = 'x'.repeat(130);
    const chunks = splitIntoChunks(text, 50, 10, 5);
    for (const chunk of chunks) {
      expect(text.slice(chunk.offset, chunk.offset + chunk.text.length)).toBe(chunk.text);
    }
    // No whitespace → cuts at 50, next starts 10 back.
    expect(chunks.map((c) => c.offset)).toEqual([0, 40, 80]);
    const last = chunks[chunks.length - 1];
    expect((last?.offset ?? 0) + (last?.text.length ?? 0)).toBe(130);
  });

  it('moves a cut back to just after the nearest whitespace in the snap window', () => {
    const text = `${'a'.repeat(47)} ${'b'.repeat(60)}`; // space at index 47
    const [first, second] = splitIntoChunks(text, 50, 10, 5);
    expect(first?.text).toBe(`${'a'.repeat(47)} `);
    expect(second?.offset).toBe(48 - 10);
  });

  it('ignores whitespace outside the snap window', () => {
    const text = `${'a'.repeat(10)} ${'b'.repeat(80)}`; // space far before the cut
    const [first] = splitIntoChunks(text, 50, 10, 5);
    expect(first?.text.length).toBe(50);
  });

  it('never splits an emoji (2 UTF-16 units) in half', () => {
    const text = `${'a'.repeat(49)}😀${'b'.repeat(60)}`; // emoji occupies indexes 49–50
    const [first] = splitIntoChunks(text, 50, 10, 5);
    expect(first?.text).toBe('a'.repeat(49));
  });

  it('rejects settings that could not make progress', () => {
    expect(() => splitIntoChunks('x'.repeat(100), 20, 15, 5)).toThrow(RangeError);
  });

  it('uses 20,000-character chunks with a 500 overlap by default', () => {
    expect(CHUNK_SIZE).toBe(20_000);
    expect(CHUNK_OVERLAP).toBe(500);
    const chunks = splitIntoChunks('z'.repeat(45_000));
    expect(chunks.map((c) => c.offset)).toEqual([0, 19_500, 39_000]);
  });
});

describe('dedupeAcrossChunks', () => {
  const base: Detection = {
    id: 'email:5:10',
    start: 5,
    end: 10,
    value: 'v',
    category: 'email',
    confidence: 'high',
    ruleId: 'email',
    action: 'redact',
  };

  it('removes exact duplicates and keeps different ones', () => {
    const other = { ...base, id: 'email:6:10', start: 6 };
    expect(dedupeAcrossChunks([base, { ...base }, other])).toEqual([base, other]);
  });
});

describe('detection across chunk borders (engine)', () => {
  it('finds an email that sits right on the first cut exactly once, with original positions', () => {
    const email = FAKE_EMAILS.simple;
    const start = CHUNK_SIZE - 5; // the email straddles the 20,000 cut
    const text = `${'x'.repeat(start)} ${email} ${'y'.repeat(30_000)}`;
    const result = detect(text, DEFAULT_POLICY);
    expect(result.complete).toBe(true);
    expect(result.detections).toHaveLength(1);
    const [found] = result.detections;
    expect(found?.value).toBe(email);
    expect(text.slice(found?.start, found?.end)).toBe(email);
  });

  it('finds an email inside the overlap region only once', () => {
    const email = FAKE_EMAILS.dotted;
    const text = `${'x '.repeat(9_850)}${email} ${'y '.repeat(20_000)}`; // inside the overlap
    const result = detect(text, DEFAULT_POLICY);
    expect(result.detections.map((d) => d.value)).toEqual([email]);
  });

  it('finds emails in every chunk of a 100,000-character text', () => {
    const block = `${'lorem ipsum '.repeat(900)}${FAKE_EMAILS.simple} `;
    const text = block.repeat(10);
    expect(text.length).toBeGreaterThan(100_000);
    expect(detect(text, DEFAULT_POLICY).countsByCategory.email).toBe(10);
  });
});
