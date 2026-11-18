/*
  The detector registry: every detector, in priority order. The engine runs them in this order,
  and the regex-safety test checks every regex listed here.
  M2: email only; the other detectors are added in M3–M5.
*/
import type { Detector } from '../types';
import { emailDetector } from './email';

/** All detectors, in the order the engine runs them. */
export const DETECTORS: readonly Detector[] = [emailDetector];

/** Every regex used by any detector, for the regex-safety test. */
export const ALL_DETECTOR_REGEXES: readonly RegExp[] = DETECTORS.flatMap((d) => d.regexes);
