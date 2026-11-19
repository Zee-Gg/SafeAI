/*
  Person name detector: CONTEXT ONLY. Capital letters alone are never enough (that would flag
  every product, city and sentence start). Catches ONLY the name, never the title or greeting.
  - "Mr/Mrs/Ms/Miss/Dr/Prof/Sir" + 1–3 capitalised words           → medium
  - "name:" / "full name =" + 1–4 capitalised words                  → medium
  - "Dear/Hi/Hello/Hey" at line start + 1–3 words, then "," or line end → low
  - "Regards," / "Thanks," / "Best," … then a name on the next line   → low
  Regexes only find the TRIGGER; plain code then reads the name words (no nested quantifiers).
*/
import type { Confidence, Detector, RawDetection } from '../types';
import { matchAll } from '../utils/match';

// A title, optional dot, then spaces, right before a capital letter: "Dr. " in "Dr. Ayesha".
const TITLE = /\b(?:Mr|Mrs|Ms|Miss|Dr|Prof|Sir)\.?[ \t]+(?=\p{Lu})/dgu;
// A "name" label (not glued to letters before it, so "username" doesn't count), then ":" or
// "=", then spaces: "Full name: ", "NAME = ".
const NAME_LABEL = /(?<![\p{L}\p{N}_])(?:full[ \t]+name|name)[ \t]*[:=][ \t]*/dgiu;
// A greeting word at the start of a line, then spaces: "Hi ", "Dear ".
const GREETING = /^[ \t]*(?:Dear|Hi|Hello|Hey)[ \t]+/dgmu;
// A sign-off alone on its line (optional comma), then the line break and any indentation of
// the next line, where the name is expected: "Regards,⏎".
const SIGN_OFF =
  /^[ \t]*(?:Best[ \t]+regards|Kind[ \t]+regards|Warm[ \t]+regards|Regards|Thanks|Thank[ \t]+you|Best|Sincerely|Cheers),?[ \t]*\r?\n[ \t]*/dgmu;
// One name word: a capital letter, then letters, accents, apostrophes or hyphens (O'Neil, Al-Khan).
const NAME_WORD = /^\p{Lu}[\p{L}\p{M}'’-]*$/u;
// One character that can be part of a name word.
const NAME_CHAR = /[\p{L}\p{M}'’-]/u;
// What may follow a greeting's name: optional spaces, then a comma, "!", a line break or the end.
const GREETING_END = /^[ \t]*(?:[!,]|\r?\n|$)/;

/** Words after a greeting/sign-off that are not names ("Hi team", "Thanks, The Team"). */
const NOT_NAMES = new Set([
  'team',
  'all',
  'everyone',
  'everybody',
  'there',
  'guys',
  'sir',
  'madam',
  'folks',
  'friends',
  'the',
]);
/** Titles: when a greeting is followed by a title, the title rule reports the name instead. */
const TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'sir']);
/** Labels like "company name:" or "user name:" are not about a person. */
const NON_PERSON_LABELS = new Set([
  'company',
  'business',
  'file',
  'user',
  'project',
  'host',
  'domain',
  'display',
  'product',
  'brand',
  'app',
  'account',
  'bank',
  'street',
  'city',
  'field',
  'variable',
]);

/** Where a run of name words starts and ends, and the first word (for the ignore lists). */
interface NameSpan {
  start: number;
  end: number;
  firstWord: string;
}

/**
 * Reads up to `maxWords` capitalised words starting at `from`, separated by spaces/tabs only.
 * Stops at the first word that isn't capitalised. A possessive "'s" ends the name before it.
 */
function readNameWords(text: string, from: number, maxWords: number): NameSpan | null {
  let pos = from;
  let end = -1;
  let firstWord = '';
  for (let words = 0; words < maxWords; words++) {
    let wordEnd = pos;
    while (wordEnd < text.length && wordEnd - pos < 40 && NAME_CHAR.test(text.charAt(wordEnd))) {
      wordEnd++;
    }
    const word = text.slice(pos, wordEnd);
    if (!NAME_WORD.test(word)) break;
    if (words === 0) firstWord = word;
    if (word.endsWith("'s") || word.endsWith('’s')) {
      end = wordEnd - 2; // "Smith's" → "Smith", and the name ends here
      break;
    }
    end = wordEnd;
    // Continue only over spaces/tabs (never across a line break).
    let next = wordEnd;
    while (text.charAt(next) === ' ' || text.charAt(next) === '\t') next++;
    if (next === wordEnd) break;
    pos = next;
  }
  return end > from ? { start: from, end, firstWord } : null;
}

/** Builds one person-name detection. */
function hit(text: string, span: NameSpan, confidence: Confidence, rule: string): RawDetection {
  return {
    start: span.start,
    end: span.end,
    value: text.slice(span.start, span.end),
    category: 'person_name',
    confidence,
    ruleId: `person_name.${rule}`,
  };
}

/** The word right before `index` (lowercase), e.g. "company" in "Company name:". */
function wordBefore(text: string, index: number): string {
  let end = index;
  while (end > 0 && (text.charAt(end - 1) === ' ' || text.charAt(end - 1) === '\t')) end--;
  let start = end;
  while (start > 0 && end - start < 40 && NAME_CHAR.test(text.charAt(start - 1))) start--;
  return text.slice(start, end).toLowerCase();
}

/** Finds person names next to titles, name labels, greetings and sign-offs. */
export const personNameDetector: Detector = {
  id: 'person_name',
  categories: ['person_name'],
  regexes: [TITLE, NAME_LABEL, GREETING, SIGN_OFF, NAME_WORD, NAME_CHAR, GREETING_END],
  detect(text): RawDetection[] {
    const results: RawDetection[] = [];

    for (const m of matchAll(TITLE, text)) {
      const span = readNameWords(text, m.end, 3);
      if (span) results.push(hit(text, span, 'medium', 'title'));
    }

    for (const m of matchAll(NAME_LABEL, text)) {
      if (NON_PERSON_LABELS.has(wordBefore(text, m.start))) continue;
      const span = readNameWords(text, m.end, 4);
      if (span) results.push(hit(text, span, 'medium', 'label'));
    }

    for (const m of matchAll(GREETING, text)) {
      const span = readNameWords(text, m.end, 3);
      if (!span) continue;
      const first = span.firstWord.toLowerCase();
      if (NOT_NAMES.has(first) || TITLES.has(first)) continue;
      if (!GREETING_END.test(text.slice(span.end, span.end + 10))) continue; // "Hi Sarah and…" → skip
      results.push(hit(text, span, 'low', 'greeting'));
    }

    for (const m of matchAll(SIGN_OFF, text)) {
      const span = readNameWords(text, m.end, 3);
      if (span && !NOT_NAMES.has(span.firstWord.toLowerCase())) {
        results.push(hit(text, span, 'low', 'sign_off'));
      }
    }
    return results;
  },
};
