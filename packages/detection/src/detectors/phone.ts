/*
  Phone number detector, using libphonenumber-js with "max" metadata (strict per-country rules).
  Its findPhoneNumbersInText() is a port of Google's PhoneNumberMatcher: it finds candidates,
  handles brackets/dashes/spaces and only returns numbers valid for a real number range.
  Our extra filters drop order numbers, prices, dates and card numbers. Confidence: high when
  written internationally (+92…), medium otherwise.
  SPEED: the library is thorough but slow on long text, so a cheap pre-filter first finds the
  few spots that could hold a phone number (7+ digits), and the library only checks those
  spots plus some surrounding context, never the whole text.
*/
import { findPhoneNumbersInText, isSupportedCountry } from 'libphonenumber-js/max';

import type { Detector, RawDetection } from '../types';
import { passesLuhn } from '../utils/luhn';
import { matchAll } from '../utils/match';

/** Real phone numbers have at least this many digits (without the country code). */
const MIN_NATIONAL_DIGITS = 7;

/*
  Pre-filter: a stretch that could hold a phone number. An optional "+" or "(", a digit, then
  5–40 digits or phone punctuation (space . - / ( )), ending with a digit. Flat (one bounded
  quantifier), so it's fast on any text.
*/
const DIGIT_RUN = /[(+]?\d[\d ()./-]{5,40}\d/dg;

/** Characters of context kept on each side of a digit run (e.g. for "ext. 22"). */
const CONTEXT = 20;
/** How much further a window may grow so it never cuts a word or number in half. */
const MAX_WIDEN = 20;
/**
 * Windows closer together than this are merged into one. Each library call has a start-up
 * cost, so one slightly longer call beats several tiny ones (text full of phone numbers).
 */
const MERGE_GAP = 100;

// One whitespace character (where a window may safely start or end).
const WHITESPACE_CHAR = /\s/;

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

/**
 * The small windows of text the phone library should check: each digit run with 7+ digits,
 * plus 20 characters on each side, widened to the nearest whitespace (so no word or number is
 * cut in half). Windows that overlap or are less than 100 characters apart are merged.
 * Sorted by position.
 */
export function phoneWindows(text: string): { start: number; end: number }[] {
  const windows: { start: number; end: number }[] = [];
  for (const run of matchAll(DIGIT_RUN, text)) {
    if (run.value.replace(NON_DIGITS, '').length < MIN_NATIONAL_DIGITS) continue;

    let start = Math.max(0, run.start - CONTEXT);
    const minStart = Math.max(0, start - MAX_WIDEN);
    while (start > minStart && !WHITESPACE_CHAR.test(text.charAt(start - 1))) start--;

    let end = Math.min(text.length, run.end + CONTEXT);
    const maxEnd = Math.min(text.length, end + MAX_WIDEN);
    while (end < maxEnd && !WHITESPACE_CHAR.test(text.charAt(end))) end++;

    const last = windows[windows.length - 1];
    if (last && start <= last.end + MERGE_GAP) last.end = Math.max(last.end, end);
    else windows.push({ start, end });
  }
  return windows;
}

/** Finds phone numbers valid in the policy's default country, or written with +country code. */
export const phoneDetector: Detector = {
  id: 'phone',
  categories: ['phone'],
  regexes: [NUMBER_PREFIX_TO_SKIP, DATE_LIKE, NON_DIGITS, DIGIT_RUN, WHITESPACE_CHAR],
  detect(text, ctx): RawDetection[] {
    const country = ctx.policy.defaultPhoneCountry;
    // isSupportedCountry() also tells TypeScript that `country` is a valid CountryCode.
    const options = isSupportedCountry(country) ? { defaultCountry: country } : {};
    const results: RawDetection[] = [];

    // The library only reads the small windows, never the whole text.
    for (const window of phoneWindows(text)) {
      const piece = text.slice(window.start, window.end);
      for (const found of findPhoneNumbersInText(piece, options)) {
        const start = window.start + found.startsAt;
        const end = window.start + found.endsAt;
        const value = text.slice(start, end);
        if (found.number.nationalNumber.length < MIN_NATIONAL_DIGITS) continue;
        if (looksLikeSomethingElse(text, start, value)) continue;
        const international = value.startsWith('+') || value.startsWith('00');
        results.push({
          start,
          end,
          value,
          category: 'phone',
          confidence: international ? 'high' : 'medium',
          ruleId: international ? 'phone.international' : 'phone.national',
        });
      }
    }
    return results;
  },
};
