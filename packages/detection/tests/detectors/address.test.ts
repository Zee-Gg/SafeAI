/*
  Address detector: low confidence by design. Street addresses, "House #12, Street 5" style,
  UK postcodes, US state + ZIP, and 5-digit codes after a postal-code word or city.
  "Road map", "Phase 2 of the project" and "Block quote" are NOT caught. All addresses are examples.
*/
import { describe, expect, it } from 'vitest';

import { addressDetector } from '../../src/detectors/address';
import { policyWith } from '../fixtures/fake-data';

const ctx = { policy: policyWith() };
const summary = (text: string) =>
  addressDetector
    .detect(text, ctx)
    .sort((a, b) => a.start - b.start)
    .map((d) => {
      expect(text.slice(d.start, d.end)).toBe(d.value);
      expect(d.confidence).toBe('low');
      return [d.value, d.ruleId];
    });

describe('address detector', () => {
  it.each([
    ['Lives at 221B Baker Street now', '221B Baker Street'],
    ['Office: 12 Model Town, Lahore', '12 Model Town'],
    ['Send it to 45 Gulshan Colony.', '45 Gulshan Colony'],
    ['1600 Pennsylvania Avenue', '1600 Pennsylvania Avenue'],
    ['Visit 10 Main St. today', '10 Main St.'],
    ['at 7 Upper Mall Road, Lahore', '7 Upper Mall Road'],
    ['Plot 18, 3 Sea View Lane Extension Phase', '3 Sea View Lane'],
  ])('street: %j → %j', (text, address) => {
    expect(summary(text)).toContainEqual([address, 'address.street']);
  });

  it('allows up to 4 words between the number and the street word', () => {
    expect(summary('5 One Two Three Four Road')).toEqual([
      ['5 One Two Three Four Road', 'address.street'],
    ]);
    expect(summary('5 One Two Three Four Five Road')).toEqual([]);
  });

  it.each([
    ['House #12, Street 5, Sector F-7', 'House #12, Street 5'],
    ['H No. 7 Street 3', 'H No. 7 Street 3'],
    ['house # 44 street # 9', 'house # 44 street # 9'],
  ])('house + street: %j → %j', (text, address) => {
    expect(summary(text)).toContainEqual([address, 'address.house_street']);
  });

  it.each(['SW1A 1AA', 'M1 1AE', 'EC1A1BB', 'B33 8TH'])('UK postcode %s', (postcode) => {
    expect(summary(`Post it to ${postcode} please`)).toEqual([[postcode, 'address.uk_postcode']]);
  });

  it.each(['NY 10001', 'CA 94105-1234', 'TX 73301'])('US state + ZIP %s', (zip) => {
    expect(summary(`Ship to ${zip}`)).toEqual([[zip, 'address.us_zip']]);
  });

  it.each([
    ['Postal code: 54000', '54000'],
    ['zip 75500', '75500'],
    ['Lahore 54000, Pakistan', '54000'],
    ['karachi 75500', '75500'],
  ])('labelled 5-digit code: %j → only %j', (text, code) => {
    expect(summary(text)).toEqual([[code, 'address.postal_code']]);
  });

  it.each([
    ['Our 2026 Product Road map is ready', '"Road map"'],
    ['Phase 2 of the project starts soon', 'phase of a project'],
    ['Use a Block quote here', '"Block quote"'],
    ['In 2024 Phase 2 begins', 'number but no name words'],
    ['We sold 54000 units', '5-digit number without a postal word'],
    ['Street 5', 'no house number before'],
    ['Model Town is nice', 'no number'],
    ['the 12 main street', 'lowercase words'],
  ])('does not catch %j (%s)', (text) => {
    expect(summary(text)).toEqual([]);
  });
});
