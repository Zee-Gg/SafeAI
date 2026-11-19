/*
  JWT detector (JSON Web Tokens, e.g. login/session tokens and Supabase legacy keys).
  RUNS ON THE WHOLE TEXT (scope "fullText"): JWTs are often 800–1,500 characters, so one could
  cross a 20,000-character chunk border. The regex is "flat" (no nested quantifiers) and may only
  start at the beginning of a token, so it stays linear even on very long text. Confidence: high.
  Format: RFC 7519 (https://datatracker.ietf.org/doc/html/rfc7519).
*/
import type { Detector, RawDetection } from '../types';
import { matchAll } from '../utils/match';

/*
  A JWT: three base64url parts separated by dots.
  - (?<![\w-])       may only start where a token starts;
  - eyJ[\w-]{10,}    header: starts with "eyJ" (base64 of '{"'), then 10+ base64url characters;
  - \.eyJ[\w-]{10,}  payload: also a JSON object, so also starts with "eyJ";
  - \.[\w-]*         signature: base64url characters (may be empty for unsigned tokens);
  - (?![\w-])        must end where the token ends.
  Each part is ONE flat character run, and the dots are not in that run, so there is only one
  way to match — no backtracking blow-up.
*/
const JWT = /(?<![\w-])eyJ[\w-]{10,}\.eyJ[\w-]{10,}\.[\w-]*(?![\w-])/dg;

/** Finds JSON Web Tokens anywhere in the whole text. */
export const jwtDetector: Detector = {
  id: 'jwt',
  categories: ['api_key'],
  regexes: [JWT],
  scope: 'fullText',
  detect(text): RawDetection[] {
    return matchAll(JWT, text).map((match) => ({
      ...match,
      category: 'api_key',
      confidence: 'high',
      ruleId: 'api_key.jwt',
    }));
  },
};
