/*
  The detector registry: every detector, in priority order. The engine runs them in this order,
  and the regex-safety test checks every regex listed here.
  WHOLE-TEXT detectors (scope "fullText"): private-key (no regex) and jwt (flat regex), because
  what they find can be longer than the 500-character chunk overlap. All others run per chunk.
*/
import type { Detector } from '../types';
import { apiKeyDetector } from './api-key';
import { bankAccountDetector } from './bank-account';
import { creditCardDetector } from './credit-card';
import { emailDetector } from './email';
import { jwtDetector } from './jwt';
import { nationalIdDetector } from './national-id';
import { passwordDetector } from './password';
import { phoneDetector } from './phone';
import { privateKeyDetector } from './private-key';
import { secretEntropyDetector } from './secret-entropy';
import { tokenUrlDetector } from './token-url';

/** All detectors, in the order the engine runs them. */
export const DETECTORS: readonly Detector[] = [
  emailDetector,
  creditCardDetector,
  bankAccountDetector,
  nationalIdDetector,
  phoneDetector,
  apiKeyDetector,
  privateKeyDetector,
  jwtDetector,
  passwordDetector,
  tokenUrlDetector,
  secretEntropyDetector,
];

/** Every regex used by any detector, for the regex-safety test. */
export const ALL_DETECTOR_REGEXES: readonly RegExp[] = DETECTORS.flatMap((d) => d.regexes);
