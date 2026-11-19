/*
  Custom terms detector: case-insensitive, whitespace-flexible, Unicode-aware whole words,
  longest term wins, positions mapped back to the ORIGINAL text, category from the term.
*/
import type { CustomTerm } from '@safeai/shared';
import { describe, expect, it } from 'vitest';

import { customTermsDetector, prepareCustomTerms } from '../../src/detectors/custom-terms';
import { detect } from '../../src/engine';
import { policyWith } from '../fixtures/fake-data';

/** A custom term (whole-word by default). */
const term = (
  text: string,
  category: CustomTerm['category'] = 'client_name',
  wholeWord = true,
) => ({
  term: text,
  category,
  wholeWord,
});

/** Runs the detector with the given terms; returns [original text, category] pairs. */
function found(terms: CustomTerm[], text: string): [string, string][] {
  const ctx = {
    policy: policyWith({}, { customTerms: terms }),
    customTerms: prepareCustomTerms(terms),
  };
  return customTermsDetector
    .detect(text, ctx)
    .sort((a, b) => a.start - b.start)
    .map((d) => {
      expect(text.slice(d.start, d.end)).toBe(d.value); // positions point into the ORIGINAL text
      return [d.value, d.category];
    });
}

describe('prepareCustomTerms', () => {
  it('returns null when there are no usable terms', () => {
    expect(prepareCustomTerms([])).toBeNull();
    expect(prepareCustomTerms([term('   ')])).toBeNull();
  });

  it('normalizes terms and keeps only the first of duplicates', () => {
    const prepared = prepareCustomTerms([
      term('  ABC   Corp ', 'client_name'),
      term('abc corp', 'company_name'),
    ]);
    expect(prepared?.terms).toEqual([
      { normalized: 'abc corp', category: 'client_name', wholeWord: true },
    ]);
  });
});

describe('custom terms detector', () => {
  it('runs on the whole text', () => {
    expect(customTermsDetector.scope).toBe('fullText');
  });

  it('finds nothing without prepared terms', () => {
    expect(customTermsDetector.detect('ABC Corp', { policy: policyWith() })).toEqual([]);
  });

  it('matches case-insensitively and keeps the original spelling and category', () => {
    expect(found([term('ABC Corp')], 'Meeting with abc corp and ABC CORP.')).toEqual([
      ['abc corp', 'client_name'],
      ['ABC CORP', 'client_name'],
    ]);
  });

  it('reports high confidence and a category-based rule id', () => {
    const terms = [term('Apollo', 'project_name')];
    const ctx = { policy: policyWith(), customTerms: prepareCustomTerms(terms) };
    expect(customTermsDetector.detect('Project Apollo', ctx)[0]).toMatchObject({
      category: 'project_name',
      confidence: 'high',
      ruleId: 'custom_term.project_name',
    });
  });

  it('a space in a term matches any run of whitespace, including line breaks', () => {
    expect(
      found([term('ABC Corp')], 'ABC   Corp, ABC\tCorp and ABC\r\nCorp').map(([v]) => v),
    ).toEqual(['ABC   Corp', 'ABC\tCorp', 'ABC\r\nCorp']);
  });

  it('whole-word: matches before punctuation and possessives, not inside longer words', () => {
    expect(found([term('ABC Corp')], "ABC Corp's offer (ABC Corp)").map(([v]) => v)).toEqual([
      'ABC Corp',
      'ABC Corp',
    ]);
    expect(found([term('ABC Corp')], 'ABC Corporation and XABC Corp')).toEqual([]);
  });

  it('whole-word is Unicode-aware (Urdu letters count as word characters)', () => {
    expect(found([term('ABC Corp')], 'ABC Corpکے')).toEqual([]);
    expect(found([term('ABC Corp')], 'ABC Corp کے لیے')).toEqual([['ABC Corp', 'client_name']]);
  });

  it('wholeWord: false also matches inside longer words', () => {
    expect(found([term('corp', 'custom_term', false)], 'MegaCorporation')).toEqual([
      ['Corp', 'custom_term'],
    ]);
  });

  it('the longest term wins at the same position', () => {
    const terms = [term('ABC Corp'), term('ABC Corp Holdings', 'company_name')];
    expect(found(terms, 'Sign with ABC Corp Holdings today')).toEqual([
      ['ABC Corp Holdings', 'company_name'],
    ]);
  });

  it('maps positions back correctly after emojis, extra spaces and Arabic text', () => {
    const text = '😀 شركة  النور   للتجارة 🎉 and   Project   Apollo!';
    const terms = [
      term('شركة النور للتجارة', 'company_name'),
      term('project apollo', 'project_name'),
    ];
    expect(found(terms, text)).toEqual([
      ['شركة  النور   للتجارة', 'company_name'],
      ['Project   Apollo', 'project_name'],
    ]);
  });

  it('matches full-width and ligature look-alikes (NFKC)', () => {
    expect(found([term('ABC')], 'Ｃlient ＡＢＣ').map(([v]) => v)).toEqual(['ＡＢＣ']);
    expect(found([term('finance team')], 'the ﬁnance team')).toEqual([
      ['ﬁnance team', 'client_name'],
    ]);
  });

  it('works end to end through detect(), and wins overlaps against built-in categories', () => {
    const policy = policyWith({}, { customTerms: [term('ali@example.com', 'internal_system')] });
    const result = detect('mail ali@example.com now', policy);
    expect(result.detections.map((d) => [d.value, d.category])).toEqual([
      ['ali@example.com', 'internal_system'],
    ]);
  });

  it('handles 5,000 terms (built once, then cached by the engine)', () => {
    const terms = Array.from({ length: 5_000 }, (_, i) => term(`Client Number ${i}`));
    const policy = policyWith({}, { customTerms: terms });
    const text = `Notes about Client Number 4321 and client number 7. ${'filler '.repeat(1_400)}`;

    // First call: builds the 5,000-term matcher. That one-time preparation must NOT use up the
    // time budget (the budget only limits scanning), so the result is complete.
    const first = detect(text, policy);
    expect(first.complete).toBe(true);
    expect(first.detections.map((d) => d.value)).toEqual(['Client Number 4321', 'client number 7']);

    // Second call: the prepared matcher is reused from the cache, same answer.
    const second = detect(text, policy);
    expect(second.complete).toBe(true);
    expect(second.detections.map((d) => d.value)).toEqual(['Client Number 4321', 'client number 7']);
  });
});
