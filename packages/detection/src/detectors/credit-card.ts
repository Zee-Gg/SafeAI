/*
  Payment card detector: 13–19 digits (spaces or dashes allowed between groups) that pass the
  Luhn checksum AND start with a known card-network prefix. Both checks together make random
  numbers (order IDs, tracking numbers) very unlikely to match. Confidence: high.
*/
import type { Detector, RawDetection } from '../types';
import { passesLuhn } from '../utils/luhn';
import { matchAll } from '../utils/match';

/*
  A card-number candidate, not glued to other digits or dashes:
  - 4-4-4-(1–7) digits, with the SAME separator each time (one space, one dash, or none), which
    also covers 13–19 digits written without separators; or
  - 4-6-(4–5) digits (Amex and Diners style), again with one consistent separator.
*/
const CARD_CANDIDATE =
  /(?<![\d-])(?:\d{4}([ -]?)\d{4}\1\d{4}\1\d{1,7}|\d{4}([ -]?)\d{6}\2\d{4,5})(?![\d-])/dg;

// Every character that is not a digit.
const NON_DIGITS = /\D/g;

/** Card network for a digit string, or null if no known network uses that prefix. */
export function cardNetwork(digits: string): string | null {
  const two = Number(digits.slice(0, 2));
  const three = Number(digits.slice(0, 3));
  const four = Number(digits.slice(0, 4));
  if (digits.startsWith('4')) return 'visa';
  if ((two >= 51 && two <= 55) || (four >= 2221 && four <= 2720)) return 'mastercard';
  if (two === 34 || two === 37) return 'amex';
  if (four === 6011 || two === 65 || (three >= 644 && three <= 649)) return 'discover';
  if (two === 62) return 'unionpay';
  if (four >= 3528 && four <= 3589) return 'jcb';
  if (two === 36 || two === 38 || (three >= 300 && three <= 305)) return 'diners';
  return null;
}

/** Finds payment card numbers. */
export const creditCardDetector: Detector = {
  id: 'credit_card',
  categories: ['credit_card'],
  regexes: [CARD_CANDIDATE, NON_DIGITS],
  detect(text): RawDetection[] {
    const results: RawDetection[] = [];
    for (const match of matchAll(CARD_CANDIDATE, text)) {
      const digits = match.value.replace(NON_DIGITS, '');
      if (digits.length < 13 || digits.length > 19) continue;
      const network = cardNetwork(digits);
      if (!network || !passesLuhn(digits)) continue;
      results.push({
        ...match,
        category: 'credit_card',
        confidence: 'high',
        ruleId: `credit_card.${network}`,
      });
    }
    return results;
  },
};
