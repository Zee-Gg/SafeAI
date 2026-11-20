/*
  Dev-only logging. In production builds `import.meta.env.DEV` is replaced with `false` at build
  time, so the code inside this function is deleted and nothing is ever printed.
  PRIVACY (Phase 3): prompt text and real values are NEVER logged, not even in dev. Phase 1's
  devLogText (which printed prompt text in dev) was removed so it can't be used by accident.
*/

/** Logs to the console in dev builds only. Metadata only: never prompt text or values. */
export function devLog(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.log('[SafeAI]', ...args);
  }
}
