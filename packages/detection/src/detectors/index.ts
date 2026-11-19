/*
  The detector registry: every detector, in priority order. The engine runs them in this order,
  and the regex-safety test checks every regex listed here.
  WHOLE-TEXT detectors (scope "fullText"): private-key (no regex), jwt (flat regex) and
  custom-terms (Aho-Corasick, no regex), because what they find can be longer than the
  500-character chunk overlap, or chunking adds nothing. All others run per chunk.
*/
import type { Detector } from '../types';
import { addressDetector } from './address';
import { apiKeyDetector } from './api-key';
import { bankAccountDetector } from './bank-account';
import { creditCardDetector } from './credit-card';
import { customTermsDetector } from './custom-terms';
import { emailDetector } from './email';
import { jwtDetector } from './jwt';
import { nationalIdDetector } from './national-id';
import { passwordDetector } from './password';
import { personNameDetector } from './person-name';
import { phoneDetector } from './phone';
import { privateKeyDetector } from './private-key';
import { secretEntropyDetector } from './secret-entropy';
import { tokenUrlDetector } from './token-url';

/** All detectors, in the order the engine runs them. */
export const DETECTORS: readonly Detector[] = [
  customTermsDetector,
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
  personNameDetector,
  addressDetector,
];

/** Every regex used by any detector, for the regex-safety test. */
export const ALL_DETECTOR_REGEXES: readonly RegExp[] = DETECTORS.flatMap((d) => d.regexes);
