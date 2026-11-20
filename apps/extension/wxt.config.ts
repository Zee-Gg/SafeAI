/*
  WXT settings for the SafeAI extension: name, permissions, React, Tailwind, and the dev browser.
  WXT turns this (plus the files in entrypoints/) into the real manifest.json at build time.
  Permissions are deliberately minimal: only "storage". The content script's own match pattern
  (https://chatgpt.com/*) is declared in that entrypoint file.
*/
import { resolve } from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],

  manifest: {
    name: 'SafeAI',
    description: 'Protects sensitive data in prompts sent to AI chat tools.',
    permissions: ['storage'],
    // The review panel's fonts (public/fonts). Only chatgpt.com may load them, so no other site
    // can see or probe these files. This is NOT a permission.
    web_accessible_resources: [
      { resources: ['fonts/*.woff2'], matches: ['https://chatgpt.com/*'] },
    ],
  },

  // Tailwind v4 runs as a Vite plugin (WXT uses Vite to bundle the extension).
  vite: () => ({
    plugins: [tailwindcss()],
  }),

  // Dev browser (pnpm dev). A persistent profile folder keeps you logged in to ChatGPT between runs.
  // On Windows the profile path MUST be absolute, hence resolve(). The folder is inside .wxt/,
  // which is git-ignored — it holds your login cookies, so it must never be committed.
  webExt: {
    chromiumProfile: resolve('.wxt/chrome-data'),
    keepProfileChanges: true,
    startUrls: ['https://chatgpt.com'],
  },

  // DEV-ONLY pages: the Detection Playground must never ship. WXT's include/exclude options only
  // filter by browser, not by dev/production, so we remove it from the list of entrypoints to
  // build whenever this is a production build. (Check: after `pnpm build`, there must be no
  // playground.html in apps/extension/.output/chrome-mv3.)
  hooks: {
    'entrypoints:resolved': (wxt, entrypoints) => {
      if (wxt.config.mode !== 'production') return;
      for (let i = entrypoints.length - 1; i >= 0; i--) {
        if (entrypoints[i]?.name === 'playground') entrypoints.splice(i, 1);
      }
    },
  },
});
