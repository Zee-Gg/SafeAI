<!--
  The tech decisions for SafeAI, each with a one-line reason, plus the changes we made
  during Phase 1 and why. Add new decisions at the bottom of the matching section.
-->

# Decisions

## Original decisions (Phase 1 prompt)

| Decision                                                            | Reason                                                                                                       |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **pnpm workspaces**                                                 | Fast installs, and one repo can hold several packages that share code.                                       |
| **Node 24 LTS**                                                     | The current long-term-support version: stable and supported for years.                                       |
| **WXT (React template)**                                            | Handles Manifest V3, hot reload and browser launching, so we write features instead of build plumbing.       |
| **Monorepo, no Turborepo**                                          | Only 3 packages, so a build-orchestration tool would add complexity without real benefit.                    |
| **Tailwind CSS v4, tokens in one CSS file**                         | One place defines every colour and size. Tailwind v4 reads them straight from CSS (`@theme`).                |
| **ESLint flat config + typescript-eslint + react-hooks + jsx-a11y** | Catches bugs, wrong hook usage and accessibility problems while we type.                                     |
| **Prettier + prettier-plugin-tailwindcss + eslint-config-prettier** | Consistent formatting and sorted Tailwind classes, without ESLint and Prettier fighting.                     |
| **WXT auto-launched Chrome with a persistent profile**              | Dev Chrome opens with the extension loaded and remembers the ChatGPT login.                                  |
| **Product name "SafeAI"**                                           | Short name for the UI; "for Teams" comes later.                                                              |
| **TypeScript strict, no `any`**                                     | The compiler catches mistakes early, and types document the code.                                            |
| **Zod for message shapes**                                          | Every message is checked when it arrives, so bad or unexpected data is rejected safely.                      |
| **Only the `storage` permission**                                   | Fewer permissions = less risk and more user trust. The content script is limited to `https://chatgpt.com/*`. |

## Decisions made during Phase 1

| Decision                                                          | Reason                                                                                                                                                                |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ESLint 9, not 10**                                              | `eslint-plugin-jsx-a11y` 6.10 doesn't support ESLint 10 yet. npm marks 9 as "deprecated"; upgrade when jsx-a11y catches up.                                           |
| **TypeScript 6.0, not 7**                                         | `typescript-eslint` 8.x supports TypeScript below 6.1 only. TypeScript 7 is the new Go-based compiler.                                                                |
| **`defineConfig` from `eslint/config`**                           | Current typescript-eslint docs recommend it instead of the older `tseslint.config()` helper.                                                                          |
| **fnm to install Node 24**                                        | The PC already had Node 22. fnm keeps both, and switches automatically using `.nvmrc`.                                                                                |
| **`.prettierrc` in YAML**                                         | JSON can't hold comments; YAML can, and every file starts with an explanatory comment.                                                                                |
| **`.gitattributes` forces LF line endings**                       | Git on Windows would convert files to CRLF, and `format:check` would then fail.                                                                                       |
| **`vite` and `web-ext` added (approved)**                         | WXT 0.21 no longer bundles them. Vite is required to build; web-ext is needed for `pnpm dev` to auto-open Chrome.                                                     |
| **Geist from `@fontsource-variable` (approved)**                  | Local font files bundled with the popup: no CDN, works offline, leaks nothing.                                                                                        |
| **All sizes in px, not rem**                                      | The badge lives on chatgpt.com, where `rem` follows ChatGPT's own root font size.                                                                                     |
| **`--color-*: initial` in the tokens**                            | Removes Tailwind's default palette, so only SafeAI colours can be used.                                                                                               |
| **Strict Zod objects (`z.strictObject`)**                         | A message with an unexpected field (like `text`) is rejected. This is a safety net for the "no prompt text in messages" rule.                                         |
| **Validate messages before sending AND on arrival**               | Privacy mistakes are caught at the source, and bad input never reaches the router.                                                                                    |
| **Background replies with `sendResponse` + `return true`**        | The classic Chrome pattern. It works in every Chrome version.                                                                                                         |
| **`CONTENT_PING` message for the popup's status card (approved)** | Chrome hides `tab.url` without the `tabs` permission. Asking the tab's content script needs no permission.                                                            |
| **`getMode()` parameter on the interceptor (approved)**           | The interceptor decides at the moment of each event whether to block (replace) or only watch (observe).                                                               |
| **Badge at top-right, click-through**                             | Bottom-right (the original plan) covered ChatGPT's input buttons. `pointer-events: none` means it can never block a ChatGPT click; only the error badge is clickable. |
| **Manual `--tw-*` defaults in `ui.css`**                          | Tailwind sets them with `@property`, which Chrome ignores inside Shadow DOM. Without them the badge had no border.                                                    |
| **Badge shadow via `[box-shadow:var(--shadow-lg)]`**              | Same Shadow DOM reason: Tailwind's `shadow-*` classes depend on `@property` variables.                                                                                |
| **Send confirmed by "input box became empty"**                    | ChatGPT empties the box after sending, so this is a reliable "it really went" signal without reading the network.                                                     |
| **One replace at a time (`busy` flag)**                           | Pressing Enter twice quickly must not start two overlapping replacements.                                                                                             |
| **Developer mode must be on**                                     | Chrome 157 doesn't run unpacked extensions' service workers without it.                                                                                               |
| **One short git commit per milestone**                            | Your preference: a clean history that matches the milestones. Pushed to `github.com/Zee-Gg/SafeAI`.                                                                   |
