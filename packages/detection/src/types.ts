/*
  The shared shapes of the detection engine: what a detection looks like, what a detector must
  provide, and what detect() returns. Positions are always UTF-16 indexes with an EXCLUSIVE end,
  like String.prototype.slice(start, end).
*/
import type { CustomTermCategory, DetectorCategory, Policy, RuleAction } from '@safeai/shared';

import type { Automaton } from './utils/aho-corasick';

/** How sure we are: high = almost certainly sensitive, medium = probably, low = maybe. */
export type Confidence = 'high' | 'medium' | 'low';

/** One sensitive item found in the text. */
export interface Detection {
  /** `${category}:${start}:${end}`, unique within one result. */
  id: string;
  /** Start position in the ORIGINAL text. */
  start: number;
  /** End position (exclusive) in the ORIGINAL text. */
  end: number;
  /** The matched text. Never logged, stored or sent. */
  value: string;
  category: DetectorCategory;
  confidence: Confidence;
  /** Which rule found it, e.g. "email" or "api_key.github_pat". */
  ruleId: string;
  /** What the policy says to do with it. */
  action: RuleAction;
}

/**
 * What a detector returns: a detection WITHOUT `id` and `action`. Positions are relative to
 * the text the detector was given (a chunk); the engine shifts them, then adds id and action.
 */
export type RawDetection = Omit<Detection, 'id' | 'action'>;

/** "chunk" = runs on each 20,000-character piece; "fullText" = runs once on the whole text. */
export type DetectorScope = 'chunk' | 'fullText';

/** One custom term after normalization (lowercase, NFKC, single spaces). */
export interface PreparedTerm {
  normalized: string;
  category: CustomTermCategory;
  wholeWord: boolean;
}

/** The custom terms of a policy, ready to search (built once per policy, then cached). */
export interface CustomTermMatcher {
  automaton: Automaton;
  /** terms[i] belongs to pattern number i in the automaton. */
  terms: readonly PreparedTerm[];
}

/** Everything a detector may need besides the text, prepared once per policy. */
export interface DetectorContext {
  policy: Policy;
  /** The policy's custom terms, ready to search (null/missing when there are none). */
  customTerms?: CustomTermMatcher | null;
}

/** One kind of detector, e.g. "email". */
export interface Detector {
  id: string;
  /** Every category this detector can report. */
  categories: readonly DetectorCategory[];
  /** Every regex it uses (checked by the regex-safety test). */
  regexes: readonly RegExp[];
  /** Defaults to "chunk". Only linear, non-regex or flat-regex detectors may use "fullText". */
  scope?: DetectorScope;
  /** Finds items in `text`. May throw; the engine catches it. */
  detect(text: string, ctx: DetectorContext): RawDetection[];
}

/** Options for detect(). */
export interface DetectOptions {
  /** Stop and report complete: false after this many milliseconds. Default 500. */
  timeBudgetMs?: number;
}

/** What detect() returns. */
export interface DetectResult {
  /** Final detections, sorted by start position, with no overlaps. */
  detections: Detection[];
  /** How many detections per category (only categories that were found). */
  countsByCategory: Partial<Record<DetectorCategory, number>>;
  /** How long detection took, in milliseconds. */
  durationMs: number;
  /** false = the time budget ran out or a detector failed. The extension must NOT send then. */
  complete: boolean;
  /** Ids of detectors that threw (never any text). Empty when everything worked. */
  failedDetectors: string[];
  /** Milliseconds spent in each detector, by detector id (to find slow ones). Numbers only. */
  timingsMs: Record<string, number>;
}
