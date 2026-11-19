/*
  API key detector: every provider format in the table is caught; context-only formats need
  their context; PUBLIC keys (Stripe pk_, Supabase sb_publishable_, Twilio AC… SIDs) are NOT
  caught, because they are designed to be shared. All keys are built at runtime (fake-data.ts).
*/
import { describe, expect, it } from 'vitest';

import { apiKeyDetector } from '../../src/detectors/api-key';
import { API_KEY_PATTERNS, isPublicKey } from '../../src/detectors/api-key-patterns';
import { FAKE_KEYS, FAKE_PUBLIC_KEYS, fakeChars, policyWith } from '../fixtures/fake-data';

const ctx = { policy: policyWith() };
const found = (text: string) => apiKeyDetector.detect(text, ctx);
const summary = (text: string) => found(text).map((d) => [d.value, d.ruleId]);

describe('API key patterns table', () => {
  it('every row has a provider, a ruleId, the g+d flags and an https source link', () => {
    for (const row of API_KEY_PATTERNS) {
      expect(row.provider).not.toBe('');
      expect(row.ruleId).toMatch(/^api_key\.[a-z_]+$/);
      expect(row.regex.flags).toContain('g');
      expect(row.regex.flags).toContain('d');
      expect(row.sourceUrl).toMatch(/^https:\/\//);
    }
  });
});

describe('API key detector', () => {
  it.each([
    [FAKE_KEYS.openaiProject, 'api_key.openai'],
    [FAKE_KEYS.openaiServiceAccount, 'api_key.openai'],
    [FAKE_KEYS.openaiAdmin, 'api_key.openai'],
    [FAKE_KEYS.openaiLegacy, 'api_key.openai_legacy'],
    [FAKE_KEYS.anthropic, 'api_key.anthropic'],
    [FAKE_KEYS.stripeSecretLive, 'api_key.stripe'],
    [FAKE_KEYS.stripeSecretTest, 'api_key.stripe'],
    [FAKE_KEYS.stripeRestricted, 'api_key.stripe'],
    [FAKE_KEYS.stripeOrg, 'api_key.stripe'],
    [FAKE_KEYS.githubClassic, 'api_key.github'],
    [FAKE_KEYS.githubOauth, 'api_key.github'],
    [FAKE_KEYS.githubFineGrained, 'api_key.github_pat'],
    [FAKE_KEYS.awsAccessKeyId, 'api_key.aws_access_key_id'],
    [FAKE_KEYS.awsTemporaryKeyId, 'api_key.aws_access_key_id'],
    [FAKE_KEYS.google, 'api_key.google'],
    [FAKE_KEYS.slackBot, 'api_key.slack'],
    [FAKE_KEYS.slackApp, 'api_key.slack'],
    [FAKE_KEYS.sendgrid, 'api_key.sendgrid'],
    [FAKE_KEYS.twilioApiKeySid, 'api_key.twilio_api_key'],
    [FAKE_KEYS.huggingface, 'api_key.huggingface'],
    [FAKE_KEYS.supabaseSecret, 'api_key.supabase_secret'],
  ])('catches a %s-format key as %s, with exact positions', (key, ruleId) => {
    const text = `config: ${key} end`;
    expect(found(text)).toEqual([
      {
        start: 8,
        end: 8 + key.length,
        value: key,
        category: 'api_key',
        confidence: 'high',
        ruleId,
      },
    ]);
  });

  it('AWS secret access key: caught only next to AWS secret context', () => {
    expect(summary(`aws_secret_access_key = ${FAKE_KEYS.awsSecretAccessKey}`)).toEqual([
      [FAKE_KEYS.awsSecretAccessKey, 'api_key.aws_secret_access_key'],
    ]);
    expect(summary(`AWS_SECRET_ACCESS_KEY=${FAKE_KEYS.awsSecretAccessKey}`)).toHaveLength(1);
    expect(summary(`The secret access key is ${FAKE_KEYS.awsSecretAccessKey}`)).toHaveLength(1);
    expect(found(`random value ${FAKE_KEYS.awsSecretAccessKey}`)).toEqual([]);
  });

  it('Twilio auth token: caught only next to "twilio" or "auth token" context', () => {
    expect(summary(`TWILIO_AUTH_TOKEN=${FAKE_KEYS.twilioAuthToken}`)).toEqual([
      [FAKE_KEYS.twilioAuthToken, 'api_key.twilio_auth_token'],
    ]);
    expect(summary(`auth token: ${FAKE_KEYS.twilioAuthToken}`)).toHaveLength(1);
    expect(found(`md5 ${FAKE_KEYS.twilioAuthToken}`)).toEqual([]);
  });

  it('context further than 60 characters away does not count', () => {
    const far = `aws_secret_access_key ${'.'.repeat(70)} ${FAKE_KEYS.awsSecretAccessKey}`;
    expect(found(far)).toEqual([]);
  });

  describe('public keys are NOT detected (they are designed to be shared)', () => {
    // Stripe publishable keys (pk_) go into web pages by design ("safe to expose", Stripe docs);
    // Supabase publishable keys are "safe to expose online"; Twilio Account SIDs are identifiers.
    it.each(Object.entries(FAKE_PUBLIC_KEYS))('%s is not detected', (_name, key) => {
      expect(found(`public: ${key}`)).toEqual([]);
      expect(isPublicKey(key)).toBe(true);
    });

    it('an Account SID is not mistaken for a context auth token', () => {
      expect(found(`twilio sid ${FAKE_PUBLIC_KEYS.twilioAccountSid}`)).toEqual([]);
    });
  });

  it.each([
    ['sk-' + 'something-not-a-key', 'sk- word without a known prefix or marker'],
    ['sk-' + fakeChars(48), 'old-style sk- without the T3BlbkFJ marker'],
    ['xox' + 'a-' + fakeChars(20), 'xoxa- is not in Slack docs'],
    ['ght_' + fakeChars(36), 'not a GitHub prefix (t)'],
    ['gh' + 'p_' + fakeChars(35), 'GitHub token one character short'],
    ['AKIA' + fakeChars(15, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'), 'AWS key ID too short'],
    ['my' + 'AKIA' + 'IOSFODNN7' + 'EXAMPLE', 'AWS key ID glued to other capitals'],
    ['AIza' + fakeChars(20), 'Google key too short'],
    ['SG' + '.short.key', 'SendGrid-like but wrong lengths'],
    ['SK' + fakeChars(31, '0123456789abcdef'), 'Twilio SID too short'],
    ['hf' + '_short', 'Hugging Face-like but too short'],
  ])('does not catch %j (%s)', (text) => {
    expect(found(text)).toEqual([]);
  });

  it('stays fast on 20,000 characters of key-like text with no key (no backtracking)', () => {
    const inputs = ['a'.repeat(20_000), 'sk-' + 'ant-' + 'b'.repeat(20_000), fakeChars(20_000)];
    const started = Date.now();
    for (const input of inputs) found(input);
    // Generous on purpose: catches runaway slowness (seconds), not milliseconds; see M6 bench.
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
