/*
  National ID detector for PK (CNIC), US (SSN), UK (National Insurance number) and AE (Emirates ID).
  Only countries listed in policy.nationalIdCountries are checked. Each country = a candidate
  regex (cheap "ID-shaped" search) + a validate function (rejects impossible numbers).
*/
import type { NationalIdCountry } from '@safeai/shared';

import type { Confidence, Detector, RawDetection } from '../types';
import { matchAll } from '../utils/match';

// Pakistani CNIC with dashes: 5 digits, dash, 7 digits, dash, 1 digit (12345-1234567-1).
const PK_CNIC_DASHED = /(?<![\d-])\d{5}-\d{7}-\d(?![\d-])/dg;
// Pakistani CNIC without dashes: exactly 13 digits, not part of a longer number.
const PK_CNIC_PLAIN = /(?<!\d)\d{13}(?!\d)/dg;
// Words that say "this is an identity card number" (whole words, any capitalisation).
const PK_CONTEXT = /\b(?:cnic|nic|id card|identity card)\b/i;
// US Social Security number: 3 digits, dash, 2 digits, dash, 4 digits (123-45-6789).
const US_SSN = /(?<![\d-])\d{3}-\d{2}-\d{4}(?![\d-])/dg;
// UK National Insurance number: 2 capital letters, 6 digits in pairs (spaces optional), A–D.
const UK_NINO = /(?<![\dA-Z])[A-Z]{2} ?\d{2} ?\d{2} ?\d{2} ?[A-D](?![\dA-Z])/dg;
// UAE Emirates ID: 784, 4-digit year, 7 digits, 1 check digit; dashes optional (15 digits).
const AE_EMIRATES_ID = /(?<![\d-])784-?\d{4}-?\d{7}-?\d(?![\d-])/dg;
// Every character that is not a digit.
const NON_DIGITS = /\D/g;
// Every space.
const SPACES = / /g;

/** How far (in characters) before/after a plain CNIC we look for a context word. */
const CONTEXT_WINDOW = 30;

/** Valid CNIC: 13 digits, first digit is a province code 1–7. */
export function validatePkCnic(value: string): boolean {
  const digits = value.replace(NON_DIGITS, '');
  return digits.length === 13 && digits[0] !== undefined && digits[0] >= '1' && digits[0] <= '7';
}

/** Valid SSN: area not 000, 666 or 900–999; group not 00; serial not 0000. */
export function validateUsSsn(value: string): boolean {
  const [area = '', group = '', serial = ''] = value.split('-');
  if (area === '000' || area === '666' || area.startsWith('9')) return false;
  return group !== '00' && serial !== '0000';
}

const NINO_BAD_LETTERS = 'DFIQUV';
const NINO_BAD_PREFIXES = new Set(['BG', 'GB', 'KN', 'NK', 'NT', 'TN', 'ZZ']);

/** Valid UK NINO: allowed prefix letters and a final letter A–D. */
export function validateUkNino(value: string): boolean {
  const compact = value.replace(SPACES, '');
  const first = compact.charAt(0);
  const second = compact.charAt(1);
  const suffix = compact.charAt(compact.length - 1);
  if (compact.length !== 9) return false;
  if (NINO_BAD_LETTERS.includes(first) || NINO_BAD_LETTERS.includes(second) || second === 'O') {
    return false;
  }
  return !NINO_BAD_PREFIXES.has(first + second) && 'ABCD'.includes(suffix);
}

/** Valid Emirates ID: 15 digits starting with 784. */
export function validateAeEmiratesId(value: string): boolean {
  const digits = value.replace(NON_DIGITS, '');
  return digits.length === 15 && digits.startsWith('784');
}

/** True if a CNIC context word appears within 30 characters before or after [start, end). */
function hasCnicContext(text: string, start: number, end: number): boolean {
  const around = text.slice(Math.max(0, start - CONTEXT_WINDOW), end + CONTEXT_WINDOW);
  return PK_CONTEXT.test(around);
}

/** Builds one national-ID detection. */
function hit(
  match: { start: number; end: number; value: string },
  confidence: Confidence,
  ruleId: string,
): RawDetection {
  return { ...match, category: 'national_id', confidence, ruleId };
}

/** Each country's search, run only when that country is switched on in the policy. */
const COUNTRY_SEARCHES: Record<NationalIdCountry, (text: string) => RawDetection[]> = {
  PK(text) {
    const results = matchAll(PK_CNIC_DASHED, text)
      .filter((m) => validatePkCnic(m.value))
      .map((m) => hit(m, 'medium', 'national_id.pk_cnic'));
    for (const m of matchAll(PK_CNIC_PLAIN, text)) {
      if (!validatePkCnic(m.value)) continue;
      const context = hasCnicContext(text, m.start, m.end);
      // Without context, 13 digits starting with 1 are far more often a millisecond timestamp
      // (e.g. 1731974400000) than an ID, so we skip them; with "CNIC" nearby we keep them.
      if (!context && m.value.startsWith('1')) continue;
      results.push(hit(m, context ? 'medium' : 'low', 'national_id.pk_cnic_plain'));
    }
    return results;
  },
  US: (text) =>
    matchAll(US_SSN, text)
      .filter((m) => validateUsSsn(m.value))
      .map((m) => hit(m, 'medium', 'national_id.us_ssn')),
  UK: (text) =>
    matchAll(UK_NINO, text)
      .filter((m) => validateUkNino(m.value))
      .map((m) => hit(m, 'medium', 'national_id.uk_nino')),
  AE: (text) =>
    matchAll(AE_EMIRATES_ID, text)
      .filter((m) => validateAeEmiratesId(m.value))
      .map((m) => hit(m, 'medium', 'national_id.ae_emirates_id')),
};

/** Finds national ID numbers for the countries switched on in the policy. */
export const nationalIdDetector: Detector = {
  id: 'national_id',
  categories: ['national_id'],
  regexes: [
    PK_CNIC_DASHED,
    PK_CNIC_PLAIN,
    PK_CONTEXT,
    US_SSN,
    UK_NINO,
    AE_EMIRATES_ID,
    NON_DIGITS,
    SPACES,
  ],
  detect(text, ctx): RawDetection[] {
    return ctx.policy.nationalIdCountries.flatMap((country) => COUNTRY_SEARCHES[country](text));
  },
};
