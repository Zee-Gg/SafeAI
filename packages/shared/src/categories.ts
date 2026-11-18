/*
  Every kind of sensitive data SafeAI knows about ("categories"), which group each belongs to,
  its display name, and the label used in placeholders like [EMAIL_1].
  Shared by the detection engine, the extension and (later) the dashboard.
*/

/** All detection categories, in a stable order (used for UI lists and Zod enums). */
export const DETECTOR_CATEGORIES = [
  'email',
  'phone',
  'person_name',
  'address',
  'api_key',
  'password',
  'secret',
  'credit_card',
  'bank_account',
  'national_id',
  'token_url',
  'client_name',
  'company_name',
  'project_name',
  'internal_system',
  'custom_term',
] as const;

/** One detection category, e.g. "email". */
export type DetectorCategory = (typeof DETECTOR_CATEGORIES)[number];

/** The four colour-coded groups shown in the UI. */
export type CategoryGroup = 'personal' | 'secrets' | 'financial' | 'business';

/** The categories a company's custom term can be given (all in the "business" group). */
export const CUSTOM_TERM_CATEGORIES = [
  'client_name',
  'company_name',
  'project_name',
  'internal_system',
  'custom_term',
] as const;

/** A category a custom term can have. */
export type CustomTermCategory = (typeof CUSTOM_TERM_CATEGORIES)[number];

/** Which group each category belongs to (decides its colour in the UI). */
export const CATEGORY_GROUP: Readonly<Record<DetectorCategory, CategoryGroup>> = {
  email: 'personal',
  phone: 'personal',
  person_name: 'personal',
  address: 'personal',
  national_id: 'personal',
  api_key: 'secrets',
  password: 'secrets',
  secret: 'secrets',
  token_url: 'secrets',
  credit_card: 'financial',
  bank_account: 'financial',
  client_name: 'business',
  company_name: 'business',
  project_name: 'business',
  internal_system: 'business',
  custom_term: 'business',
};

/** Human-friendly display names. */
export const CATEGORY_LABEL: Readonly<Record<DetectorCategory, string>> = {
  email: 'Email',
  phone: 'Phone number',
  person_name: 'Person name',
  address: 'Address',
  api_key: 'API key',
  password: 'Password',
  secret: 'Secret',
  credit_card: 'Card number',
  bank_account: 'Bank account',
  national_id: 'National ID',
  token_url: 'Token in URL',
  client_name: 'Client name',
  company_name: 'Company name',
  project_name: 'Project name',
  internal_system: 'Internal system',
  custom_term: 'Custom term',
};

/** The word used inside placeholders, e.g. email → [EMAIL_1]. */
export const PLACEHOLDER_LABEL: Readonly<Record<DetectorCategory, string>> = {
  email: 'EMAIL',
  phone: 'PHONE',
  person_name: 'PERSON',
  address: 'ADDRESS',
  api_key: 'API_KEY',
  password: 'PASSWORD',
  secret: 'SECRET',
  credit_card: 'CARD',
  bank_account: 'BANK',
  national_id: 'ID',
  token_url: 'TOKEN',
  client_name: 'CLIENT',
  company_name: 'COMPANY',
  project_name: 'PROJECT',
  internal_system: 'SYSTEM',
  custom_term: 'TERM',
};

/** True for the five business categories that custom terms use. */
export function isCustomTermCategory(category: DetectorCategory): category is CustomTermCategory {
  return (CUSTOM_TERM_CATEGORIES as readonly string[]).includes(category);
}
