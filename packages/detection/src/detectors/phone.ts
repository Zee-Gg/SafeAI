/*
  Phone number detector, using libphonenumber-js with "max" metadata (strict per-country rules).
  Its findPhoneNumbersInText() is a port of Google's PhoneNumberMatcher: it finds candidates,
  handles brackets/dashes/spaces and only returns numbers valid for a real number range.
  Our extra filters drop order numbers, prices, dates and card numbers. Confidence: high when
  written internationally (+92…), medium otherwise.
*/
import { findPhoneNumbersInText, isSupportedCountry } from 'libphonenumber-js/max';

import type { Detector, RawDetection } from '../types';
import { passesLuhn } from '../utils/luhn';

/** Real phone numbers have at least this many digits (without the country code). */
const MIN_NATIONAL_DIGITS = 7;

// Just before the number: a "#" (order/ticket numbers) or a currency sign/code (prices),
// optionally followed by spaces. Matched at the END of the 6 characters before the number.
const NUMBER_PREFIX_TO_SKIP = /(?:[#$£¥€]|\b(?:rs|pkr|usd|aed)\.?)\s*$/i;

// A date: 2026-11-18, 18/11/2026, 18.11.26 and similar.
const DATE_LIKE = /^(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4})$/;

// Every character that is not a digit.
const NON_DIGITS = /\D/g;

/** True if the found number is really something else (order no., price, date, card number). */
function looksLikeSomethingElse(text: string, start: number, value: string): boolean {
  if (NUMBER_PREFIX_TO_SKIP.test(text.slice(Math.max(0, start - 6), start))) return true;
  if (DATE_LIKE.test(value.trim())) return true;
  const digits = value.replace(NON_DIGITS, '');
  return digits.length >= 13 && digits.length <= 19 && passesLuhn(digits);
}

/** Finds phone numbers valid in the policy's default country, or written with +country code. */
export const phoneDetector: Detector = {
  id: 'phone',
  categories: ['phone'],
  regexes: [NUMBER_PREFIX_TO_SKIP, DATE_LIKE, NON_DIGITS],
  detect(text, ctx): RawDetection[] {
    const country = ctx.policy.defaultPhoneCountry;
    // isSupportedCountry() also tells TypeScript that `country` is a valid CountryCode.
    const options = isSupportedCountry(country) ? { defaultCountry: country } : {};
    const results: RawDetection[] = [];

    for (const found of findPhoneNumbersInText(text, options)) {
      const value = text.slice(found.startsAt, found.endsAt);
      if (found.number.nationalNumber.length < MIN_NATIONAL_DIGITS) continue;
      if (looksLikeSomethingElse(text, found.startsAt, value)) continue;
      const international = value.startsWith('+') || value.startsWith('00');
      results.push({
        start: found.startsAt,
        end: found.endsAt,
        value,
        category: 'phone',
        confidence: international ? 'high' : 'medium',
        ruleId: international ? 'phone.international' : 'phone.national',
      });
    }
    return results;
  },
};
