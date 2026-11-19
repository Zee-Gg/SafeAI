/*
  Custom terms detector: the company's own words (client names, project names, internal systems…).
  RUNS ON THE WHOLE TEXT (scope "fullText"): Aho-Corasick is one linear pass and isn't a regex,
  so chunks would only add duplicates. Matching happens on normalized text (lowercase, NFKC, one
  space per whitespace run), so "ABC Corp" also matches "abc corp" and "ABC⏎Corp"; positions are
  mapped back to the ORIGINAL text with the index map. Confidence: high; category from the term.
*/
import type { CustomTerm } from '@safeai/shared';

import type { CustomTermMatcher, Detector, PreparedTerm, RawDetection } from '../types';
import { buildAutomaton, searchAll } from '../utils/aho-corasick';
import { isWholeWordMatch } from '../utils/boundaries';
import { normalizeForMatching, normalizeTerm, toOriginalRange } from '../utils/normalize';

/**
 * Normalizes the policy's terms and builds the search machine (done once per policy and cached).
 * Empty terms are dropped; if the same term appears twice, the first one's settings win.
 * Returns null when there is nothing to search for.
 */
export function prepareCustomTerms(terms: readonly CustomTerm[]): CustomTermMatcher | null {
  const prepared: PreparedTerm[] = [];
  const seen = new Set<string>();
  for (const term of terms) {
    const normalized = normalizeTerm(term.term);
    if (normalized === '' || seen.has(normalized)) continue;
    seen.add(normalized);
    prepared.push({ normalized, category: term.category, wholeWord: term.wholeWord });
  }
  if (prepared.length === 0) return null;
  return { automaton: buildAutomaton(prepared.map((t) => t.normalized)), terms: prepared };
}

/** Finds the policy's custom terms anywhere in the whole text. */
export const customTermsDetector: Detector = {
  id: 'custom_terms',
  categories: ['client_name', 'company_name', 'project_name', 'internal_system', 'custom_term'],
  regexes: [],
  scope: 'fullText',
  detect(text, ctx): RawDetection[] {
    const matcher = ctx.customTerms;
    if (!matcher) return [];

    const map = normalizeForMatching(text);
    // Longest term wins at the same start position ("ABC Corp Holdings" beats "ABC Corp").
    const longestAtStart = new Map<number, RawDetection>();

    for (const match of searchAll(matcher.automaton, map.normalized)) {
      const term = matcher.terms[match.pattern];
      if (!term) continue;
      const { start, end } = toOriginalRange(map, match.start, match.end);
      if (term.wholeWord && !isWholeWordMatch(text, start, end)) continue;

      const existing = longestAtStart.get(start);
      if (existing && existing.end >= end) continue;
      longestAtStart.set(start, {
        start,
        end,
        value: text.slice(start, end),
        category: term.category,
        confidence: 'high',
        ruleId: `custom_term.${term.category}`,
      });
    }
    return [...longestAtStart.values()];
  },
};
