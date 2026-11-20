/*
  The public front door of @safeai/detection. Other packages import ONLY from here:
  detect() and the types. Everything else (utils, detectors, cache) is internal.
*/
export { DEFAULT_TIME_BUDGET_MS, detect } from './engine';
// Exported in Phase 3 so custom-term values are matched for placeholder reuse exactly like the
// engine matches them (lowercase, NFKC, single spaces).
export { normalizeTerm } from './utils/normalize';
export type { Confidence, Detection, DetectOptions, DetectResult, RawDetection } from './types';
