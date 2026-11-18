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

/**
 * Official TEST card numbers published by Stripe (https://docs.stripe.com/testing).
 * They pass the Luhn checksum but can never be charged.
 */
export const TEST_CARDS = {
  visa: '4242424242424242',
  visaSpaced: '4242 4242 4242 4242',
  mastercard: '5555555555554444',
  mastercardDashed: '5555-5555-5555-4444',
  mastercard2Series: '2223003122003222',
  amex: '378282246310005',
  amexSpaced: '3782 822463 10005',
  discover: '6011111111111117',
  diners: '3056930009020004',
  dinersShort: '36227206271667',
  jcb: '3566002020360505',
  unionpay: '6200000000000005',
} as const;

/** Official example IBANs (SWIFT IBAN registry / bank documentation). */
export const EXAMPLE_IBANS = {
  uk: 'GB82 WEST 1234 5698 7654 32',
  ukCompact: 'GB82WEST12345698765432',
  germany: 'DE89 3704 0044 0532 0130 00',
  pakistan: 'PK36SCBL0000001123456702',
} as const;

/**
 * Phone numbers in fictional / sample ranges: US 555-01xx is reserved for fiction;
 * the PK number is the common "0300-1234567" sample pattern.
 */
export const FAKE_PHONES = {
  pkMobile: '0300-1234567',
  pkInternational: '+92 300 1234567',
  pkLandline: '042 35761234',
  usInternational: '+1 (415) 555-0132',
} as const;

/** Joins pieces at runtime, so no complete ID-shaped value is written in the source. */
const join = (separator: string, ...parts: string[]) => parts.join(separator);

/** Made-up national ID numbers, built at runtime. They pass format checks but belong to no one. */
export const FAKE_IDS = {
  pkCnicDashed: join('-', '35202', '1234567', '1'),
  pkCnicPlain: join('', '35202', '1234567', '1'),
  pkCnicPlainStartingWith1: join('', '17301', '1234567', '1'),
  usSsn: join('-', '123', '45', '6789'),
  ukNinoSpaced: join(' ', 'AB', '12', '34', '56', 'C'),
  ukNinoCompact: join('', 'AB', '123456', 'C'),
  aeDashed: join('-', '784', '1990', '1234567', '1'),
  aeCompact: join('', '784', '1990', '1234567', '1'),
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
