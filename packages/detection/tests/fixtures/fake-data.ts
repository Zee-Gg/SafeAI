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

/* ---------- Secrets: EVERY value below is assembled at runtime from pieces ---------- */

const ALNUM = 'aZ3kQ9mW2xR7tY4pL8vB5nC6hJ1dF0gSeUiOoAbcDEfGHIjKlMNPqrsTuVwXyz';
const HEX_LOWER = '0123456789abcdef';
const UPPER_DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Deterministic made-up characters: picks alphabet[(i * step + 3) % length] for i = 0, 1, 2…
 * Always the same output, obviously not a real key, and spread out enough to look "random".
 */
export function fakeChars(length: number, alphabet = ALNUM, step = 7): string {
  return Array.from({ length }, (_, i) => alphabet.charAt((i * step + 3) % alphabet.length)).join(
    '',
  );
}

/** base64url text, as used in JWTs. */
const base64url = (text: string) => Buffer.from(text).toString('base64url');

/** Made-up API keys in each provider's format, built at runtime so no full key is in the source. */
export const FAKE_KEYS = {
  openaiProject: 'sk-' + 'proj-' + fakeChars(48),
  openaiServiceAccount: 'sk-' + 'svcacct-' + fakeChars(48),
  openaiAdmin: 'sk-' + 'admin-' + fakeChars(48),
  openaiLegacy: 'sk-' + fakeChars(20) + 'T3Blbk' + 'FJ' + fakeChars(20, ALNUM, 11),
  anthropic: 'sk-' + 'ant-' + 'api03-' + fakeChars(80),
  stripeSecretLive: 'sk_' + 'live_' + fakeChars(24),
  stripeSecretTest: 'sk_' + 'test_' + fakeChars(24),
  stripeRestricted: 'rk_' + 'live_' + fakeChars(24),
  stripeOrg: 'sk_' + 'org_' + fakeChars(24),
  githubClassic: 'gh' + 'p_' + fakeChars(36),
  githubOauth: 'gh' + 'o_' + fakeChars(36),
  githubFineGrained: 'github' + '_pat_' + fakeChars(22) + '_' + fakeChars(59, ALNUM, 5),
  // AWS's own documentation example values, split into pieces.
  awsAccessKeyId: 'AKIA' + 'IOSFODNN7' + 'EXAMPLE',
  awsTemporaryKeyId: 'ASIA' + fakeChars(16, UPPER_DIGITS),
  awsSecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/' + 'bPxRfiCY' + 'EXAMPLEKEY',
  google: 'AIza' + fakeChars(35),
  slackBot: 'xox' + 'b-' + fakeChars(12, HEX_LOWER) + '-' + fakeChars(24),
  slackApp: 'xa' + 'pp-1-' + fakeChars(30),
  sendgrid: 'SG' + '.' + fakeChars(22) + '.' + fakeChars(43, ALNUM, 5),
  twilioApiKeySid: 'SK' + fakeChars(32, HEX_LOWER),
  twilioAuthToken: fakeChars(32, HEX_LOWER, 5),
  huggingface: 'hf' + '_' + fakeChars(34),
  supabaseSecret: 'sb_' + 'secret_' + fakeChars(32),
  jwt:
    base64url('{"alg":"HS256","typ":"JWT"}') +
    '.' +
    base64url('{"sub":"fake-user-for-unit-test","iat":0}') +
    '.' +
    'FAKE_SIGNATURE_FOR_UNIT_TEST',
} as const;

/**
 * PUBLIC-by-design keys (must NOT be detected): Stripe publishable keys, Supabase publishable
 * keys and Twilio Account SIDs are meant to be shared, so redacting them would only be noise.
 */
export const FAKE_PUBLIC_KEYS = {
  stripePublishableLive: 'pk_' + 'live_' + fakeChars(24),
  stripePublishableTest: 'pk_' + 'test_' + fakeChars(24),
  supabasePublishable: 'sb_' + 'publishable_' + fakeChars(32),
  twilioAccountSid: 'AC' + fakeChars(32, HEX_LOWER),
} as const;

/** A fake PEM private key block (body lines are obviously fake). */
export function fakePrivateKey(label = 'PRIVATE KEY', bodyLines = 25): string {
  const body = Array.from({ length: bodyLines }, (_, i) =>
    `FAKE${String(i).padStart(2, '0')}`.padEnd(64, 'X'),
  ).join('\n');
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`;
}

/** A "random-looking" fake secret (high entropy), e.g. for SECRET_KEY=… tests. */
export const FAKE_HIGH_ENTROPY = fakeChars(40, ALNUM, 13);

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
