// ESLint rules for the whole repo (the "flat config" format).
// Layers, in order: plain JS rules → TypeScript rules (with type info) → React hooks
// → accessibility (jsx-a11y) → Prettier compatibility (turns off style rules Prettier owns).
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  // Never lint build output, generated files or the dev Chrome profile.
  globalIgnores(['**/node_modules/', '**/.output/', '**/.wxt/', '**/dist/']),

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

  // Must be last: switches off any rule that would fight with Prettier.
  prettier,
]);
