/*
  Prepares everything that depends only on the policy (which detectors are on, and later the
  custom-term search machine), and caches it, so each detect() call doesn't redo that work.
  Two cache levels: the same policy object is found instantly; an equal policy built again is
  found by a key (version + a quick hash of the policy contents), so changing terms rebuilds it.
*/
import type { Policy } from '@safeai/shared';

import type { Detector, DetectorContext } from './types';

/** The prepared, reusable data for one policy + detector list. */
export interface PreparedContext extends DetectorContext {
  /** Detectors with at least one category that isn't "allow". */
  enabledDetectors: readonly Detector[];
}

const MAX_CACHED = 8;
const byKey = new Map<string, PreparedContext>();
let byObject = new WeakMap<Policy, { detectors: readonly Detector[]; context: PreparedContext }>();

/** Returns the prepared context for this policy, building it only if it isn't cached yet. */
export function prepareContext(policy: Policy, detectors: readonly Detector[]): PreparedContext {
  const fast = byObject.get(policy);
  if (fast?.detectors === detectors) return fast.context;

  const key = cacheKey(policy, detectors);
  let context = byKey.get(key);
  if (!context) {
    context = build(policy, detectors);
    if (byKey.size >= MAX_CACHED) {
      const oldest = byKey.keys().next().value;
      if (oldest !== undefined) byKey.delete(oldest);
    }
    byKey.set(key, context);
  }
  byObject.set(policy, { detectors, context });
  return context;
}

/** Empties the cache (used by tests). */
export function clearContextCache(): void {
  byKey.clear();
  byObject = new WeakMap();
}

function build(policy: Policy, detectors: readonly Detector[]): PreparedContext {
  const enabledDetectors = detectors.filter((detector) =>
    detector.categories.some((category) => policy.rules[category].action !== 'allow'),
  );
  return { policy, enabledDetectors };
}

/** version + detector ids + a hash of everything else in the policy. */
function cacheKey(policy: Policy, detectors: readonly Detector[]): string {
  const ids = detectors.map((detector) => detector.id).join(',');
  const contents = JSON.stringify([
    policy.rules,
    policy.customTerms,
    policy.nationalIdCountries,
    policy.defaultPhoneCountry,
  ]);
  return `${policy.version}|${ids}|${contents.length}|${fnv1a(contents)}`;
}

/** FNV-1a: a fast, simple 32-bit string hash (not for security, only for cache keys). */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}
