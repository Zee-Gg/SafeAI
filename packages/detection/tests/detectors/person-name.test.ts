/*
  Person name detector: context only (titles, name labels, greetings, sign-offs). Catches ONLY
  the name. Capitalised words without context, and "Hi team"-style greetings, are NOT caught.
  All names below are made-up examples.
*/
import { describe, expect, it } from 'vitest';

import { personNameDetector } from '../../src/detectors/person-name';
import { policyWith } from '../fixtures/fake-data';

const ctx = { policy: policyWith() };
const summary = (text: string) =>
  personNameDetector
    .detect(text, ctx)
    .sort((a, b) => a.start - b.start)
    .map((d) => {
      expect(text.slice(d.start, d.end)).toBe(d.value);
      return [d.value, d.confidence, d.ruleId];
    });
const names = (text: string) => summary(text).map(([value]) => value);

describe('person name detector', () => {
  it.each([
    ['Please call Dr. Ayesha Khan today', 'Ayesha Khan'],
    ['Mr Bean arrived', 'Bean'],
    ['Mrs Sara Ali Raza signed', 'Sara Ali Raza'],
    ['Ask Prof. Imran about it', 'Imran'],
    ['Ms. Smith’s report', 'Smith'],
    ["Ms Smith's report", 'Smith'],
    ['Sir Alex Ferguson Junior Senior', 'Alex Ferguson Junior'],
  ])('title: %j → %j (medium)', (text, name) => {
    expect(summary(text)).toEqual([[name, 'medium', 'person_name.title']]);
  });

  it.each([
    ['Name: Bilal Ahmed', 'Bilal Ahmed'],
    ['full name = Zara Noor Hussain Shah Extra', 'Zara Noor Hussain Shah'],
    ['NAME: Omar', 'Omar'],
    ["Name: O'Neil Al-Khan", "O'Neil Al-Khan"],
  ])('label: %j → %j (medium)', (text, name) => {
    expect(summary(text)).toEqual([[name, 'medium', 'person_name.label']]);
  });

  it.each([
    ['Hi Sarah,\nthanks for this', 'Sarah'],
    ['Dear Ali Raza,', 'Ali Raza'],
    ['Hello Fatima!', 'Fatima'],
    ['  Hey John\nsee below', 'John'],
  ])('greeting: %j → %j (low)', (text, name) => {
    expect(summary(text)).toEqual([[name, 'low', 'person_name.greeting']]);
  });

  it.each([
    ['Regards,\nHamza Iqbal', 'Hamza Iqbal'],
    ['Thanks,\n  Nadia', 'Nadia'],
    ['Best regards\r\nUsman Tariq | CEO', 'Usman Tariq'],
    ['Cheers,\nLeo', 'Leo'],
  ])('sign-off: %j → %j (low)', (text, name) => {
    expect(summary(text)).toEqual([[name, 'low', 'person_name.sign_off']]);
  });

  it('a greeting followed by a title reports the name once, via the title rule', () => {
    expect(summary('Dear Mr Khan,')).toEqual([['Khan', 'medium', 'person_name.title']]);
  });

  it.each([
    ['Hi team,', 'greeting to a group'],
    ['Hello there!', 'not a name'],
    ['Hi Everyone,', 'group, capitalised'],
    ['Thanks,\nThe Team', 'team sign-off'],
    ['Hi Sarah and the team', 'greeting not ending at comma/line end'],
    ['Meeting in London with Google about Excel', 'capitalised words without context'],
    ['The Report Was Approved', 'title case sentence'],
    ['username: Bilal', '"name" inside "username"'],
    ['Company name: Acme Traders', 'company name, not a person'],
    ['File name: Report', 'file name'],
    ['Name: ', 'label with nothing after it'],
    ['name: bilal', 'lowercase, not a capitalised name'],
    ['Say hi Sarah,', 'greeting not at the start of a line'],
  ])('does not catch %j (%s)', (text) => {
    expect(names(text)).toEqual([]);
  });

  it('never crosses a line break into the next line', () => {
    expect(names('Dr. Ayesha\nKhan Report')).toEqual(['Ayesha']);
  });
});
