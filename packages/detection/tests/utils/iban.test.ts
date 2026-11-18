/*
  Tests for IBAN validation. Valid values are the official examples from the SWIFT IBAN
  registry and bank documentation (they don't belong to real customers).
*/
import { describe, expect, it } from 'vitest';

import { compactIban, isValidIban } from '../../src/utils/iban';

describe('isValidIban', () => {
  it.each([
    ['GB82 WEST 1234 5698 7654 32', 'UK example, with spaces'],
    ['GB82WEST12345698765432', 'UK example, compact'],
    ['gb82 west 1234 5698 7654 32', 'lowercase'],
    ['DE89 3704 0044 0532 0130 00', 'Germany example'],
    ['PK36SCBL0000001123456702', 'Pakistan registry example'],
    ['NO9386011117947', 'Norway: shortest IBAN (15)'],
  ])('accepts %s (%s)', (iban) => {
    expect(isValidIban(iban)).toBe(true);
  });

  it.each([
    ['GB00 WEST 1234 5698 7654 32', 'wrong check digits'],
    ['GB82 WEST 1234 5698 7654 33', 'one digit changed'],
    ['GB82 WEST 1234 5698 7654', 'too short for GB'],
    ['ZZ82 WEST 1234 5698 7654 32', 'unknown country'],
    ['GB8X WEST 1234 5698 7654 32', 'check digits not numeric'],
    ['', 'empty'],
    ['hello world', 'plain text'],
  ])('rejects %j (%s)', (iban) => {
    expect(isValidIban(iban)).toBe(false);
  });

  it('compactIban removes whitespace and uppercases', () => {
    expect(compactIban(' gb82 west\t1234\n5698 ')).toBe('GB82WEST12345698');
  });
});
