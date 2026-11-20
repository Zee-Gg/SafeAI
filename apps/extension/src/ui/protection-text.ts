/*
  Short human-readable texts about what was protected, e.g. "Protected 3 items (2 emails, 1 API key)".
  Counts and category names only — never values.
*/
import type { DetectorCategory } from '@safeai/shared';

/** Singular/plural names ("1 email", "2 API keys"). */
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
