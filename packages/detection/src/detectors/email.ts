/*
  Email detector: finds addresses like ali@example.com. Confidence: high.
  Skips things that only look similar: "@username" handles, "user@localhost" (no dot domain)
  and retina image names like "logo@2x.png".
*/
import { matchAll } from '../utils/match';
import type { Detector, RawDetection } from '../types';

/*
  An email address:
  - (?<![\w.%+-])  the match may only START where the name part starts (not in the middle of a
                   long word), which keeps the regex fast on long runs of letters;
  - [\w.%+-]{1,64} the name: letters, digits, _ . % + - (max 64, the official limit);
  - @              the at sign;
  - [a-z\d.-]{1,253} the domain: letters, digits, dots, hyphens (max 253);
  - \.[a-z]{2,24}  a dot and the ending, 2–24 letters (com, co, museum…);
  - (?![\w-])      the ending must not continue into more letters/digits/hyphens.
  Trailing punctuation ("ali@test.com.") is never included because the ending is letters only.
*/
const EMAIL = /(?<![\w%+.-])[\w%+.-]{1,64}@[\d.a-z-]{1,253}\.[a-z]{2,24}(?![\w-])/dgi;

/** File extensions that can look like an email ending (logo@2x.png). None are real domains. */
const FILE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'svg',
  'webp',
  'avif',
  'ico',
  'bmp',
  'tiff',
]);

/** True if the address is well formed (no empty name/domain parts, no edge dots or hyphens). */
function isPlausibleEmail(email: string): boolean {
  const at = email.lastIndexOf('@');
  const name = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();
  if (name.startsWith('.') || name.endsWith('.') || name.includes('..')) return false;
  const labels = domain.split('.');
  if (labels.some((label) => label === '' || label.startsWith('-') || label.endsWith('-'))) {
    return false;
  }
  return !FILE_EXTENSIONS.has(labels[labels.length - 1] ?? '');
}

/** Finds email addresses. */
export const emailDetector: Detector = {
  id: 'email',
  categories: ['email'],
  regexes: [EMAIL],
  detect(text): RawDetection[] {
    return matchAll(EMAIL, text)
      .filter((match) => isPlausibleEmail(match.value))
      .map((match) => ({
        start: match.start,
        end: match.end,
        value: match.value,
        category: 'email',
        confidence: 'high',
        ruleId: 'email',
      }));
  },
};
