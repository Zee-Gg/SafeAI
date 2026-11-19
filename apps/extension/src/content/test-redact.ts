/*
  PHASE 2 TEMPORARY: turns the engine's detections into placeholders for ONE message.
  Phase 3 replaces this with the real redactor (stable placeholders across a conversation,
  review panel, restoring replies). Only "redact" detections are replaced; "block" detections
  are returned so the caller can refuse to send; "warn" detections are left as they are.
*/
import type { Detection } from '@safeai/detection';
import { PLACEHOLDER_LABEL, type DetectorCategory } from '@safeai/shared';

/** The protected text, how many items were replaced, and any detections that block sending. */
export interface TestRedactResult {
  text: string;
  replaced: number;
  /** How many items were replaced per category (for the badge message). */
  replacedByCategory: Partial<Record<DetectorCategory, number>>;
  blocked: Detection[];
}

/**
 * Replaces each "redact" detection with [LABEL_n] (e.g. [EMAIL_1], [API_KEY_2]). The same value
 * gets the same number within this message. Replacement runs from the END of the text
 * backwards, so earlier positions stay correct while we edit.
 */
export function testRedact(text: string, detections: readonly Detection[]): TestRedactResult {
  const blocked = detections.filter((d) => d.action === 'block');
  const toRedact = detections
    .filter((d) => d.action === 'redact')
    .sort((a, b) => a.start - b.start);

  // Number placeholders in reading order: first email → [EMAIL_1], next new email → [EMAIL_2]…
  const numbers = new Map<string, number>(); // key: label + value
  const nextNumber = new Map<string, number>(); // key: label
  const placeholders = toRedact.map((d) => {
    const label = PLACEHOLDER_LABEL[d.category];
    const key = `${label}\u0000${d.value}`;
    let n = numbers.get(key);
    if (n === undefined) {
      n = (nextNumber.get(label) ?? 0) + 1;
      nextNumber.set(label, n);
      numbers.set(key, n);
    }
    return `[${label}_${n}]`;
  });

  let result = text;
  const replacedByCategory: Partial<Record<DetectorCategory, number>> = {};
  for (let i = toRedact.length - 1; i >= 0; i--) {
    const d = toRedact[i];
    const placeholder = placeholders[i];
    if (!d || placeholder === undefined) continue;
    result = result.slice(0, d.start) + placeholder + result.slice(d.end);
    replacedByCategory[d.category] = (replacedByCategory[d.category] ?? 0) + 1;
  }

  return { text: result, replaced: toRedact.length, replacedByCategory, blocked };
}

/** Singular/plural names for the badge ("1 email", "2 API keys"). */
const ITEM_NAMES: Readonly<Record<DetectorCategory, readonly [string, string]>> = {
  email: ['email', 'emails'],
  phone: ['phone number', 'phone numbers'],
  person_name: ['name', 'names'],
  address: ['address', 'addresses'],
  api_key: ['API key', 'API keys'],
  password: ['password', 'passwords'],
  secret: ['secret', 'secrets'],
  credit_card: ['card number', 'card numbers'],
  bank_account: ['bank account', 'bank accounts'],
  national_id: ['national ID', 'national IDs'],
  token_url: ['URL token', 'URL tokens'],
  client_name: ['client name', 'client names'],
  company_name: ['company name', 'company names'],
  project_name: ['project name', 'project names'],
  internal_system: ['internal system', 'internal systems'],
  custom_term: ['custom term', 'custom terms'],
};

/** "1 email" / "2 API keys". */
export function describeCount(category: DetectorCategory, count: number): string {
  const [singular, plural] = ITEM_NAMES[category];
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Badge text such as "Protected 3 items (2 emails, 1 API key)". Shows the 3 largest categories
 * and "+N more" for the rest, so the badge stays short.
 */
export function summarizeProtection(byCategory: Partial<Record<DetectorCategory, number>>): string {
  const entries = (Object.entries(byCategory) as [DetectorCategory, number][]).sort(
    (a, b) => b[1] - a[1],
  );
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  const shown = entries.slice(0, 3).map(([category, count]) => describeCount(category, count));
  const more = entries.length > 3 ? `, +${entries.length - 3} more` : '';
  return `Protected ${total} item${total === 1 ? '' : 's'} (${shown.join(', ')}${more})`;
}
