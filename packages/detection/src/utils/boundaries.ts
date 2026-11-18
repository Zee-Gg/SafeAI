/*
  "Is this a whole word?" checks that work in every language.
  A word character is any Unicode letter, digit, accent mark or underscore, so Urdu, Arabic,
  Chinese, accented Latin, etc. all count. Used so "ABC Corp" doesn't match inside "ABC Corporation".
*/

// One Unicode letter (\p{L}), digit (\p{N}), accent/vowel mark (\p{M}) or underscore.
const WORD_CHAR = /^[\p{L}\p{N}\p{M}_]$/u;

/** True if the character (one code point) is a letter, digit, accent mark or underscore. */
export function isWordChar(char: string): boolean {
  return WORD_CHAR.test(char);
}

/** The full character just before `index` (handles emoji and other 2-unit characters). */
function charBefore(text: string, index: number): string {
  if (index <= 0) return '';
  const low = text.charCodeAt(index - 1);
  const isLowSurrogate = low >= 0xdc00 && low <= 0xdfff;
  return isLowSurrogate && index >= 2 ? text.slice(index - 2, index) : text.slice(index - 1, index);
}

/** The full character starting at `index` (handles emoji and other 2-unit characters). */
function charAt(text: string, index: number): string {
  const codePoint = text.codePointAt(index);
  return codePoint === undefined ? '' : String.fromCodePoint(codePoint);
}

/** True if text[start, end) is not glued to a word character on either side. */
export function isWholeWordMatch(text: string, start: number, end: number): boolean {
  const before = charBefore(text, start);
  const after = charAt(text, end);
  return !(before && isWordChar(before)) && !(after && isWordChar(after));
}
