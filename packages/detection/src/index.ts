/*
  The public front door of @safeai/detection. Other packages import ONLY from here:
  detect() and the types. Everything else (utils, detectors, cache) is internal.
*/
export { DEFAULT_TIME_BUDGET_MS, detect } from './engine';
export type { Confidence, Detection, DetectOptions, DetectResult, RawDetection } from './types';
