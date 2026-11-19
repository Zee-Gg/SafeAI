/*
  Random-looking secret detector: finds long tokens that look generated (high "entropy") which no
  known pattern caught, e.g. a custom SECRET_KEY=… in a pasted .env file.
  - entropy ≥ 3.5 bits/char → medium; ≥ 4.0 AND a key/secret/token/auth word nearby → high
  - hex-only strings of 32, 40 or 64 characters → low (could be a hash or a secret)
  - skips UUIDs, file paths, URLs, letter-only words, big base64 images and public keys
*/
import type { Confidence, Detector, RawDetection } from '../types';
import { shannonEntropy } from '../utils/entropy';
import { matchAll } from '../utils/match';
import { isPublicKey } from './api-key-patterns';

/*
  A candidate token: 20+ letters, digits, "+", "_" or "-", then up to two "=" (base64 padding,
  which only ever comes at the END). It starts where such a run starts, so a long run is
  examined once, not once per character. Because "=" can't appear in the middle, a line like
  SECRET_KEY=abc… splits into the name and the value, and only the value is a candidate.
*/
const CANDIDATE = /(?<![\w+-])[\w+-]{20,}={0,2}(?![\w+=-])/dg;

// At least one letter.
const HAS_LETTER = /[a-z]/i;
// At least one digit.
const HAS_DIGIT = /\d/;
// A UUID: 8-4-4-4-12 hex digits.
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
// Only hex digits (0–9, a–f).
const HEX_ONLY = /^[\da-f]+$/i;
// Secret-sounding words just before the token: key, secret, token, auth, credential(s).
const SECRET_CONTEXT = /key|secret|token|auth|credential/i;
// Hash-sounding words just before a hex string: commit, sha, hash, md5, checksum, digest.
const HASH_CONTEXT = /commit|sha\d*|hash|md5|checksum|digest/i;
// A word that is a file path: starts with / ./ ../ ~/ or a drive letter (C:\), contains a
// backslash, or contains a "/" and ends with a file extension (src/components/Button.tsx).
const FILE_PATH = /^(?:\.{0,2}\/|~\/|[a-z]:\\)|\\|\/[^/]*\.[\da-z]{1,6}$/i;
/** How far (characters) we walk each way to find the surrounding word. */
const WORD_WINDOW = 300;

const MEDIUM_ENTROPY = 3.5;
const HIGH_ENTROPY = 4.0;
const HEX_SECRET_LENGTHS = new Set([32, 40, 64]);
const BIG_BASE64 = 500;
/** How far back we look for context words. */
const CONTEXT_WINDOW = 40;

/** True for space, tab, line breaks and the common Unicode spaces (a fast, regex-free check). */
function isWhitespace(code: number): boolean {
  return (
    code === 32 ||
    (code >= 9 && code <= 13) ||
    code === 0xa0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000 ||
    code === 0xfeff
  );
}

/** A whitespace-separated word: where it starts/ends in the text, and its text. */
interface Word {
  from: number;
  to: number;
  text: string;
}

/**
 * The whitespace-separated "word" around [start, end), used to spot URLs and file paths.
 * Walks at most 300 characters each way, so a giant space-free text can't make this slow.
 */
function surroundingWord(text: string, start: number, end: number): Word {
  const minFrom = Math.max(0, start - WORD_WINDOW);
  const maxTo = Math.min(text.length, end + WORD_WINDOW);
  let from = start;
  while (from > minFrom && !isWhitespace(text.charCodeAt(from - 1))) from--;
  let to = end;
  while (to < maxTo && !isWhitespace(text.charCodeAt(to))) to++;
  return { from, to, text: text.slice(from, to) };
}

/**
 * Decides the confidence for one candidate, or null to skip it. Cheap checks run first; the
 * surrounding word (URL / file path check) is only looked up for candidates we'd report.
 */
function classify(
  text: string,
  start: number,
  token: string,
  wordAround: () => string,
): Confidence | null {
  if (!HAS_LETTER.test(token) || !HAS_DIGIT.test(token)) return null;
  if (UUID.test(token) || isPublicKey(token)) return null;

  const before = text.slice(Math.max(0, start - CONTEXT_WINDOW), start);
  if (token.length > BIG_BASE64 && before.includes('base64,')) return null; // inline image data

  let confidence: Confidence | null;
  if (HEX_ONLY.test(token)) {
    const isSecretLength = HEX_SECRET_LENGTHS.has(token.length);
    confidence = isSecretLength && !HASH_CONTEXT.test(before) ? 'low' : null;
  } else {
    const entropy = shannonEntropy(token);
    if (entropy >= HIGH_ENTROPY && SECRET_CONTEXT.test(before)) confidence = 'high';
    else confidence = entropy >= MEDIUM_ENTROPY ? 'medium' : null;
  }
  if (!confidence) return null;

  const word = wordAround();
  return word.includes('://') || FILE_PATH.test(word) ? null : confidence;
}

/** Finds random-looking secrets that no known pattern caught. */
export const secretEntropyDetector: Detector = {
  id: 'secret_entropy',
  categories: ['secret'],
  regexes: [
    CANDIDATE,
    HAS_LETTER,
    HAS_DIGIT,
    UUID,
    HEX_ONLY,
    SECRET_CONTEXT,
    HASH_CONTEXT,
    FILE_PATH,
  ],
  detect(text): RawDetection[] {
    const results: RawDetection[] = [];
    // Many candidates often sit in the same long word (e.g. "a.b.c…"), so we remember the last
    // word we looked up and reuse it while the next candidate is still inside it.
    let lastWord: Word = { from: -1, to: -1, text: '' };
    for (const match of matchAll(CANDIDATE, text)) {
      const wordAround = () => {
        if (match.start < lastWord.from || match.end > lastWord.to) {
          lastWord = surroundingWord(text, match.start, match.end);
        }
        return lastWord.text;
      };
      const confidence = classify(text, match.start, match.value, wordAround);
      if (!confidence) continue;
      results.push({
        ...match,
        category: 'secret',
        confidence,
        ruleId: confidence === 'low' ? 'secret.hex' : 'secret.entropy',
      });
    }
    return results;
  },
};
