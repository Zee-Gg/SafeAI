/*
  The detector registry: every detector, in priority order. The engine runs them in this order,
  and the regex-safety test checks every regex listed here.
  M3: email + structured data (card, bank, national ID, phone). Secrets come in M4, context in M5.
*/
import type { Detector } from '../types';
import { bankAccountDetector } from './bank-account';
import { creditCardDetector } from './credit-card';
import { emailDetector } from './email';
import { nationalIdDetector } from './national-id';
import { phoneDetector } from './phone';

/** All detectors, in the order the engine runs them. */
export const DETECTORS: readonly Detector[] = [
  emailDetector,
  creditCardDetector,
  bankAccountDetector,
  nationalIdDetector,
  phoneDetector,
];

/** Every regex used by any detector, for the regex-safety test. */
export const ALL_DETECTOR_REGEXES: readonly RegExp[] = DETECTORS.flatMap((d) => d.regexes);
