/*
  A tiny clock for timing detection. Uses performance.now() (sub-millisecond precision) when
  it exists, otherwise Date.now(). The engine's tsconfig has no DOM types, so we describe the
  one thing we need ({ now(): number }) ourselves instead of pulling in browser types.
*/

/** The only part of `performance` we use. */
interface PerformanceLike {
  now(): number;
}

/** Builds a clock from wherever `performance` might live (normally globalThis). */
export function createClock(source: { performance?: PerformanceLike }): () => number {
  const perf = source.performance;
  return perf ? () => perf.now() : () => Date.now();
}

/** Current time in milliseconds, for measuring how long detection takes. */
export const now = createClock(globalThis);
