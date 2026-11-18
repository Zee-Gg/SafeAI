/*
  Phone detector: real-format numbers are caught (high if international, medium otherwise);
  dates, years, versions, prices, order numbers and card numbers are NOT.
*/
import { describe, expect, it } from 'vitest';

import { phoneDetector } from '../../src/detectors/phone';
import { FAKE_PHONES, policyWith, TEST_CARDS } from '../fixtures/fake-data';

const pk = { policy: policyWith() }; // default phone country PK
const found = (text: string, ctx = pk) => phoneDetector.detect(text, ctx);
const values = (text: string, ctx = pk) => found(text, ctx).map((d) => d.value);

describe('phone detector', () => {
  it('catches a PK mobile number written nationally (medium)', () => {
    expect(found(`Call ${FAKE_PHONES.pkMobile} today`)).toEqual([
      {
        start: 5,
        end: 5 + FAKE_PHONES.pkMobile.length,
        value: FAKE_PHONES.pkMobile,
        category: 'phone',
        confidence: 'medium',
        ruleId: 'phone.national',
      },
    ]);
  });

  it('catches international numbers with high confidence', () => {
    const results = found(`PK ${FAKE_PHONES.pkInternational}, US ${FAKE_PHONES.usInternational}`);
    expect(results.map((r) => [r.value, r.confidence])).toEqual([
      [FAKE_PHONES.pkInternational, 'high'],
      [FAKE_PHONES.usInternational, 'high'],
    ]);
  });

  it('treats 00 + country code as international', () => {
    expect(found('call 0092 300 1234567')[0]?.confidence).toBe('high');
  });

  it('catches a PK landline', () => {
    expect(values(`office: ${FAKE_PHONES.pkLandline}`)).toEqual([FAKE_PHONES.pkLandline]);
  });

  it('uses the policy default country for national numbers', () => {
    const us = { policy: policyWith({}, { defaultPhoneCountry: 'US' }) };
    expect(values('call (415) 555-0132', us)).toEqual(['(415) 555-0132']);
    expect(values(`call ${FAKE_PHONES.pkMobile}`, us)).toEqual([]);
  });

  it('with an unsupported default country, still finds +international numbers only', () => {
    const uk = { policy: policyWith({}, { defaultPhoneCountry: 'UK' }) }; // phone code is "GB"
    expect(values(`${FAKE_PHONES.pkMobile} or ${FAKE_PHONES.pkInternational}`, uk)).toEqual([
      FAKE_PHONES.pkInternational,
    ]);
  });

  it.each([
    ['Due 2026-11-18 at 10:30', 'ISO date and time'],
    ['Born 18/11/1990', 'slash date'],
    ['Since 2026', 'year'],
    ['Version 1.2.3 and 10.4.12.7', 'version numbers'],
    ['Price $1,234.56 or Rs 45,000', 'prices'],
    ['Order #10023', 'short order number'],
    ['Order #3001234567', 'order number that is also a valid PK mobile without the 0'],
    ['Total Rs 3001234567', 'amount that looks like a mobile number'],
    [`Card ${TEST_CARDS.visaSpaced}`, 'card number'],
    ['IP 192.168.100.200', 'IP address'],
    ['timestamp 1731974400000', 'millisecond timestamp'],
    ['Invoice INV-2026-000123', 'invoice number'],
  ])('does not catch %j (%s)', (text) => {
    expect(values(text)).toEqual([]);
  });

  it('drops a valid number that is only a card number in disguise (Luhn-valid, 13–19 digits)', () => {
    // A PK number with an extension making 13+ digits that happens to pass Luhn would be dropped;
    // here we check the filter directly with a long valid card written like a phone number.
    expect(values(`call ${TEST_CARDS.visa}`)).toEqual([]);
  });
});
