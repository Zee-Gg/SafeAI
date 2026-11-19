/*
  Password detector: catches ONLY the value after a password label with ":" or "=".
  Normal sentences about passwords, placeholders and code that reads a password are NOT caught.
*/
import { describe, expect, it } from 'vitest';

import { passwordDetector } from '../../src/detectors/password';
import { policyWith } from '../fixtures/fake-data';

const ctx = { policy: policyWith() };
const values = (text: string) => passwordDetector.detect(text, ctx).map((d) => d.value);

describe('password detector', () => {
  it.each([
    ['password: Hunter2!', 'Hunter2!'],
    ['Password = TEST_SECRET_PLACEHOLDER', 'TEST_SECRET_PLACEHOLDER'],
    ['DB_PASSWORD=abc123', 'abc123'],
    ['"password": "fake-pass-for-unit-test"', 'fake-pass-for-unit-test'],
    ["db.passwd='fakeValue9'", 'fakeValue9'],
    ['pwd:fakepw77', 'fakepw77'],
    ['PIN: 4821', '4821'],
    ['passcode = 998877', '998877'],
    ['pass=fakePass1&user=bob', 'fakePass1'],
    ['Server=x;Password=FakeConn9;User=y', 'FakeConn9'],
    ['"password": "with spaces inside"', 'with spaces inside'],
  ])('catches only the value in %j', (text, value) => {
    expect(values(text)).toEqual([value]);
    const [hit] = passwordDetector.detect(text, ctx);
    expect(text.slice(hit?.start, hit?.end)).toBe(value);
    expect(hit).toMatchObject({ category: 'password', confidence: 'high', ruleId: 'password' });
  });

  it.each([
    ['forgot password?', 'question'],
    ['password reset link', 'phrase'],
    ['Enter it in the password field', 'phrase'],
    ['password: true', 'a setting, not a password'],
    ['require_password: false', 'a setting'],
    ['password: ${DB_PASS}', 'placeholder variable'],
    ['password: {{ secret }}', 'template placeholder'],
    ['password: <your password>', 'placeholder in angle brackets'],
    ['password: ********', 'masked'],
    ['password=os.getenv("DB_PASS")', 'code reading a password'],
    ['password: process.env.DB_PASS', 'code reading a password'],
    ['password: ab', 'too short to be meaningful'],
    ['bypass: yes', '"pass" inside another word'],
    ['spin = 1234', '"pin" inside another word'],
    ['passport: AB123', 'different word'],
  ])('does not catch %j (%s)', (text) => {
    expect(values(text)).toEqual([]);
  });

  it('finds several passwords in an .env-style text', () => {
    const env = 'DB_PASSWORD=fakeOne1\nREDIS_PASS=fakeTwo2\nAPI_URL=https://x';
    expect(values(env)).toEqual(['fakeOne1', 'fakeTwo2']);
  });
});
