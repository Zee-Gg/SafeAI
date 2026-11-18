/*
  Credit card detector: every network's official test number is caught (plain, spaced, dashed);
  numbers failing Luhn, unknown prefixes, wrong lengths and mixed separators are NOT.
*/
import { describe, expect, it } from 'vitest';

import { cardNetwork, creditCardDetector } from '../../src/detectors/credit-card';
import { policyWith, TEST_CARDS } from '../fixtures/fake-data';

const ctx = { policy: policyWith() };
const found = (text: string) => creditCardDetector.detect(text, ctx);

describe('credit card detector', () => {
  it.each([
    [TEST_CARDS.visa, 'visa'],
    [TEST_CARDS.visaSpaced, 'visa'],
    [TEST_CARDS.mastercard, 'mastercard'],
    [TEST_CARDS.mastercardDashed, 'mastercard'],
    [TEST_CARDS.mastercard2Series, 'mastercard'],
    [TEST_CARDS.amex, 'amex'],
    [TEST_CARDS.amexSpaced, 'amex'],
    [TEST_CARDS.discover, 'discover'],
    [TEST_CARDS.diners, 'diners'],
    [TEST_CARDS.dinersShort, 'diners'],
    [TEST_CARDS.jcb, 'jcb'],
    [TEST_CARDS.unionpay, 'unionpay'],
  ])('catches %s as %s', (card, network) => {
    const text = `pay with ${card}, thanks`;
    expect(found(text)).toEqual([
      {
        start: 9,
        end: 9 + card.length,
        value: card,
        category: 'credit_card',
        confidence: 'high',
        ruleId: `credit_card.${network}`,
      },
    ]);
  });

  it.each([
    ['4242424242424241', 'fails Luhn'],
    ['1234 5678 9012 3456', 'random digits'],
    ['9400 1000 0000 0000 0000 00', 'USPS-style tracking number'],
    ['7000000000000005', 'passes Luhn but unknown prefix 7'],
    ['4242 4242-4242 4242', 'mixed separators'],
    ['4242  4242 4242 4242', 'double space'],
    ['424242424242', 'only 12 digits'],
    ['42424242424242424242', '20 digits'],
    ['ref-4242424242424242', 'glued to a dash before it'],
  ])('does not catch %j (%s)', (text) => {
    expect(found(text)).toEqual([]);
  });

  it('finds two cards in one text', () => {
    expect(found(`${TEST_CARDS.visa} and ${TEST_CARDS.amex}`).map((d) => d.value)).toEqual([
      TEST_CARDS.visa,
      TEST_CARDS.amex,
    ]);
  });

  it('cardNetwork knows each prefix range edge', () => {
    expect(cardNetwork('2221000000000000')).toBe('mastercard');
    expect(cardNetwork('2720999999999999')).toBe('mastercard');
    expect(cardNetwork('2220999999999999')).toBeNull();
    expect(cardNetwork('6440000000000000')).toBe('discover');
    expect(cardNetwork('6490000000000000')).toBe('discover');
    expect(cardNetwork('6500000000000000')).toBe('discover');
    expect(cardNetwork('3528000000000000')).toBe('jcb');
    expect(cardNetwork('3589000000000000')).toBe('jcb');
    expect(cardNetwork('3000000000000000')).toBe('diners');
    expect(cardNetwork('3050000000000000')).toBe('diners');
    expect(cardNetwork('3800000000000000')).toBe('diners');
    expect(cardNetwork('3060000000000000')).toBeNull();
    expect(cardNetwork('9999999999999999')).toBeNull();
  });
});
