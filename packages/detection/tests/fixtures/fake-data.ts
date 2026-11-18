/*
  ALL fake test values live here.
  GitHub push-protection rules: never commit real, real-looking or revoked credentials.
  - Default: obvious placeholders (e.g. "TEST_SECRET_PLACEHOLDER").
  - When a test needs a format-valid value: official documented examples (Stripe test cards,
    the IBAN registry example, example.com emails) or values BUILT AT RUNTIME from pieces,
    so no complete token ever appears in the source code.
*/
import {
  DEFAULT_POLICY,
  type DetectorCategory,
  type Policy,
  type RuleAction,
} from '@safeai/shared';

/** Email addresses on reserved example domains (RFC 2606): they can never belong to anyone. */
export const FAKE_EMAILS = {
  simple: 'ali@example.com',
  dotted: 'first.last+tag@sub.example.co.uk',
  upper: 'Sara.Khan@Example.ORG',
} as const;

/** A deep copy of DEFAULT_POLICY with some rule actions (and optionally other fields) changed. */
export function policyWith(
  actions: Partial<Record<DetectorCategory, RuleAction>> = {},
  extra: Partial<Omit<Policy, 'rules'>> = {},
): Policy {
  const copy = JSON.parse(JSON.stringify(DEFAULT_POLICY)) as Policy;
  for (const [category, action] of Object.entries(actions) as [DetectorCategory, RuleAction][]) {
    copy.rules[category] = { action, allowUserOverride: true };
  }
  return { ...copy, ...extra };
}
