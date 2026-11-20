/*
  Engine tests: policy actions attached, "allow" skipped, sorting, counts, timing, the time
  budget, the complete flag, failing detectors, whole-text detectors and the context cache.
*/
import { DEFAULT_POLICY, type Policy } from '@safeai/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { clearContextCache, fnv1a, prepareContext } from '../src/context';
import { DETECTORS } from '../src/detectors';
import { DEFAULT_TIME_BUDGET_MS, detect, runDetection } from '../src/engine';
import * as publicApi from '../src/index';
import type { Detector } from '../src/types';
import { FAKE_EMAILS, policyWith } from './fixtures/fake-data';

beforeEach(() => clearContextCache());

/** A fake detector that reports every occurrence of `word` as the given category. */
function wordDetector(id: string, word: string, scope?: 'fullText'): Detector {
  return {
    id,
    categories: ['secret'],
    regexes: [],
    ...(scope ? { scope } : {}),
    detect(text) {
      const hits = [];
      for (let at = text.indexOf(word); at !== -1; at = text.indexOf(word, at + 1)) {
        hits.push({
          start: at,
          end: at + word.length,
          value: word,
          category: 'secret' as const,
          confidence: 'medium' as const,
          ruleId: id,
        });
      }
      return hits;
    },
  };
}

/** A fake detector that always crashes. */
const brokenDetector: Detector = {
  id: 'broken',
  categories: ['secret'],
  regexes: [],
  detect() {
    throw new Error('boom');
  },
};

