/*
  Password detector: a password label followed by ":" or "=" and a value. Catches ONLY the value.
  "password: Hunter2!" → "Hunter2!", "DB_PASSWORD=abc123" → "abc123", "password": "secret" → "secret".
  Plain phrases like "forgot password?" or "the password field" have no ":"/"=" and are skipped.
  Confidence: high.
*/
import type { Detector, RawDetection } from '../types';
import { matchAll } from '../utils/match';

/*
  Label part (shared by both regexes below):
  - (?<![a-z])  not glued to letters before it ("bypass", "spin" don't count), but "DB_PASSWORD"
                and "user.password" do;
  - password | passwd | pwd | passcode | pass | pin  (passcode before pass, so it wins);
  - ["']?       an optional closing quote, as in JSON: "password": …;
  - \s*[:=]\s*  then ":" or "=" with optional spaces around it.
*/

// Label, then a QUOTED value (group "value"): "…" or '…', up to 200 characters, one line.
const PASSWORD_QUOTED =
  /(?<![a-z])(?:password|passwd|pwd|passcode|pass|pin)["']?\s*[:=]\s*(?<quote>["'])(?<value>[^\n\r"']{1,200})\k<quote>/dgi;

// Label, then an UNQUOTED value (group "value"): up to 200 characters, stopping at whitespace,
// quotes, commas, semicolons and "&" (connection strings and query strings).
const PASSWORD_PLAIN =
  /(?<![a-z])(?:password|passwd|pwd|passcode|pass|pin)["']?\s*[:=]\s*(?<value>[^\s"&',;]{1,200})/dgi;

/** Values that are clearly not a real password (settings, placeholders). */
const NOT_A_PASSWORD = new Set([
  'true',
  'false',
  'null',
  'none',
  'nil',
  'undefined',
  'required',
  'optional',
  'string',
  'yes',
  'no',
  'empty',
]);

// Placeholders: starts with $ { < % * (e.g. ${DB_PASS}, {{ pass }}, <your password>, ****).
const PLACEHOLDER_START = /^[$%*<{]/;
// Code that READS a password instead of containing one: process.env…, getenv(…), any "(".
const CODE_REFERENCE = /process\.env|getenv|\(/i;

/** True if the value is worth reporting as a password. */
function isRealPasswordValue(value: string): boolean {
  if (value.length < 3) return false;
  if (NOT_A_PASSWORD.has(value.toLowerCase())) return false;
  return !PLACEHOLDER_START.test(value) && !CODE_REFERENCE.test(value);
}

/** Finds password values after a password label. */
export const passwordDetector: Detector = {
  id: 'password',
  categories: ['password'],
  regexes: [PASSWORD_QUOTED, PASSWORD_PLAIN, PLACEHOLDER_START, CODE_REFERENCE],
  detect(text): RawDetection[] {
    const seenStarts = new Set<number>();
    const results: RawDetection[] = [];
    // Quoted first: if a value is quoted, the quoted version (which may contain spaces) wins.
    for (const regex of [PASSWORD_QUOTED, PASSWORD_PLAIN]) {
      for (const match of matchAll(regex, text, 'value')) {
        if (seenStarts.has(match.start) || !isRealPasswordValue(match.value)) continue;
        seenStarts.add(match.start);
        results.push({ ...match, category: 'password', confidence: 'high', ruleId: 'password' });
      }
    }
    return results;
  },
};
