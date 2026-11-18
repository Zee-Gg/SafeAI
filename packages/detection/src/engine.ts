/*
  The engine: detect(text, policy) finds sensitive items and returns them with the policy's
  action attached. Steps: prepare (cached) → chunk → run detectors → attach actions → remove
  chunk duplicates → resolve overlaps → sort and count. It never throws, and it stops with
  complete: false if the time budget runs out or a detector fails.
*/
import type { DetectorCategory, Policy } from '@safeai/shared';

import { dedupeAcrossChunks, splitIntoChunks, type Chunk } from './chunking';
import { now } from './clock';
import { prepareContext } from './context';
import { DETECTORS } from './detectors';
import { resolveOverlaps } from './overlap';
import type { Detection, DetectOptions, DetectResult, Detector } from './types';

export const DEFAULT_TIME_BUDGET_MS = 500;

/** Finds sensitive data in `text` according to `policy`. Never throws. */
export function detect(text: string, policy: Policy, options: DetectOptions = {}): DetectResult {
  return runDetection(text, policy, DETECTORS, options);
}

/** Same as detect(), but with a chosen detector list (used by tests). Never throws. */
export function runDetection(
  text: string,
  policy: Policy,
  detectors: readonly Detector[],
  options: DetectOptions = {},
): DetectResult {
  const startedAt = now();
  const budget = options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS;

  if (text.length === 0) return finish([], startedAt, true, []);

  try {
    const context = prepareContext(policy, detectors);
    const chunks = splitIntoChunks(text);
    const found: Detection[] = [];
    const failedDetectors: string[] = [];
    let complete = true;

    for (const detector of context.enabledDetectors) {
      const pieces: Chunk[] = detector.scope === 'fullText' ? [{ text, offset: 0 }] : chunks;
      for (const piece of pieces) {
        if (now() - startedAt >= budget) {
          return finish(found, startedAt, false, failedDetectors);
        }
        try {
          for (const raw of detector.detect(piece.text, context)) {
            const start = raw.start + piece.offset;
            const end = raw.end + piece.offset;
            const action = policy.rules[raw.category].action;
            if (action === 'allow' || start < 0 || end > text.length || end <= start) continue;
            found.push({
              ...raw,
              id: `${raw.category}:${start}:${end}`,
              start,
              end,
              value: text.slice(start, end),
              action,
            });
          }
        } catch {
          // One broken detector must not break the others. Report only its id, never the text.
          failedDetectors.push(detector.id);
          complete = false;
          break; // skip this detector's remaining chunks
        }
      }
    }
    return finish(found, startedAt, complete, failedDetectors);
  } catch {
    // Something outside a detector failed (e.g. a malformed policy): report "not complete".
    return finish([], startedAt, false, ['engine']);
  }
}

/** Removes chunk duplicates, resolves overlaps, sorts, counts and measures time. */
function finish(
  found: readonly Detection[],
  startedAt: number,
  complete: boolean,
  failedDetectors: string[],
): DetectResult {
  const detections = resolveOverlaps(dedupeAcrossChunks(found)); // already sorted by start
  const countsByCategory: Partial<Record<DetectorCategory, number>> = {};
  for (const detection of detections) {
    countsByCategory[detection.category] = (countsByCategory[detection.category] ?? 0) + 1;
  }
  return {
    detections,
    countsByCategory,
    durationMs: now() - startedAt,
    complete,
    failedDetectors,
  };
}
