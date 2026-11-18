/*
  Bank account detector: valid IBANs anywhere (high); account numbers only after a label
  (medium, number only). Invalid IBANs and unlabelled numbers are NOT caught.
*/
import { describe, expect, it } from 'vitest';

import { bankAccountDetector } from '../../src/detectors/bank-account';
import { EXAMPLE_IBANS, policyWith } from '../fixtures/fake-data';

const ctx = { policy: policyWith() };
const found = (text: string) => bankAccountDetector.detect(text, ctx);
const values = (text: string) => found(text).map((d) => d.value);

describe('bank account detector: IBAN', () => {
  it.each(Object.values(EXAMPLE_IBANS))('catches %s with high confidence', (iban) => {
    const [hit] = found(`Pay to ${iban} please`);
    expect(hit).toMatchObject({
      start: 7,
      end: 7 + iban.length,
      value: iban,
      confidence: 'high',
      ruleId: 'bank_account.iban',
    });
  });

  it('trims following capital words that are not part of the IBAN', () => {
    expect(values(`${EXAMPLE_IBANS.uk} THANKS A LOT`)).toEqual([EXAMPLE_IBANS.uk]);
  });

  it('does not include a trailing space or full stop', () => {
    expect(values(`IBAN: ${EXAMPLE_IBANS.germany}.`)).toEqual([EXAMPLE_IBANS.germany]);
  });

  it.each([
    ['GB00 WEST 1234 5698 7654 32', 'wrong check digits'],
    ['GB82WEST12345698765432XYZ', 'glued to more letters (no space to trim at)'],
    ['XX82 WEST 1234 5698 7654 32', 'unknown country'],
    ['AB12 CD', 'too short'],
  ])('does not catch %j (%s)', (text) => {
    expect(values(text)).toEqual([]);
  });
});

describe('bank account detector: labelled account number', () => {
  it.each([
    ['Account number: 0123456789', '0123456789'],
    ['account no. 0123 4567 8901', '0123 4567 8901'],
    ['Acct #12345678', '12345678'],
    ['acct no 1234-5678-90', '1234-5678-90'],
    ['A/C: 00112233445566', '00112233445566'],
    ['a/c no. 12345678', '12345678'],
  ])('catches only the number in %j', (text, number) => {
    const [hit] = found(text);
    expect(hit).toMatchObject({
      value: number,
      confidence: 'medium',
      ruleId: 'bank_account.labelled_number',
    });
    expect(text.slice(hit?.start, hit?.end)).toBe(number);
  });

  it.each([
    ['account 2024 summary', 'no label word'],
    ['my number is 0123456789', 'no account label'],
    ['Account number: 1234567', 'only 7 digits'],
    ['Account number: 123456789012345678901', '21 digits'],
    ['Account number: 1234  5678', 'double space inside'],
    ['account number: TBD', 'no digits'],
  ])('does not catch %j (%s)', (text) => {
    expect(values(text)).toEqual([]);
  });

  it('stays fast on a label followed by 20,000 spaces (no polynomial backtracking)', () => {
    const started = Date.now();
    expect(values(`account number${' '.repeat(20_000)}x`)).toEqual([]);
    expect(values(`acct${' '.repeat(10_000)}#${' '.repeat(10_000)}x`)).toEqual([]);
    expect(Date.now() - started).toBeLessThan(200);
  });
});
