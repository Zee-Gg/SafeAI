/*
  Bank account detector.
  - IBANs anywhere (high): must have a known country, the right length and pass mod-97.
  - Plain account numbers (medium): ONLY right after a label like "account number:" or "a/c",
    because 8–20 digits on their own are far too common. Only the number is caught, not the label.
*/
import type { Detector, RawDetection } from '../types';
import { compactIban, isValidIban } from '../utils/iban';
import { matchAll } from '../utils/match';

/*
  An IBAN candidate: 2 capital letters (country), 2 digits (check), then 11–40 capital letters,
  digits or spaces. It may only start where a word starts. The candidate may run on into
  following capital words; we trim it back group by group until it validates.
*/
const IBAN_CANDIDATE = /(?<![\dA-Z])[A-Z]{2}\d{2}[ \dA-Z]{11,40}/dg;

/*
  An account-number label, then the number (group 1):
  - label: "account number", "account no", "acct", "acct no", "a/c", "a/c no" or "IBAN"
    (any capitalisation, "no." may have a dot);
  - then optional spaces, and optionally a ":" "#" or "-" followed by more optional spaces
    (written so the two space runs can't "trade" characters, which would be slow on long
    runs of spaces; eslint-plugin-regexp caught the earlier version);
  - number: starts and ends with a digit, with digits, single spaces or dashes in between.
*/
const ACCOUNT_NUMBER =
  /\b(?:account\s+(?:number|no\.?)|acct\.?(?:\s+no\.?)?|a\/c(?:\s+no\.?)?|iban)\s*(?:[#:-]\s*)?(\d[\d -]{6,30}\d)(?![\d-])/dgi;

// Two separators in a row ("  ", "--", " -"), which real account numbers don't have.
const DOUBLE_SEPARATOR = /[ -]{2}/;
// Every character that is not a digit.
const NON_DIGITS = /\D/g;

/** Shortest IBAN in the registry (Norway), used to stop trimming. */
const MIN_IBAN_LENGTH = 15;

/** Trims an IBAN candidate back, one space-separated group at a time, until it validates. */
function findValidIban(candidate: string): string | null {
  let current = candidate.trimEnd();
  while (compactIban(current).length >= MIN_IBAN_LENGTH) {
    if (isValidIban(current)) return current;
    const lastSpace = current.lastIndexOf(' ');
    if (lastSpace === -1) return null;
    current = current.slice(0, lastSpace).trimEnd();
  }
  return null;
}

/** Finds IBANs and labelled account numbers. */
export const bankAccountDetector: Detector = {
  id: 'bank_account',
  categories: ['bank_account'],
  regexes: [IBAN_CANDIDATE, ACCOUNT_NUMBER, DOUBLE_SEPARATOR, NON_DIGITS],
  detect(text): RawDetection[] {
    const results: RawDetection[] = [];

    for (const match of matchAll(IBAN_CANDIDATE, text)) {
      const iban = findValidIban(match.value);
      if (!iban) continue;
      results.push({
        start: match.start,
        end: match.start + iban.length,
        value: iban,
        category: 'bank_account',
        confidence: 'high',
        ruleId: 'bank_account.iban',
      });
    }

    for (const match of matchAll(ACCOUNT_NUMBER, text, 1)) {
      const digitCount = match.value.replace(NON_DIGITS, '').length;
      if (digitCount < 8 || digitCount > 20 || DOUBLE_SEPARATOR.test(match.value)) continue;
      results.push({
        ...match,
        category: 'bank_account',
        confidence: 'medium',
        ruleId: 'bank_account.labelled_number',
      });
    }
    return results;
  },
};
