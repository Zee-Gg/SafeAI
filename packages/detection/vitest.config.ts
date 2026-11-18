/*
  Vitest settings for the detection engine.
  `pnpm test` runs once with coverage and FAILS if lines or branches drop below 90%.
  `pnpm test:watch` re-runs tests on save, without coverage (faster).
*/
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
      thresholds: {
        lines: 90,
        branches: 90,
      },
    },
  },
});
