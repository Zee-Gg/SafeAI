/*
  Overlap rules, in order: block > custom term > higher confidence > longer > earlier start.
  Non-overlapping detections are untouched; exact duplicates disappear.
*/
import type { DetectorCategory, RuleAction } from '@safeai/shared';
import { describe, expect, it } from 'vitest';

import { resolveOverlaps } from '../src/overlap';
import type { Confidence, Detection } from '../src/types';

/** Builds a detection for tests. */
function d(
  start: number,
  end: number,
  category: DetectorCategory = 'secret',
  confidence: Confidence = 'medium',
  action: RuleAction = 'redact',
): Detection {
  return {
    id: `${category}:${start}:${end}`,
    start,
    end,
    value: 'x',
    category,
    confidence,
    ruleId: category,
    action,
  };
}

const ids = (list: Detection[]) => list.map((x) => x.id);

describe('resolveOverlaps', () => {
  it('leaves non-overlapping detections alone and sorts them by start', () => {
    const list = [d(20, 25), d(0, 5), d(5, 10)]; // touching (end 5 = start 5) is not overlapping
    expect(ids(resolveOverlaps(list))).toEqual(['secret:0:5', 'secret:5:10', 'secret:20:25']);
  });

  it('removes exact duplicates', () => {
    expect(resolveOverlaps([d(0, 5), d(0, 5)])).toHaveLength(1);
  });

  it('rule 1: a "block" detection beats everything', () => {
    const block = d(0, 3, 'email', 'low', 'block');
    const strong = d(0, 10, 'client_name', 'high', 'redact');
    expect(ids(resolveOverlaps([strong, block]))).toEqual([block.id]);
  });

  it('rule 2: custom-term categories beat built-in ones', () => {
    const custom = d(0, 3, 'project_name', 'low');
    const builtIn = d(0, 10, 'api_key', 'high');
    expect(ids(resolveOverlaps([builtIn, custom]))).toEqual([custom.id]);
  });

  it('rule 3: higher confidence beats lower', () => {
    const high = d(2, 6, 'api_key', 'high');
    const medium = d(0, 10, 'secret', 'medium');
    expect(ids(resolveOverlaps([medium, high]))).toEqual([high.id]);
  });

  it('rule 4: the longer match wins when confidence is equal', () => {
    expect(ids(resolveOverlaps([d(0, 4), d(2, 12)]))).toEqual(['secret:2:12']);
  });

  it('rule 5: the earlier start wins when everything else is equal', () => {
    expect(ids(resolveOverlaps([d(3, 8), d(0, 5)]))).toEqual(['secret:0:5']);
  });

  it('is deterministic for identical ranges in different categories', () => {
    const a = d(0, 5, 'phone');
    const b = d(0, 5, 'email');
    expect(ids(resolveOverlaps([a, b]))).toEqual(ids(resolveOverlaps([b, a])));
  });

  it('keeps a chain winner and drops only what overlaps the winners', () => {
    // A long medium in the middle overlaps two short highs; the highs win, the medium goes.
    const left = d(0, 5, 'api_key', 'high');
    const right = d(10, 15, 'api_key', 'high');
    const middle = d(3, 12, 'secret', 'medium');
    const far = d(30, 40, 'secret', 'low');
    expect(ids(resolveOverlaps([middle, far, right, left]))).toEqual([left.id, right.id, far.id]);
  });

  it('handles thousands of detections quickly', () => {
    const many = Array.from({ length: 5_000 }, (_, i) => d(i * 3, i * 3 + 5));
    const started = Date.now();
    const kept = resolveOverlaps(many);
    expect(Date.now() - started).toBeLessThan(200);
    expect(kept.length).toBeGreaterThan(0);
    for (let i = 1; i < kept.length; i++) {
      expect(kept[i]!.start).toBeGreaterThanOrEqual(kept[i - 1]!.end);
    }
  });
});