describe('detect()', () => {
  it('exports only detect(), the default budget and normalizeTerm from the front door', () => {
    // normalizeTerm was added in Phase 3 (placeholder reuse for custom terms).
    expect(Object.keys(publicApi).sort()).toEqual([
      'DEFAULT_TIME_BUDGET_MS',
      'detect',
      'normalizeTerm',
    ]);
    expect(DEFAULT_TIME_BUDGET_MS).toBe(500);
  });

  it('returns an empty, complete result for empty text', () => {
    const result = detect('', DEFAULT_POLICY);
    expect(result).toMatchObject({
      detections: [],
      countsByCategory: {},
      complete: true,
      failedDetectors: [],
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('attaches the policy action, a stable id and original positions', () => {
    const text = `Hi, write to ${FAKE_EMAILS.simple} today`;
    const [found] = detect(text, DEFAULT_POLICY).detections;
    expect(found).toMatchObject({
      category: 'email',
      action: 'redact',
      value: FAKE_EMAILS.simple,
      id: `email:${found?.start}:${found?.end}`,
    });
    expect(text.slice(found?.start, found?.end)).toBe(FAKE_EMAILS.simple);
  });

  it('uses the action from the given policy (e.g. block, warn)', () => {
    const text = FAKE_EMAILS.simple;
    expect(detect(text, policyWith({ email: 'block' })).detections[0]?.action).toBe('block');
    expect(detect(text, policyWith({ email: 'warn' })).detections[0]?.action).toBe('warn');
  });

  it('skips categories set to "allow" (and does not even run their detector)', () => {
    const policy = policyWith({ email: 'allow' });
    expect(detect(FAKE_EMAILS.simple, policy).detections).toEqual([]);
    const enabledIds = prepareContext(policy, DETECTORS).enabledDetectors.map((d) => d.id);
    expect(enabledIds).not.toContain('email');
    expect(enabledIds).toContain('phone'); // other detectors still run
  });

  it('sorts detections by position and counts them per category', () => {
    const text = `${FAKE_EMAILS.upper} and ${FAKE_EMAILS.simple} and ${FAKE_EMAILS.dotted}`;
    const result = detect(text, DEFAULT_POLICY);
    const starts = result.detections.map((d) => d.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(result.countsByCategory).toEqual({ email: 3 });
  });

  it('measures time', () => {
    expect(detect(FAKE_EMAILS.simple, DEFAULT_POLICY).durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('time budget and complete flag', () => {
  it('stops with complete: false when the budget is used up', () => {
    const result = detect(`text ${FAKE_EMAILS.simple}`, DEFAULT_POLICY, { timeBudgetMs: 0 });
    expect(result.complete).toBe(false);
    expect(result.detections).toEqual([]);
  });

  it('is complete with a normal budget', () => {
    expect(detect(`text ${FAKE_EMAILS.simple}`, DEFAULT_POLICY).complete).toBe(true);
  });
});

describe('robustness', () => {
  it('a failing detector does not stop the others, and marks the result incomplete', () => {
    const detectors = [brokenDetector, wordDetector('fine', 'TOKEN')];
    const result = runDetection('a TOKEN here', DEFAULT_POLICY, detectors);
    expect(result.complete).toBe(false);
    expect(result.failedDetectors).toEqual(['broken']);
    expect(result.detections.map((d) => d.value)).toEqual(['TOKEN']);
  });

  it('never throws on a malformed policy; reports not complete instead', () => {
    const broken = { ...DEFAULT_POLICY, rules: {} } as unknown as Policy;
    const result = detect(FAKE_EMAILS.simple, broken);
    expect(result.complete).toBe(false);
    expect(result.failedDetectors).toEqual(['engine']);
  });

  it('drops detections a detector reports outside the text', () => {
    const liar: Detector = {
      id: 'liar',
      categories: ['secret'],
      regexes: [],
      detect: () => [
        { start: -1, end: 2, value: 'x', category: 'secret', confidence: 'low', ruleId: 'liar' },
        { start: 3, end: 99, value: 'x', category: 'secret', confidence: 'low', ruleId: 'liar' },
        { start: 2, end: 2, value: '', category: 'secret', confidence: 'low', ruleId: 'liar' },
      ],
    };
    expect(runDetection('short', DEFAULT_POLICY, [liar]).detections).toEqual([]);
  });

  it('drops a detection whose category is "allow" even if the detector reports it', () => {
    const policy = policyWith({ secret: 'allow', api_key: 'redact' });
    const multi: Detector = { ...wordDetector('multi', 'KEY'), categories: ['secret', 'api_key'] };
    expect(runDetection('a KEY', policy, [multi]).detections).toEqual([]);
  });
});

describe('whole-text detectors', () => {
  it('receive the whole text once instead of chunks', () => {
    const seen: number[] = [];
    const spy: Detector = {
      ...wordDetector('spy', 'NEEDLE', 'fullText'),
      detect(text, ctx) {
        seen.push(text.length);
        return wordDetector('spy', 'NEEDLE').detect(text, ctx);
      },
    };
    const text = `${'a '.repeat(25_000)}NEEDLE`;
    const result = runDetection(text, DEFAULT_POLICY, [spy]);
    expect(seen).toEqual([text.length]);
    expect(result.detections[0]?.start).toBe(text.length - 6);
  });

  it('chunk detectors receive several pieces of a long text', () => {
    const seen: number[] = [];
    const spy: Detector = {
      ...wordDetector('spy', 'x'),
      detect(text) {
        seen.push(text.length);
        return [];
      },
    };
    runDetection('a '.repeat(25_000), DEFAULT_POLICY, [spy]);
    expect(seen.length).toBe(3);
  });
});

describe('context cache', () => {
  it('reuses the prepared context for the same policy object', () => {
    expect(prepareContext(DEFAULT_POLICY, DETECTORS)).toBe(
      prepareContext(DEFAULT_POLICY, DETECTORS),
    );
  });

  it('reuses it for an equal policy built again (found by key)', () => {
    const a = prepareContext(policyWith(), DETECTORS);
    const b = prepareContext(policyWith(), DETECTORS);
    expect(a).toBe(b);
  });

  it('rebuilds when custom terms change', () => {
    const before = prepareContext(policyWith(), DETECTORS);
    const after = prepareContext(
      policyWith(
        {},
        { customTerms: [{ term: 'Apollo', category: 'project_name', wholeWord: true }] },
      ),
      DETECTORS,
    );
    expect(after).not.toBe(before);
  });

  it('rebuilds for a different detector list, but not for a copy of the same list', () => {
    const one = prepareContext(DEFAULT_POLICY, DETECTORS);
    expect(prepareContext(DEFAULT_POLICY, [...DETECTORS])).toBe(one); // same detectors → same
    const extended = [...DETECTORS, wordDetector('extra', 'x')];
    expect(prepareContext(DEFAULT_POLICY, extended)).not.toBe(one);
  });

  it('keeps at most 8 policies (oldest is dropped)', () => {
    const first = prepareContext(policyWith({}, { version: 100 }), DETECTORS);
    for (let v = 101; v <= 108; v++) prepareContext(policyWith({}, { version: v }), DETECTORS);
    expect(prepareContext(policyWith({}, { version: 100 }), DETECTORS)).not.toBe(first);
  });

  it('fnv1a gives the same hash for the same text and different hashes for different text', () => {
    expect(fnv1a('abc')).toBe(fnv1a('abc'));
    expect(fnv1a('abc')).not.toBe(fnv1a('abd'));
  });
});
