/*
  Token-in-URL detector: inside URLs, catches ONLY the secret parts:
  - the VALUE of query (or #fragment) parameters with secret-sounding names (token, code, sig…);
  - the "user:password" part of URLs like https://user:pass@host.
  The rest of the URL (host, path, other parameters) is useful to the AI and stays. Confidence: high.
*/
import type { Detector, RawDetection } from '../types';
import { matchAll } from '../utils/match';

/*
  A web URL: "http://" or "https://" (any case), then up to 2,048 characters that are not
  whitespace, quotes or angle brackets. Matches can only start at "h", so this is cheap.
*/
const URL_CANDIDATE = /https?:\/\/[^\s"'<>]{1,2048}/dgi;

// Punctuation that ends a sentence rather than the URL: . , ; : ! ? ) ] } at the very end.
const TRAILING_PUNCTUATION = /[!),.:;?\]}]+$/;

/** Parameter names whose values are secrets (compared in lowercase). */
const SECRET_PARAMETERS = new Set([
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'auth',
  'key',
  'api_key',
  'apikey',
  'secret',
  'sig',
  'signature',
  'code',
  'session',
  'sessionid',
  'x-amz-signature',
  'x-amz-credential',
  'x-amz-security-token',
]);

/** Builds a token_url detection for url[from, to), shifted to the URL's place in the text. */
function hit(
  urlStart: number,
  url: string,
  from: number,
  to: number,
  ruleId: string,
): RawDetection {
  return {
    start: urlStart + from,
    end: urlStart + to,
    value: url.slice(from, to),
    category: 'token_url',
    confidence: 'high',
    ruleId,
  };
}

/** Secret parts of one URL (positions relative to the URL). */
function secretsInUrl(url: string, urlStart: number): RawDetection[] {
  const results: RawDetection[] = [];
  const authorityStart = url.indexOf('//') + 2;
  const pathStart = firstIndexOfAny(url, '/?#', authorityStart);

  // "user:password@host" → the "user:password" part.
  const at = url.lastIndexOf('@', pathStart - 1);
  if (at >= authorityStart) {
    const userInfo = url.slice(authorityStart, at);
    if (userInfo.includes(':') && !userInfo.endsWith(':')) {
      results.push(hit(urlStart, url, authorityStart, at, 'token_url.credentials'));
    }
  }

  // Query (?a=1&b=2) and fragment (#access_token=…) parameters.
  for (const separator of ['?', '#']) {
    const sectionStart = url.indexOf(separator, pathStart);
    if (sectionStart === -1) continue;
    const sectionEnd = separator === '?' ? firstIndexOfAny(url, '#', sectionStart) : url.length;
    let pairStart = sectionStart + 1;
    while (pairStart < sectionEnd) {
      const pairEnd = firstIndexOfAny(url, '&;', pairStart, sectionEnd);
      const equals = url.indexOf('=', pairStart);
      if (equals !== -1 && equals < pairEnd && equals + 1 < pairEnd) {
        const name = url.slice(pairStart, equals).toLowerCase();
        if (SECRET_PARAMETERS.has(name)) {
          results.push(hit(urlStart, url, equals + 1, pairEnd, `token_url.${name}`));
        }
      }
      pairStart = pairEnd + 1;
    }
  }
  return results;
}

/** First index (>= from, < limit) of any of the given characters, or `limit` if none. */
function firstIndexOfAny(text: string, chars: string, from: number, limit = text.length): number {
  for (let i = from; i < limit; i++) {
    if (chars.includes(text.charAt(i))) return i;
  }
  return limit;
}

/** Finds secret tokens and credentials inside URLs. */
export const tokenUrlDetector: Detector = {
  id: 'token_url',
  categories: ['token_url'],
  regexes: [URL_CANDIDATE, TRAILING_PUNCTUATION],
  detect(text): RawDetection[] {
    return matchAll(URL_CANDIDATE, text).flatMap((match) =>
      secretsInUrl(match.value.replace(TRAILING_PUNCTUATION, ''), match.start),
    );
  },
};
