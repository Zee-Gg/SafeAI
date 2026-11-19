/*
  Token-in-URL detector: catches ONLY secret parameter values and the user:password part.
  Hosts, paths and harmless parameters stay untouched.
*/
import { describe, expect, it } from 'vitest';

import { tokenUrlDetector } from '../../src/detectors/token-url';
import { policyWith } from '../fixtures/fake-data';

const ctx = { policy: policyWith() };
const found = (text: string) => tokenUrlDetector.detect(text, ctx);
const summary = (text: string) => found(text).map((d) => [d.value, d.ruleId]);

describe('token URL detector', () => {
  it('catches only the value of a secret query parameter, with exact positions', () => {
    const text = 'Open https://example.com/cb?code=TEST_CODE_VALUE&state=1 now';
    const [hit] = found(text);
    expect(hit).toMatchObject({
      value: 'TEST_CODE_VALUE',
      category: 'token_url',
      confidence: 'high',
      ruleId: 'token_url.code',
    });
    expect(text.slice(hit?.start, hit?.end)).toBe('TEST_CODE_VALUE');
  });

  it.each([
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
    'X-Amz-Signature',
    'X-Amz-Credential',
    'X-Amz-Security-Token',
  ])('catches the value of "%s"', (name) => {
    const text = `https://example.com/p?a=1&${name}=FAKE_VALUE_${name.length}&b=2`;
    expect(summary(text)).toEqual([
      [`FAKE_VALUE_${name.length}`, `token_url.${name.toLowerCase()}`],
    ]);
  });

  it('catches the user:password part of a URL', () => {
    expect(summary('db at https://admin:FakePass9@db.example.com:5432/app')).toEqual([
      ['admin:FakePass9', 'token_url.credentials'],
    ]);
  });

  it('catches tokens in the #fragment (OAuth implicit flow)', () => {
    expect(summary('https://example.com/cb#access_token=FAKE_FRAG_TOKEN&type=bearer')).toEqual([
      ['FAKE_FRAG_TOKEN', 'token_url.access_token'],
    ]);
  });

  it('catches several secrets in one URL and in several URLs', () => {
    const text =
      'https://s3.example.com/f?X-Amz-Credential=FAKECRED&X-Amz-Signature=FAKESIG and ' +
      'http://example.org/?token=FAKETOKEN';
    expect(found(text).map((d) => d.value)).toEqual(['FAKECRED', 'FAKESIG', 'FAKETOKEN']);
  });

  it('does not include trailing sentence punctuation', () => {
    expect(found('see https://example.com/?token=FAKETOKEN.').map((d) => d.value)).toEqual([
      'FAKETOKEN',
    ]);
  });

  it.each([
    ['https://example.com/?page=2&sort=asc', 'harmless parameters'],
    ['https://example.com/path/token/value', '"token" in the path, not a parameter'],
    ['https://user@example.com/', 'username without password'],
    ['https://example.com/?token=', 'empty value'],
    ['https://example.com/?token', 'parameter without "="'],
    ['https://example.com/@someone?x=1', '"@" in the path, not credentials'],
    ['ftp://user:pass@example.com', 'not an http(s) URL'],
    ['token=FAKETOKEN without a URL', 'no URL at all'],
  ])('does not catch %j (%s)', (text) => {
    expect(found(text)).toEqual([]);
  });
});
