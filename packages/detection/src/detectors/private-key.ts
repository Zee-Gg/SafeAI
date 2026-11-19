/*
  Private key detector (PEM blocks such as "-----BEGIN RSA PRIVATE KEY-----").
  RUNS ON THE WHOLE TEXT (scope "fullText"): PEM blocks are usually 1,500–3,500 characters, far
  longer than the 500-character chunk overlap. Uses NO REGEX at all — only forward string
  searches (indexOf), and every search position only ever moves forward, so it is guaranteed
  linear and can never hang. A BEGIN line with no END is still caught: from BEGIN to the end of
  its "line block" (the first empty line, the next BEGIN, or the end of the text).
  Format: RFC 7468 (https://datatracker.ietf.org/doc/html/rfc7468), labels "… PRIVATE KEY" and
  PGP's "PGP PRIVATE KEY BLOCK".
*/
import type { Detector, RawDetection } from '../types';

const BEGIN = '-----BEGIN ';
const END = '-----END ';
const DASHES = '-----';
/** Labels are short ("ENCRYPTED PRIVATE KEY" is the longest common one). */
const MAX_LABEL_LENGTH = 40;

/** True if a PEM label names a private key (e.g. "RSA PRIVATE KEY", "PGP PRIVATE KEY BLOCK"). */
export function isPrivateKeyLabel(label: string): boolean {
  return label.endsWith('PRIVATE KEY') || label.endsWith('PRIVATE KEY BLOCK');
}

/**
 * End of the "line block" that starts at `from`: just before the first empty line, or the end
 * of the text. Walks forward line by line (linear).
 */
function endOfLineBlock(text: string, from: number, limit: number): number {
  let lineStart = from;
  for (;;) {
    const newline = text.indexOf('\n', lineStart);
    if (newline === -1 || newline >= limit) return limit;
    const nextLineEnd = text.indexOf('\n', newline + 1);
    const nextLine = text.slice(
      newline + 1,
      nextLineEnd === -1 ? limit : Math.min(nextLineEnd, limit),
    );
    if (nextLine.trim() === '') return text.charAt(newline - 1) === '\r' ? newline - 1 : newline;
    lineStart = newline + 1;
  }
}

/** Finds PEM private key blocks. */
export const privateKeyDetector: Detector = {
  id: 'private_key',
  categories: ['api_key'],
  regexes: [],
  scope: 'fullText',
  detect(text): RawDetection[] {
    const results: RawDetection[] = [];
    let searchFrom = 0;

    for (;;) {
      const begin = text.indexOf(BEGIN, searchFrom);
      if (begin === -1) return results;

      // Read the label: everything between "-----BEGIN " and the next "-----".
      const labelStart = begin + BEGIN.length;
      const labelEnd = text.indexOf(DASHES, labelStart);
      const label = labelEnd === -1 ? '' : text.slice(labelStart, labelEnd);
      if (labelEnd === -1 || label.length > MAX_LABEL_LENGTH || !isPrivateKeyLabel(label)) {
        searchFrom = labelStart; // not a private key header: keep looking further on
        continue;
      }
      const headerEnd = labelEnd + DASHES.length;

      // The block may not run into the next BEGIN (that would merge two keys).
      const nextBegin = text.indexOf(BEGIN, headerEnd);
      const limit = nextBegin === -1 ? text.length : nextBegin;

      // Look for the matching END only up to the next BEGIN. These stretches never overlap
      // from one key to the next, so the whole scan stays linear even with many BEGINs.
      const endMarker = `${END}${label}${DASHES}`;
      const endInBlock = text.slice(headerEnd, limit).indexOf(endMarker);
      const end =
        endInBlock !== -1
          ? headerEnd + endInBlock + endMarker.length
          : endOfLineBlock(text, headerEnd, limit); // BEGIN without END: still caught

      results.push({
        start: begin,
        end,
        value: text.slice(begin, end),
        category: 'api_key',
        confidence: 'high',
        ruleId: 'api_key.private_key',
      });
      searchFrom = Math.max(end, headerEnd);
    }
  },
};
