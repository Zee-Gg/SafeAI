/*
  API key detector: runs every row of the API_KEY_PATTERNS table. Confidence: high.
  Rows with `context` (AWS secret key, Twilio auth token) only count when their context words
  appear in the 60 characters before the value, because the value alone is too generic.
*/
import type { Detector, RawDetection } from '../types';
import { matchAll } from '../utils/match';
import { API_KEY_PATTERNS, TWILIO_ACCOUNT_SID } from './api-key-patterns';

/** How far back (characters) we look for a pattern's required context words. */
const CONTEXT_WINDOW = 60;

/** Finds known API key formats. */
export const apiKeyDetector: Detector = {
  id: 'api_key',
  categories: ['api_key'],
  regexes: [
    ...API_KEY_PATTERNS.flatMap((p) => (p.context ? [p.regex, p.context] : [p.regex])),
    TWILIO_ACCOUNT_SID,
  ],
  detect(text): RawDetection[] {
    const results: RawDetection[] = [];
    for (const pattern of API_KEY_PATTERNS) {
      for (const match of matchAll(pattern.regex, text)) {
        if (pattern.context) {
          const before = text.slice(Math.max(0, match.start - CONTEXT_WINDOW), match.start);
          if (!pattern.context.test(before)) continue;
        }
        results.push({ ...match, category: 'api_key', confidence: 'high', ruleId: pattern.ruleId });
      }
    }
    return results;
  },
};
