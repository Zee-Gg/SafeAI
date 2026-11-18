/*
  The list of AI chat sites SafeAI supports.
  Phase 1 supports ChatGPT only; Claude and Gemini are added in later phases.
*/

/** Every site id we know about. Used to build the Zod schema for messages. */
export const SITE_IDS = ['chatgpt'] as const;

/** A supported site id, e.g. "chatgpt". */
export type SiteId = (typeof SITE_IDS)[number];

/** Describes one supported AI site. */
export interface SupportedSite {
  /** Short internal id. */
  id: SiteId;
  /** Name shown in the UI. */
  name: string;
  /** Chrome match patterns for the pages where our content script runs. */
  matches: readonly string[];
}

/** All supported AI sites. */
export const SUPPORTED_SITES: readonly SupportedSite[] = [
  { id: 'chatgpt', name: 'ChatGPT', matches: ['https://chatgpt.com/*'] },
];

/** Returns the display name for a site id (e.g. "chatgpt" → "ChatGPT"). */
export function getSiteName(id: SiteId): string {
  return SUPPORTED_SITES.find((site) => site.id === id)?.name ?? id;
}
