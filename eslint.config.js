// ESLint rules for the whole repo (the "flat config" format).
// Layers, in order: plain JS rules → TypeScript rules (with type info) → regex safety
// → React hooks → accessibility (jsx-a11y) → detection-engine purity → Prettier compatibility.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import regexpPlugin from 'eslint-plugin-regexp';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Browser/extension/network globals the detection engine must never touch (it must stay pure:
// no page access, no extension APIs, no network, no storage).
const IMPURE_GLOBALS = [
  'window',
  'document',
  'navigator',
  'location',
  'self',
  'chrome',
  'browser',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'alert',
].map((name) => ({
  name,
  message: 'The detection engine is pure: no DOM, extension APIs, network or storage.',
}));

export default defineConfig([
  // Never lint build output, generated files, coverage reports or the dev Chrome profile.
  globalIgnores(['**/node_modules/', '**/.output/', '**/.wxt/', '**/dist/', '**/coverage/']),

  js.configs.recommended,

  // TypeScript rules that use type information (catches things like forgotten awaits).
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // "No any" rule from our decisions — an error, not a warning.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },

  // Regex quality and safety (flags slow or wrong patterns). Phase 2 safety layer 1.
  regexpPlugin.configs.recommended,

  // Plain JS config files (like this one) run in Node and have no tsconfig.
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { ...globals.node } },
  },

  // React files: hooks rules + accessibility rules.
  {
    files: ['**/*.tsx'],
    extends: [reactHooks.configs.flat.recommended, jsxA11y.flatConfigs.recommended],
  },

  // The detection engine's source must stay pure, and must never log (logs could leak values).
  {
    files: ['packages/detection/src/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', ...IMPURE_GLOBALS],
      'no-console': 'error',
    },
  },

  // Must be last: switches off any rule that would fight with Prettier.
  prettier,
]);
