/*
  Where the content script gets its policy from: DEFAULT_POLICY, or — in DEV builds only — the
  override saved from the Detection Playground. In production builds `import.meta.env.DEV` is
  false, so the override code is removed and only DEFAULT_POLICY is ever used.
*/
import { DEFAULT_POLICY, PolicySchema, type Policy } from '@safeai/shared';

import { devPolicyOverrideItem } from '../lib/storage';

let devOverride: Policy | null = null;

/** The policy to use right now: DEFAULT_POLICY, or the dev override in dev builds. */
export function getActivePolicy(): Policy {
  return import.meta.env.DEV && devOverride ? devOverride : DEFAULT_POLICY;
}

/** True when a dev override is active (always false in production builds). */
export function isDevOverrideActive(): boolean {
  return import.meta.env.DEV && devOverride !== null;
}

/**
 * DEV BUILDS ONLY: loads the override and keeps it up to date while the page is open.
 * Invalid stored values are ignored (the default policy is used). Returns an "unwatch" function.
 */
export async function startPolicySource(onChange?: () => void): Promise<() => void> {
  const item = devPolicyOverrideItem; // null in production builds
  if (!import.meta.env.DEV || !item) return () => undefined;

  const apply = (value: unknown) => {
    const parsed = PolicySchema.safeParse(value);
    devOverride = parsed.success ? parsed.data : null;
    onChange?.();
  };
  apply(await item.getValue());
  return item.watch(apply);
}
