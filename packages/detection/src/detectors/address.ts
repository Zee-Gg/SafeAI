/*
  Address detector: LOW confidence by design (addresses are varied and easy to confuse with
  ordinary text), so by default they only produce a warning.
  - street: house number + 1–4 capitalised words + Street/Road/Avenue/…/Block/Sector/Phase/Town/Colony
  - "House #12, Street 5" style (common in Pakistan)
  - UK postcodes (SW1A 1AA), US "State ZIP" (NY 10001)
  - 5-digit codes only after "postal code"/"zip" or a major city name
  Must NOT catch: "Road map", "Phase 2 of the project", "Block quote".
*/
import type { Detector, RawDetection } from '../types';
import { matchAll } from '../utils/match';

// A street-type word (capitalised, as in addresses). Only the short forms (St, Rd, Ave, Ln,
// Blvd) may take a dot, so a sentence's full stop after "Colony." is not included.
const STREET_SUFFIX =
  /\b(?:(?:Street|Road|Avenue|Lane|Boulevard|Drive|Block|Sector|Phase|Town|Colony)\b|(?:St|Rd|Ave|Ln|Blvd)\b\.?)/dg;
// A house number word: 1–5 digits with an optional letter and comma (221B, 12, 12,).
const HOUSE_NUMBER_WORD = /^\d{1,5}[A-Za-z]?,?$/;
// A capitalised word inside a street name (Baker, Model, Gulshan-e-Iqbal, O'Neil).
const CAPITALISED_WORD = /^[A-Z][\w'.-]*,?$/;
// "House #12, Street 5" / "H No. 7 Street 3": house + number, then street + number.
const HOUSE_AND_STREET =
  /\b(?:House|H)[ \t]*(?:#|No\.?)[ \t]*\d{1,5}[A-Za-z]?,?[ \t]+Street[ \t]*(?:#|No\.?)?[ \t]*\d{1,4}\b/dgi;
// UK postcode: 1–2 letters, a digit, optional letter/digit, optional space, digit, 2 letters.
const UK_POSTCODE = /\b[A-Z]{1,2}\d[\dA-Z]? ?\d[A-Z]{2}\b/dg;
// US state code + space + 5-digit ZIP (optionally +4): "NY 10001", "CA 94105-1234".
const US_STATE_ZIP =
  /\b(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC) \d{5}(?:-\d{4})?\b/dg;
// "postal code" / "post code" / "postcode" / "zip code" / "zip", or a major PK/UAE city, then
// optional ":" or "#" and spaces, then a 5-digit code (group "code").
const LABELLED_POSTAL_CODE =
  /\b(?:postal[ \t]+code|post[ \t]?code|zip(?:[ \t]+code)?|Lahore|Karachi|Islamabad|Rawalpindi|Faisalabad|Multan|Peshawar|Quetta|Sialkot|Hyderabad|Dubai|Sharjah)[ \t]*[#:]?[ \t]*(?<code>\d{5})\b/dgi;

// One whitespace character (a word boundary when walking back over the street name).
const WHITESPACE_CHAR = /\s/;
// One ASCII letter (to read the word after a street word).
const LETTER = /[a-z]/i;

/** Words that make a "street word" mean something else ("Road map", "Block quote"). */
const NOT_ADDRESS_AFTER = new Set(['map', 'maps', 'quote', 'quotes', 'diagram', 'chain', 'test']);
/** How many words may sit between the house number and the street word. */
const MAX_NAME_WORDS = 4;

/**
 * Looks back from a street word for "number + 1–4 capitalised words" on the same line.
 * Returns where the house number starts, or -1.
 */
function houseNumberStart(text: string, suffixStart: number): number {
  let pos = suffixStart;
  for (let words = 0; words <= MAX_NAME_WORDS; words++) {
    let wordEnd = pos;
    while (wordEnd > 0 && text.charAt(wordEnd - 1) === ' ') wordEnd--;
    if (wordEnd === pos) return -1; // words must be separated by spaces
    let wordStart = wordEnd;
    while (
      wordStart > 0 &&
      wordEnd - wordStart < 30 &&
      !WHITESPACE_CHAR.test(text.charAt(wordStart - 1))
    ) {
      wordStart--;
    }
    const word = text.slice(wordStart, wordEnd);
    if (HOUSE_NUMBER_WORD.test(word)) return words >= 1 ? wordStart : -1;
    if (!CAPITALISED_WORD.test(word)) return -1;
    pos = wordStart;
  }
  return -1;
}

/** The next word after `index` (lowercase), e.g. "map" in "Road map". */
function wordAfter(text: string, index: number): string {
  let start = index;
  while (text.charAt(start) === ' ') start++;
  let end = start;
  while (end < text.length && end - start < 20 && LETTER.test(text.charAt(end))) end++;
  return text.slice(start, end).toLowerCase();
}

/** Builds one address detection. */
function hit(text: string, start: number, end: number, rule: string): RawDetection {
  return {
    start,
    end,
    value: text.slice(start, end),
    category: 'address',
    confidence: 'low',
    ruleId: `address.${rule}`,
  };
}

/** Finds street addresses and postal codes (low confidence). */
export const addressDetector: Detector = {
  id: 'address',
  categories: ['address'],
  regexes: [
    STREET_SUFFIX,
    HOUSE_NUMBER_WORD,
    CAPITALISED_WORD,
    HOUSE_AND_STREET,
    UK_POSTCODE,
    US_STATE_ZIP,
    LABELLED_POSTAL_CODE,
    WHITESPACE_CHAR,
    LETTER,
  ],
  detect(text): RawDetection[] {
    const results: RawDetection[] = [];

    for (const m of matchAll(STREET_SUFFIX, text)) {
      if (NOT_ADDRESS_AFTER.has(wordAfter(text, m.end))) continue;
      const start = houseNumberStart(text, m.start);
      if (start !== -1) results.push(hit(text, start, m.end, 'street'));
    }
    for (const m of matchAll(HOUSE_AND_STREET, text)) {
      results.push(hit(text, m.start, m.end, 'house_street'));
    }
    for (const m of matchAll(UK_POSTCODE, text))
      results.push(hit(text, m.start, m.end, 'uk_postcode'));
    for (const m of matchAll(US_STATE_ZIP, text)) results.push(hit(text, m.start, m.end, 'us_zip'));
    for (const m of matchAll(LABELLED_POSTAL_CODE, text, 'code')) {
      results.push(hit(text, m.start, m.end, 'postal_code'));
    }
    return results;
  },
};
