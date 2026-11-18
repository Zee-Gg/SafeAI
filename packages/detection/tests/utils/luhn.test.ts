/*
  Tests for the Luhn checksum. Card numbers are official test numbers from Stripe's docs
  (https://docs.stripe.com/testing), never real cards.
*/
import { describe, expect, it } from 'vitest';

import { passesLuhn } from '../../src/utils/luhn';

describe('passesLuhn', () => {
  it.each([
    ['4242424242424242', 'Visa test card'],
    ['5555555555554444', 'Mastercard test card'],
    ['378282246310005', 'Amex test card'],
    ['6011111111111117', 'Discover test card'],
    ['0', 'single zero'],
  ])('accepts %s (%s)', (digits) => {
    expect(passesLuhn(digits)).toBe(true);
  });

  it.each([
    ['4242424242424241', 'last digit changed'],
    ['1234567890123456', 'random digits'],
    ['', 'empty'],
    ['4242 4242 4242 4242', 'spaces are not allowed (caller removes them)'],
    ['42424242424242a2', 'contains a letter'],
  ])('rejects %j (%s)', (digits) => {
    expect(passesLuhn(digits)).toBe(false);
  });
});
