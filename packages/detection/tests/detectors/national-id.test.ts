/*
  National ID detector: each country's candidate + validator, context-based confidence for
  plain CNICs, and countries switched off in the policy are never searched.
*/
import { describe, expect, it } from 'vitest';

import {
  nationalIdDetector,
  validateAeEmiratesId,
  validatePkCnic,
  validateUkNino,
  validateUsSsn,
} from '../../src/detectors/national-id';
import { FAKE_IDS, policyWith } from '../fixtures/fake-data';

const allCountries = { policy: policyWith() };
const found = (text: string, ctx = allCountries) => nationalIdDetector.detect(text, ctx);
const summary = (text: string, ctx = allCountries) =>
  found(text, ctx).map((d) => [d.value, d.confidence, d.ruleId]);

describe('validators', () => {
  it('validatePkCnic: 13 digits starting with a province code 1–7', () => {
    expect(validatePkCnic(FAKE_IDS.pkCnicDashed)).toBe(true);
    expect(validatePkCnic(FAKE_IDS.pkCnicPlain)).toBe(true);
    expect(validatePkCnic('0'.repeat(13))).toBe(false);
    expect(validatePkCnic('8'.repeat(13))).toBe(false);
    expect(validatePkCnic('1'.repeat(12))).toBe(false);
  });

  it('validateUsSsn: rejects area 000/666/9xx, group 00, serial 0000', () => {
    expect(validateUsSsn(FAKE_IDS.usSsn)).toBe(true);
    for (const bad of ['000-12-3456', '666-12-3456', '900-12-3456', '999-12-3456']) {
      expect(validateUsSsn(bad)).toBe(false);
    }
    expect(validateUsSsn('123-00-4567')).toBe(false);
    expect(validateUsSsn('123-45-0000')).toBe(false);
  });

  it('validateUkNino: rejects bad letters, bad prefixes and bad suffixes', () => {
    expect(validateUkNino(FAKE_IDS.ukNinoSpaced)).toBe(true);
    expect(validateUkNino(FAKE_IDS.ukNinoCompact)).toBe(true);
    for (const letter of 'DFIQUV') {
      expect(validateUkNino(`${letter}B123456C`)).toBe(false); // bad first letter
      expect(validateUkNino(`A${letter}123456C`)).toBe(false); // bad second letter
    }
    expect(validateUkNino('AO123456C')).toBe(false); // O as second letter
    for (const prefix of ['BG', 'GB', 'KN', 'NK', 'NT', 'TN', 'ZZ']) {
      expect(validateUkNino(`${prefix}123456C`)).toBe(false);
    }
    expect(validateUkNino('AB123456E')).toBe(false);
    expect(validateUkNino('AB12345C')).toBe(false); // too short
  });

  it('validateAeEmiratesId: 15 digits starting with 784', () => {
    expect(validateAeEmiratesId(FAKE_IDS.aeDashed)).toBe(true);
    expect(validateAeEmiratesId(FAKE_IDS.aeCompact)).toBe(true);
    expect(validateAeEmiratesId(`785${FAKE_IDS.aeCompact.slice(3)}`)).toBe(false);
    expect(validateAeEmiratesId(FAKE_IDS.aeCompact.slice(1))).toBe(false);
  });
});

describe('national ID detector', () => {
  it('PK: dashed CNIC is medium', () => {
    expect(summary(`My number ${FAKE_IDS.pkCnicDashed}.`)).toEqual([
      [FAKE_IDS.pkCnicDashed, 'medium', 'national_id.pk_cnic'],
    ]);
  });

  it('PK: plain 13 digits is medium with a context word nearby, low without', () => {
    expect(summary(`CNIC: ${FAKE_IDS.pkCnicPlain}`)).toEqual([
      [FAKE_IDS.pkCnicPlain, 'medium', 'national_id.pk_cnic_plain'],
    ]);
    expect(summary(`${FAKE_IDS.pkCnicPlain} is on my identity card`)[0]?.[1]).toBe('medium');
    expect(summary(`ref ${FAKE_IDS.pkCnicPlain}`)[0]?.[1]).toBe('low');
  });

  it('PK: context further than 30 characters away does not count', () => {
    const text = `CNIC${' '.repeat(40)}${FAKE_IDS.pkCnicPlain}`;
    expect(summary(text)[0]?.[1]).toBe('low');
  });

  it('PK: plain 13 digits starting with 1 are skipped without context (timestamps)', () => {
    expect(found('created 1731974400000')).toEqual([]);
    expect(summary(`CNIC ${FAKE_IDS.pkCnicPlainStartingWith1}`)[0]?.[1]).toBe('medium');
  });

  it('US: SSN is medium; invalid SSNs are not caught', () => {
    expect(summary(`SSN ${FAKE_IDS.usSsn}`)).toEqual([
      [FAKE_IDS.usSsn, 'medium', 'national_id.us_ssn'],
    ]);
    expect(found('000-12-3456 666-12-3456 912-34-5678')).toEqual([]);
  });

  it('UK: NINO with or without spaces is medium; invalid prefixes are not caught', () => {
    expect(summary(`NI ${FAKE_IDS.ukNinoSpaced} and ${FAKE_IDS.ukNinoCompact}`)).toEqual([
      [FAKE_IDS.ukNinoSpaced, 'medium', 'national_id.uk_nino'],
      [FAKE_IDS.ukNinoCompact, 'medium', 'national_id.uk_nino'],
    ]);
    expect(found('QQ 12 34 56 A and GB123456A')).toEqual([]);
  });

  it('AE: Emirates ID with or without dashes is medium; other prefixes are not caught', () => {
    expect(summary(`EID ${FAKE_IDS.aeDashed} / ${FAKE_IDS.aeCompact}`)).toEqual([
      [FAKE_IDS.aeDashed, 'medium', 'national_id.ae_emirates_id'],
      [FAKE_IDS.aeCompact, 'medium', 'national_id.ae_emirates_id'],
    ]);
    expect(found(`785-1990-1234567-1`)).toEqual([]);
  });

  it('only searches countries switched on in the policy', () => {
    const text = `${FAKE_IDS.pkCnicDashed} ${FAKE_IDS.usSsn} ${FAKE_IDS.ukNinoSpaced} ${FAKE_IDS.aeDashed}`;
    const usOnly = { policy: policyWith({}, { nationalIdCountries: ['US'] }) };
    expect(found(text, usOnly).map((d) => d.value)).toEqual([FAKE_IDS.usSsn]);
    const none = { policy: policyWith({}, { nationalIdCountries: [] }) };
    expect(found(text, none)).toEqual([]);
  });

  it('does not catch IDs glued to other digits or dashes', () => {
    expect(found(`9${FAKE_IDS.pkCnicDashed}`)).toEqual([]);
    expect(found(`${FAKE_IDS.usSsn}-1`)).toEqual([]);
  });
});
