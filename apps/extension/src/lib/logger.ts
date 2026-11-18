/*
  Dev-only logging. In production builds `import.meta.env.DEV` is replaced with `false` at build
  time, so the code inside these functions is deleted and nothing is ever printed.
  PRIVACY: devLogText is the ONLY place allowed to print prompt text — and only in dev builds.
*/

/** Logs to the console in dev builds only. Never pass prompt text here — use devLogText. */
export function devLog(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.log('[SafeAI]', ...args);
  }
}

/**
 * Prints prompt text in dev builds only (for debugging the replace flow).
 * NEVER call this from a production-only code path, and never use console.log for text directly.
 */
export function devLogText(label: string, text: string): void {
  if (import.meta.env.DEV) {
    console.log(`[SafeAI][text] ${label}:`, JSON.stringify(text));
  }
}
