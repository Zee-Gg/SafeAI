/*
  Loads Geist for SafeAI's UI on chatgpt.com (badge and review panel).
  Chrome ignores @font-face rules declared INSIDE a Shadow DOM, but fonts registered on the page's
  document can be used inside it. We register them with the FontFace API under our own names
  ("SafeAI Geist", "SafeAI Geist Mono"), so they never clash with ChatGPT's fonts, and we don't
  touch the page's <head>. The files come from public/fonts (web-accessible to chatgpt.com only).
  If anything fails, the CSS font stacks fall back to system fonts.
*/
import { browser } from 'wxt/browser';

import { devLog } from '../lib/logger';

// The same Unicode ranges @fontsource uses for these two files.
const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const LATIN_EXT =
  'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';

const FACES = [
  { family: 'SafeAI Geist', file: '/fonts/geist-latin-wght-normal.woff2', range: LATIN },
  { family: 'SafeAI Geist', file: '/fonts/geist-latin-ext-wght-normal.woff2', range: LATIN_EXT },
  { family: 'SafeAI Geist Mono', file: '/fonts/geist-mono-latin-wght-normal.woff2', range: LATIN },
  {
    family: 'SafeAI Geist Mono',
    file: '/fonts/geist-mono-latin-ext-wght-normal.woff2',
    range: LATIN_EXT,
  },
] as const;

let registered = false;

/** Registers SafeAI's fonts on the page once. Safe to call many times; never throws. */
export function ensureFonts(): void {
  if (registered) return;
  registered = true;
  for (const { family, file, range } of FACES) {
    try {
      const url = browser.runtime.getURL(file); // chrome-extension://<our id>/fonts/…
      const face = new FontFace(family, `url("${url}") format("woff2")`, {
        weight: '100 900', // variable font: every weight in one file
        style: 'normal',
        display: 'swap', // show system text at once, swap in Geist when it's ready
        unicodeRange: range,
      });
      document.fonts.add(face);
      // Fonts load lazily when first used; a failure only means system fonts are shown.
      face.loaded.catch(() => devLog('Font failed to load (system font used):', file));
    } catch {
      devLog('Could not register font (system font used):', file);
    }
  }
}
