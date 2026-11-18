/*
  The shape of a SafeAI policy: what to do with each kind of sensitive data, the company's
  custom terms, which national IDs to look for, and the default phone country.
  DEFAULT_POLICY is the built-in safe policy used when no company policy exists.
*/
import { z } from 'zod';

import { CUSTOM_TERM_CATEGORIES, DETECTOR_CATEGORIES, type DetectorCategory } from './categories';

/** What to do with a detection: replace it, stop the message, show a warning, or ignore it. */
export const RuleActionSchema = z.enum(['redact', 'block', 'warn', 'allow']);
export type RuleAction = z.infer<typeof RuleActionSchema>;

/** Countries whose national ID formats we can detect. */
export const NATIONAL_ID_COUNTRIES = ['PK', 'US', 'UK', 'AE'] as const;
export type NationalIdCountry = (typeof NATIONAL_ID_COUNTRIES)[number];

/** The rule for one category. */
export const RuleSchema = z.strictObject({
  action: RuleActionSchema,
  /** Whether a user may change the action for one message (used from Phase 3). */
  allowUserOverride: z.boolean(),
});
export type Rule = z.infer<typeof RuleSchema>;

/** One company-specific word or phrase, e.g. a client's name. */
export const CustomTermSchema = z.strictObject({
  term: z.string().min(1).max(200),
  category: z.enum(CUSTOM_TERM_CATEGORIES),
  /** true = only match whole words ("ABC Corp" won't match inside "ABC Corporation"). */
  wholeWord: z.boolean(),
});
export type CustomTerm = z.infer<typeof CustomTermSchema>;

// Builds { email: RuleSchema, phone: RuleSchema, … } so EVERY category must have a rule.
const rulesShape = Object.fromEntries(
  DETECTOR_CATEGORIES.map((category) => [category, RuleSchema]),
) as Record<DetectorCategory, typeof RuleSchema>;

/** A full policy. */
export const PolicySchema = z.strictObject({
  /** Bumped whenever the policy changes, so cached data built from it is rebuilt. */
  version: z.number().int().nonnegative(),
  rules: z.strictObject(rulesShape),
  customTerms: z.array(CustomTermSchema),
  nationalIdCountries: z.array(z.enum(NATIONAL_ID_COUNTRIES)),
  /** Two-letter country code used for phone numbers written without +country, e.g. "PK". */
  defaultPhoneCountry: z.string().regex(/^[A-Z]{2}$/), // exactly two capital letters
});
export type Policy = z.infer<typeof PolicySchema>;

/** Builds a rule with user override allowed (all default rules allow it). */
function rule(action: RuleAction): Rule {
  return { action, allowUserOverride: true };
}

/** The built-in safe policy, used when no company policy exists. */
export const DEFAULT_POLICY: Policy = {
  version: 1,
  rules: {
    email: rule('redact'),
    phone: rule('redact'),
    person_name: rule('warn'),
    address: rule('warn'),
    national_id: rule('redact'),
    api_key: rule('redact'),
    password: rule('redact'),
    secret: rule('warn'),
    token_url: rule('redact'),
    credit_card: rule('redact'),
    bank_account: rule('redact'),
    client_name: rule('redact'),
    company_name: rule('redact'),
    project_name: rule('redact'),
    internal_system: rule('redact'),
    custom_term: rule('redact'),
  },
  customTerms: [],
  nationalIdCountries: ['PK', 'US', 'UK', 'AE'],
  defaultPhoneCountry: 'PK',
};
