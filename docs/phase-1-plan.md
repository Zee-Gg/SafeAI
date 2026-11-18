<!--
  Phase 1 plan for SafeAI for Teams.
  This is the single source of truth for what Phase 1 builds. If the code changes, this file changes too.
-->

# SafeAI — Phase 1 Plan

> Status: **Draft, waiting for approval** (Milestone 0)
> Last updated: 2026-11-17

---

## 1. Goal and "done when"

**Goal:** Build the base of the SafeAI Chrome extension and prove the riskiest idea works:

> We can stop a ChatGPT message before it is sent, change its text, and send the changed version.

**Done when:** "Test replace mode" is switched ON in the popup, I type `email me at ali@test.com` in ChatGPT, press Enter, and ChatGPT receives `email me at [EMAIL_1]` instead.

**In scope:** ChatGPT only (`https://chatgpt.com/*`).
**Out of scope:** detection engine, login, server, dashboard, Claude, Gemini.

---

## 2. Decisions (with a one-line reason each)

| Decision                                                            | Reason                                                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **pnpm workspaces**                                                 | Fast installs, and one repo can hold several packages that share code.                                 |
| **Node 24 LTS**                                                     | Current long-term-support version, so it is stable and supported for years.                            |
| **WXT (React template)**                                            | Handles Manifest V3, hot reload and browser launching, so we write features instead of build plumbing. |
| **Monorepo, no Turborepo**                                          | We only have 3 packages, so a build-orchestration tool would add complexity without real benefit.      |
| **Tailwind CSS v4, tokens in one shared CSS file**                  | One place defines every colour/size. Tailwind v4 reads them straight from CSS (`@theme`).              |
| **ESLint flat config + typescript-eslint + react-hooks + jsx-a11y** | Catches bugs, wrong hook usage and accessibility problems while we type.                               |
| **Prettier + prettier-plugin-tailwindcss + eslint-config-prettier** | Consistent formatting and sorted Tailwind classes. ESLint and Prettier don't argue over style.         |
| **WXT auto-launched Chrome with a persistent profile**              | Dev Chrome opens with the extension loaded and remembers my ChatGPT login between runs.                |
| **Product name "SafeAI"**                                           | Short name shown in the UI. "for Teams" comes later.                                                   |
| **TypeScript strict, no `any`**                                     | The compiler catches mistakes early, and types document the code.                                      |
| **Zod for message shapes**                                          | Each message is checked when it arrives, so bad or unexpected data is rejected safely.                 |

### Notes from checking current docs (2026-11-17)

1. **Persistent profile on Windows:** WXT's docs say that on Windows the profile path must be **absolute**, and they recommend
   `chromiumProfile: resolve('.wxt/chrome-data')` + `keepProfileChanges: true` (instead of `--user-data-dir`). We follow that.
   Per the docs, these settings go in `web-ext.config.ts` (git-ignored, personal) **or** in the `webExt` key of `wxt.config.ts`. Your prompt says to use `wxt.config.ts`, so we put them there and every developer gets the same setup.
2. **Chrome 137+ removed the `--load-extension` flag in normal (branded) Chrome.** Some tools used that flag to auto-load extensions. In M3 I'll check whether WXT's current runner still auto-loads into your Chrome. If not, we use one of two fallbacks, and I'll ask you first:
   - point WXT at **Chrome for Testing** (a dev build of Chrome that still supports auto-loading), or
   - turn off auto-launch and load `apps/extension/.output/chrome-mv3-dev` once using **chrome://extensions → Load unpacked**. Hot reload still works.

   **Result (M3):** auto-loading **works** with WXT 0.21.5 + web-ext 10.8 on your Chrome 157. The dev profile registered the extension from `.output/chrome-mv3-dev`. No fallback needed.

   **Found in M4: turn on Developer mode once.** Chrome 157 doesn't fully run unpacked extensions unless **Developer mode** is on in `chrome://extensions`. Without it, the service worker doesn't start (the popup shows "Background unreachable: Receiving end does not exist") and the extension may be hidden after a reload. Fix: in the dev Chrome window, open `chrome://extensions`, switch on Developer mode, and reload SafeAI. The persistent profile remembers it. The same applies when loading the production build via "Load unpacked".

3. **Google sign-in can be blocked in automated browsers.** If "Continue with Google" says the browser may not be secure, log in to ChatGPT with email + password instead. The login is saved in the persistent profile.
4. Before running any setup in M1 and M3, I'll re-check the current docs for Tailwind v4 (Vite plugin), ESLint flat config and typescript-eslint (`defineConfig` style). I'll tell you about any differences.

### Version pins found during M1 (2026-11-18)

- **ESLint 9 (not 10):** `eslint-plugin-jsx-a11y` 6.10.2 only supports ESLint up to v9. npm marks 9.x as "deprecated" now that v10 is out; we move to v10 when jsx-a11y supports it.
- **TypeScript 6.0 (not 7):** `typescript-eslint` 8.73 supports TypeScript `<6.1`. TypeScript 7 (the new Go-based compiler) is not supported by it yet.
- **ESLint config style:** typescript-eslint now recommends `defineConfig` from `eslint/config` (not `tseslint.config()`). React hooks uses `reactHooks.configs.flat.recommended`, jsx-a11y uses `jsxA11y.flatConfigs.recommended`.
- **Node 24 via fnm:** your PC had Node 22, so we installed **fnm** (a Node version manager). Node 22 and 24 live side by side, and pnpm 12.21.0 is enabled through Corepack.
- **`.prettierrc` is YAML** (not JSON), so it can start with an explanatory comment like every other file. `.nvmrc` has no comment because version tools read its first line as the version.

---

## 3. Features we will build

1. **Workspace foundation:** lint, format, typecheck and build scripts that run across the whole repo.
2. **Design tokens:** one CSS file with all colours, fonts, radius, shadows and motion.
3. **Shared message contracts:** every message between extension parts has a name, a Zod schema and a TypeScript type.
4. **Popup** (360 px wide, polished): status, test-replace toggle, last-intercept card, service-worker lab, version.
5. **Background service worker:** a message router plus the "lifecycle lab" experiment, which shows that the worker forgets variables when it sleeps.
6. **ChatGPT content script:**
   - **Observe mode:** detects Enter/Send, lets the message go and logs metadata only.
   - **Test replace mode:** swaps emails for `[EMAIL_1]`… and then sends.
   - **Safety rule:** if we can't replace the text, we **don't send**.
7. **In-page status badge:** a small pill at the top-right of ChatGPT (just under its top bar), inside a Shadow DOM. _Changed in M5: bottom-right covered ChatGPT's input buttons._
8. **Docs:** README, DECISIONS, LEARNING, phase-1-notes template.

---

## 4. Folder structure

```
safeai/   (this is d:\SafeAI)
├─ package.json            Workspace-wide scripts: dev, build, typecheck, lint, lint:fix, format, format:check
├─ pnpm-workspace.yaml     Lists the package folders: apps/* and packages/*
├─ tsconfig.base.json      Shared strict TypeScript settings
├─ eslint.config.js        ESLint rules for the whole repo (flat config)
├─ .prettierrc             Prettier rules + Tailwind class sorting
├─ .prettierignore         What Prettier skips
├─ .nvmrc                  Node version (24)
├─ .gitignore              node_modules, build output, dev Chrome profile, .env
├─ .vscode/
│  ├─ settings.json        Format on save, ESLint fix on save
│  └─ extensions.json      Recommended VS Code extensions
├─ README.md
├─ docs/
│  ├─ phase-1-plan.md      (this file)
│  ├─ LEARNING.md
│  ├─ DECISIONS.md
│  └─ phase-1-notes.md
├─ packages/
│  ├─ design/
│  │  ├─ package.json
│  │  └─ src/tokens.css
│  └─ shared/
│     ├─ package.json
│     ├─ tsconfig.json
│     └─ src/
│        ├─ index.ts
│        ├─ messages.ts
│        └─ sites.ts
└─ apps/
   └─ extension/
      ├─ package.json
      ├─ tsconfig.json
      ├─ wxt.config.ts
      ├─ public/icon/      16.png 32.png 48.png 128.png
      ├─ entrypoints/
      │  ├─ background.ts
      │  ├─ chatgpt.content/index.tsx
      │  └─ popup/ index.html, main.tsx, App.tsx
      └─ src/
         ├─ adapters/  types.ts, chatgpt.ts
         ├─ content/   interceptor.ts, editor-writer.ts, test-transform.ts
         ├─ background/ router.ts, lifecycle-lab.ts
         ├─ ui/        StatusBadge.tsx
         ├─ lib/       messaging.ts, storage.ts, logger.ts
         └─ styles/    ui.css
```

---

## 5. Every file: purpose and functions

Every file starts with a 2–4 line plain-English comment. Every exported function has a one-line comment.

### Root files

| File                      | Purpose                                                                                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `package.json`            | Root of the workspace. Has scripts that run in every package: `dev`, `build`, `typecheck`, `lint`, `lint:fix`, `format`, `format:check`. Pins Node 24 and pnpm via `engines` / `packageManager`. |
| `pnpm-workspace.yaml`     | Tells pnpm that `apps/*` and `packages/*` are packages.                                                                                                                                          |
| `tsconfig.base.json`      | Strict settings (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, etc.) that each package extends.                                                                                    |
| `eslint.config.js`        | Flat config: recommended JS + typescript-eslint (type-aware) + react-hooks + jsx-a11y + prettier compatibility. Bans `any`. Ignores `.output`, `.wxt`, `node_modules`, the dev profile.          |
| `.prettierrc`             | Formatting rules + `prettier-plugin-tailwindcss`, pointed at our CSS file so it knows our custom classes.                                                                                        |
| `.prettierignore`         | Skips build output, lockfile, `.wxt/`, the dev Chrome profile.                                                                                                                                   |
| `.nvmrc`                  | `24`                                                                                                                                                                                             |
| `.gitignore`              | `node_modules`, `.output`, `.wxt`, dev Chrome profile, `.env*`.                                                                                                                                  |
| `.vscode/settings.json`   | Prettier as default formatter, format on save, ESLint auto-fix on save.                                                                                                                          |
| `.vscode/extensions.json` | Recommends ESLint, Prettier and Tailwind CSS IntelliSense.                                                                                                                                       |
| `README.md`               | Install, run, load and build steps.                                                                                                                                                              |

### packages/design

| File             | Purpose                                                                              |
| ---------------- | ------------------------------------------------------------------------------------ |
| `package.json`   | Names the package `@safeai/design` and exports `tokens.css`.                         |
| `src/tokens.css` | All design tokens inside a Tailwind v4 `@theme` block (see section 6). No functions. |

### packages/shared

| File              | Purpose / functions                                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `package.json`    | Names the package `@safeai/shared`. Depends on `zod`.                                                                                                                                            |
| `tsconfig.json`   | Extends the base config.                                                                                                                                                                         |
| `src/index.ts`    | Re-exports everything from `messages.ts` and `sites.ts`.                                                                                                                                         |
| `src/messages.ts` | Message names, Zod schemas and inferred types. See below.                                                                                                                                        |
| `src/sites.ts`    | `SITE_IDS` (`["chatgpt"]`), `SiteId` type, `SUPPORTED_SITES`: `[{ id: "chatgpt", name: "ChatGPT", matches: ["https://chatgpt.com/*"] }]`, and `getSiteName(id)`, which returns the display name. |

**messages.ts contents** (as built in M2)

- `PingRequest` `{ type: "PING" }` → `PingReply` `{ memoryCount, storageCount, workerStartedAt }`
- `GetStatusRequest` `{ type: "GET_STATUS" }` → `GetStatusReply` `{ lastIntercept: InterceptRecord | null, workerStartedAt }`
- `LogInterceptRequest` `{ type: "LOG_INTERCEPT", payload: InterceptRecord }` → `LogInterceptReply` `{ ok: true }`
- `ContentPingRequest` `{ type: "CONTENT_PING" }` (popup → content script) → `ContentPingReply` `{ site }`. Approved in M0.
- `InterceptRecord` = `{ site, at, charCount, mode: "observe" | "replace", replacedCount, method: "insertText" | "paste" | "none", success }`. **Metadata only, never text.**
- `ErrorReply` `{ ok: false, error: string }`
- `BackgroundRequestSchema`: one Zod "discriminated union" of every request the background accepts, told apart by its `type` field.
- `REPLY_SCHEMAS` maps each request type to its reply schema, and `ReplyFor<T>` gives the reply type (e.g. `ReplyFor<'PING'>`).
- All schemas use `z.strictObject`, so **unknown fields are rejected**. If someone accidentally adds a `text` field to a message, validation fails. This is a safety net for the privacy rule.
- Types for all of the above, inferred with `z.infer`.

### apps/extension: config

| File                | Purpose                                                                                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`      | Extension package. Scripts: `dev`, `build`, `zip`, `typecheck`, `postinstall: wxt prepare`.                                                                                                              |
| `tsconfig.json`     | Extends WXT's generated config + our strict base.                                                                                                                                                        |
| `wxt.config.ts`     | Name "SafeAI", permissions `["storage"]` only, React module, Tailwind Vite plugin, `webExt` settings for the persistent Chrome profile (absolute path on Windows), opens `https://chatgpt.com` on start. |
| `public/icon/*.png` | Placeholder teal shield icons (16/32/48/128). Generated once with a small throwaway Node script (no extra packages).                                                                                     |

### apps/extension: entrypoints

**`entrypoints/background.ts`** (service worker)

- `defineBackground(() => { … })`: registers `browser.runtime.onMessage` **at the top level, synchronously**. A comment explains why: Chrome may start a sleeping worker only to deliver one message, and listeners added later (after an `await`) would miss it.
- The listener replies using `sendResponse` + `return true` ("I'll answer later"). This is the classic Chrome pattern, and it works in every Chrome version, unlike returning a Promise from the listener.
- `onInstalled` (reason `install`): writes default settings `{ testReplaceMode: false }`.

**`entrypoints/chatgpt.content/index.tsx`** (content script)

- `matches: ["https://chatgpt.com/*"]`, `cssInjectionMode: "ui"`.
- `main(ctx)`: mounts `StatusBadge` with `createShadowRootUi`, reads `settings.testReplaceMode` and **watches** it, starts the interceptor, and runs `checkSelectors()` (shown on the badge in dev builds).
- `handleAttempt(trigger)`: the main flow:
  - **Observe (toggle OFF):** the interceptor did not block. Count characters and send `LOG_INTERCEPT` with `mode: "observe"`, `method: "none"`, `success: true`.
  - **Replace (toggle ON):**
    1. Read text, then `transformForTest(text)`.
    2. `count === 0` → `allowNextSubmit()` → click send.
    3. `count > 0` → `replaceComposerText()`. On success → `allowNextSubmit()` → click send → badge "Replaced N emails" → `LOG_INTERCEPT`.
    4. Replace failed → **don't send**. Badge error: "Couldn't protect this message — not sent". `LOG_INTERCEPT` with `success: false`.
- `ctx.onInvalidated` → `stopInterceptor()` and removes the message listener (cleans up when the extension reloads).
- **As built (M5 + M6):**
  - answers the popup's `CONTENT_PING` with `{ site: "chatgpt" }`;
  - skips empty messages (Enter in an empty box doesn't send);
  - `reportSelectors()` (dev only) waits up to 15 s for ChatGPT's input box to appear, because it's a single-page app, then shows `dev · input ✓ · send –` under the badge. The send button only exists once you type, so `–` there is normal at first.
  - reads `settings.testReplaceMode` at start and **watches** it. A local `mode` variable is what the interceptor's `getMode()` reads, so flipping the popup toggle takes effect immediately. The badge switches between "Observing" and "Test replace ON" at the same moment.
  - `createSendFlow(adapter, badge)` holds the flow:
    - `observe()`: records metadata only.
    - `replaceAndSend()`: the replace steps above. A `busy` flag makes one replace run at a time; extra Enter presses during a replace are blocked and ignored.
    - `resend()`: waits 50 ms so ChatGPT notices the new text, calls `allowNextSubmit()`, then clicks ChatGPT's send button. If the button is missing or disabled, or the click didn't send, it falls back to a synthetic Enter in the editor.
    - **Send confirmation:** ChatGPT empties the input box after sending, so `waitForEmptyComposer()` waits up to 1.5 s for that. No empty box means "not sent".
  - Badge messages: success "Replaced N email(s)". Errors: "Couldn't protect this message — not sent" (replace failed), "Protected, but not sent — please press Send" (the protected text is in the box but the re-send failed, so nothing leaks), "Couldn't find ChatGPT's input box — not sent".
  - `logIntercept(fields)`: one helper that sends the `LOG_INTERCEPT` metadata. `charCount` is the **original** text's length.

**`entrypoints/popup/index.html`**: page shell, loads `main.tsx`.
**`entrypoints/popup/main.tsx`**: imports the Geist fonts (`@fontsource-variable/geist`, `geist-mono`) and `ui.css`, then mounts `<App />` in `#root`.
**`entrypoints/popup/App.tsx`**: the popup screen (see section 6). Internal components: `ShieldIcon` (inline SVG logo), `Header`, `StatusCard`, `TestModeToggle`, `LastInterceptCard`, `WorkerLabCard`, `Footer`, plus building blocks `Card` (white section with a title) and `Stat` (small labelled number). Helpers: `timeAgo(timestamp, now)`, `useNow()` (re-renders every second so "12s ago" keeps counting) and `useLastIntercept()` (loads via `GET_STATUS`, then live-updates by watching storage and re-validating with Zod). All built as of M6 (order on screen: Header, StatusCard, TestModeToggle, LastInterceptCard, WorkerLabCard, Footer).

### apps/extension/src

**`adapters/types.ts`**: `interface SiteAdapter` exactly as specified:
`id`, `getComposer()`, `isInsideComposer(el)`, `getSendButton()`, `isSendButton(el)`, `readText(composer)`, `checkSelectors()`.

**`adapters/chatgpt.ts`**

- `SELECTORS` object at the top, each entry a list of fallbacks (tried in order). **These are guesses that may change:**
  - composer: `#prompt-textarea`, `div.ProseMirror[contenteditable="true"]`, `form div[contenteditable="true"]`, `textarea[name="prompt-textarea"]`
  - sendButton: `[data-testid="send-button"]`, `#composer-submit-button`, `button[aria-label="Send prompt"]`, `form button[type="submit"]`
- `findFirst(selectors)`: returns the first element that matches.
- `chatgptAdapter: SiteAdapter`:
  - `isSendButton` uses `el.closest(...)` so clicking the icon inside the button still counts.
  - `readText` uses `innerText` (keeps line breaks between paragraphs).
  - `checkSelectors` reports which selectors were found and logs a dev message if one is missing.

**`content/interceptor.ts`**

- `startInterceptor(adapter, getMode, onAttempt)`: adds `keydown`, `click` and `submit` listeners on `document` in the **capture phase**.
  - keydown: `Enter` without Shift, `!event.isComposing`, target inside the composer.
  - click: target is (or is inside) the send button.
  - submit: the form that contains the composer.
  - If the bypass flag is set → let the event through untouched, and clear the flag right after the current task, so the click → submit events of the _same_ re-send all pass.
  - **Observe mode:** don't block, just call `onAttempt(trigger, mode)`.
  - **Replace mode:** `preventDefault()` + `stopImmediatePropagation()`, then call `onAttempt(trigger, mode)`.
  - One send can fire several events (Enter, then a form submit). Events within **300 ms** count as one attempt.
  - Enter with Shift, Ctrl, Alt or Meta held is ignored (Shift+Enter = new line).
- `allowNextSubmit()`: sets the one-time bypass flag (auto-clears after ~1 s as a safety net).
- `stopInterceptor()`: removes all listeners.
- _Small change from the prompt:_ `startInterceptor` also takes `getMode()` so it knows, at the moment of the event, whether to block. That's how observe mode doesn't block.

**`content/editor-writer.ts`**

- `replaceComposerText(composer, newText)` → `Promise<{ success, method }>`
  - Strategy 1: focus, select all, `document.execCommand("insertText", false, newText)`, read back and compare.
  - Strategy 2: select all, dispatch a synthetic `paste` event with a `DataTransfer` containing the text, read back and compare.
  - Neither works → `{ success: false, method: "none" }`.
- Comments explain why `.textContent =` doesn't work: ProseMirror keeps its own copy of the document in JavaScript memory and only updates it when it sees real editing events. Changing the DOM directly is ignored or undone, and ChatGPT would send the old text.
- Comparison ignores whitespace differences (ProseMirror can add/trim line breaks).
- **As built (M6):** waits 30 ms after each strategy before reading back, so the editor can redraw. Also handles a plain `<textarea>` (older ChatGPT) via `.select()`. Helpers: `selectAllInside()` (like Ctrl+A inside the box), `textMatches()`, `normalize()`.
- I couldn't test it on a real ProseMirror editor outside ChatGPT here (loading ProseMirror from a CDN was blocked in my environment). The read-back check means a failure can never leak text: it shows the red "not sent" badge instead. Question 2 in `phase-1-notes.md` records which method worked for you.

**`content/test-transform.ts`**

- `transformForTest(text)` → `{ text, count }`: replaces emails with `[EMAIL_1]`, `[EMAIL_2]`…; the same email (ignoring upper/lower case) keeps the same number. `count` = number of **distinct** emails. Marked: _"Phase 1 test only. The real detection engine arrives in Phase 2."_

**`background/router.ts`**

- `handleMessage(message, sender)` → `Promise<reply>`: validates with Zod, then:
  - `PING` → `bumpCounters()` → `{ memoryCount, storageCount, workerStartedAt }`
  - `GET_STATUS` → `{ lastIntercept, workerStartedAt }`
  - `LOG_INTERCEPT` → saves `lastIntercept` (metadata only) → `{ ok: true }`
  - invalid → `{ ok: false, error }`. Never throws. The error lists only field names and problems, never values (values could contain text).
  - Messages whose `sender.id` isn't our own extension are refused.
  - Exports the `BackgroundReply` type (all possible replies).

**`background/lifecycle-lab.ts`**

- `workerStartedAt = Date.now()` when the file loads.
- `memoryCount` (plain variable, wiped when the worker sleeps).
- `bumpCounters()`: increments `memoryCount` and the stored `storageCount`, returns both.
- Comment explaining the lesson in simple words.

**`ui/StatusBadge.tsx`**

- `StatusBadge({ store })`: pill fixed **top-right, 64 px from the top** (`top-16 right-4`, just under ChatGPT's top bar), `z-index: 2147483647`. It was bottom-right at first, but that covered ChatGPT's "Think" and send buttons. The badge is **click-through** (`pointer-events-none`), so it can never block a ChatGPT button. Only the error badge turns clicks back on so it can be dismissed. The dev line sits under the pill. States: `observing`, `replaceOn`, `success` (message, returns to the resting state after 4 s), `error` (a real button with `role="alert"` on its wrapper; stays until clicked), plus a dev-only line for the selector check. New content fades in over 200 ms (`starting:opacity-0`), with no motion if reduced motion is preferred.
- `createBadgeStore()` returns a small controller: `setMode`, `showSuccess`, `showError`, `setDevInfo`, `dismiss`, plus `getView`/`subscribe` for React's `useSyncExternalStore`.
- Shadows use `[box-shadow:var(--shadow-lg)]`, not `shadow-lg` (see `ui.css` below for why).
- System font stack (custom fonts inside Shadow DOM come in Phase 3).

**`lib/messaging.ts`**

- `sendToBackground(message)`: **checks the outgoing message with Zod first** (so a message with an extra `text` field is never sent), sends it with `browser.runtime.sendMessage`, validates the reply with the matching schema, and returns `{ ok: true, data }` or `{ ok: false, error }` with a clear message.
- `Result<T>` type: "either data or an error".
- `pingContentScript(tabId)`: sends `CONTENT_PING` to a tab with `browser.tabs.sendMessage` (no permission needed). It fails when the tab has no SafeAI content script.

**`lib/storage.ts`** (WXT `storage.defineItem`)

- `settingsItem`: `local:settings`, fallback `{ testReplaceMode: false }`
- `storageCountItem`: `local:storageCount`, fallback `0`
- `lastInterceptItem`: `local:lastIntercept`, fallback `null`

**`lib/logger.ts`**

- `devLog(...args)`: logs only when `import.meta.env.DEV`.
- `devLogText(label, text)`: the **only** function allowed to print prompt text. Dev builds only, with a warning comment. In production builds, `import.meta.env.DEV` becomes `false`, so the bundler deletes these calls. We confirm this at the end by searching the production bundle.

**`styles/ui.css`**

- `@import "tailwindcss";` + `@import "@safeai/design/tokens.css";`. Used by both the popup and the badge. No `@source` line is needed: Tailwind finds our classes automatically in `apps/extension`, and the shared packages contain no classes. Fonts are **not** loaded here. The popup's `main.tsx` imports Geist, and the badge uses system fonts.
- **Shadow DOM fix (found in M5):** Tailwind gives its internal `--tw-*` variables starting values via `@property`, and Chrome ignores `@property` inside a Shadow DOM. Without a fix, `border` drew no border on the badge. `ui.css` sets those starting values by hand in `@layer base`. This was verified on chatgpt.com: the badge's computed border is `solid`.

---

## 6. Popup design and design tokens

### Popup layout (360 px wide)

```
┌──────────────────────────────────────┐
│ 🛡 SafeAI               [Phase 1·Dev]│  Header
├──────────────────────────────────────┤
│ ● Active on ChatGPT                  │  Status card (green / grey dot)
├──────────────────────────────────────┤
│ Test replace mode            [  ◯━ ] │  Toggle (role="switch")
│ Replaces emails with [EMAIL_1]       │
│ before sending                       │
├──────────────────────────────────────┤
│ Last intercept                       │
│ ChatGPT · 12s ago        ✓ Success   │
│ Characters 24 · Emails 1 · insertText│
│ (empty: "No messages yet")           │
├──────────────────────────────────────┤
│ Service worker lab     [Ping worker] │
│ Memory 3 · Storage 7                 │
│ Worker started 18s ago               │
│ Wait ~40s without clicking, then     │
│ ping again — memory resets, storage  │
│ doesn't.                             │
├──────────────────────────────────────┤
│ v0.1.0                               │  Footer
└──────────────────────────────────────┘
```

- Every colour, radius and shadow comes from the tokens. Hover, visible `focus-visible` ring (primary-600), disabled state on the Ping button while it's waiting.
- `motion-reduce:` variants turn off transitions when the user prefers reduced motion.
- The toggle is a real `<button role="switch" aria-checked>` with a label, so it's keyboard-accessible. **Built in M6** as `TestModeToggle`. It reads and watches `settingsItem`, and is disabled while loading.

**Status card (approved in M0, built in M5)**
Without the `tabs` permission, Chrome hides `tab.url` from the popup. My plan uses no extra permission: the popup sends a tiny "are you there?" message to the content script on the current tab (`browser.tabs.sendMessage`). If it answers → "Active on ChatGPT"; if not → "Open chatgpt.com to start". This adds **one message type, `CONTENT_PING`**, with no text in it. The alternative is static text.

### Design tokens (`packages/design/src/tokens.css`, Tailwind v4 `@theme`)

- **Primary:** 50 #ECFBF9, 100 #CFF4EF, 200 #A1E8E0, 300 #67D4CB, 400 #2FB8B0, 500 #149C96, 600 #0C7F7B (main), 700 #0A6663, 800 #0B514F, 900 #0C4341, 950 #042827
- **Neutral:** 0 #FFFFFF, 25 #FBFCFD, 50 #F6F8FA, 100 #EEF1F4, 200 #DFE4EA, 300 #C5CDD6, 400 #9AA5B3, 500 #6B7686, 600 #4E5868, 700 #3A4352, 800 #262D3A, 900 #171C26 (text), 950 #0D1118
- **Status:** success #15803D / #ECFDF3 · warning #B45309 / #FFF7E6 · danger #B42318 / #FEF3F2 · info #1D4ED8 / #EFF4FF
- **Category:** personal #6D28D9 / #F3EEFF · secrets #B42318 / #FEF3F2 · financial #B45309 / #FFF7E6 · business #1D4ED8 / #EFF4FF
- **Radius:** sm 6px, md 8px, lg 12px, xl 16px
- **Shadows:** sm, md, lg as specified
- **Fonts:** sans "Geist Variable"/"Geist" + system fallbacks · mono "Geist Mono Variable"/"Geist Mono" + ui-monospace fallbacks · `--font-system` (system fonts only, for the in-page badge)
- **Font sizes:** xs 12/16, sm 13/20, base 14/20, md 16/24, lg 18/28, xl 20/28, 2xl 24/32
- **Spacing:** `--spacing: 4px` (so `p-4` = 16px)
- **Motion:** `--duration-fast: 150ms` (hover), `--duration-base: 200ms` (show/hide), `--ease-out`

Token names follow Tailwind v4 naming so the classes are created automatically, e.g. `--color-primary-600` → `bg-primary-600`, `--radius-lg` → `rounded-lg`, `--shadow-md` → `shadow-md`, `--text-sm` → `text-sm`.

**Built in M2:**

- Status and category colours are named `--color-success` (strong colour, for text/icons) and `--color-success-subtle` (light background). So `text-success bg-success-subtle`.
- `--color-*: initial` removes Tailwind's built-in palette, so **only our colours exist**. A class like `bg-red-500` simply won't work, which keeps everyone on the design system.
- All sizes are in **px, not rem**. The badge runs inside chatgpt.com, where `rem` follows ChatGPT's own root font size and could make our badge bigger or smaller.

---

## 7. Privacy rules

1. Extension messages **never** contain prompt text, only metadata (site, character count, replacement count, method, time, success).
2. Prompt text is **never stored** anywhere.
3. Prompt text may be logged **only** through `devLogText`, which is removed from production builds.
4. The content script **never** uses `localStorage`, `sessionStorage` or IndexedDB (they belong to chatgpt.com, which can read them). Only `chrome.storage` via WXT's storage helper.
5. Permissions: **only `"storage"`**. The content script runs only on `https://chatgpt.com/*`.
6. Final check: search the production build for `devLogText` / prompt-logging code and confirm it's gone.

---

## 8. Milestones and what you test after each

| #      | What gets built                                                                                                                            | What you test                                                                                                                                                                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M0** | This plan                                                                                                                                  | Read it, answer the questions below, approve.                                                                                                                                                                                     |
| **M1** | Root files, workspace, tsconfig, ESLint, Prettier, .vscode, .gitignore, .nvmrc, docs folder, `git init`, first commit                      | `pnpm install`, then `pnpm lint` and `pnpm format:check` both finish with no errors.                                                                                                                                              |
| **M2** | `packages/design` (tokens) + `packages/shared` (messages, sites, index)                                                                    | `pnpm typecheck` passes. `pnpm lint` passes.                                                                                                                                                                                      |
| **M3** | WXT + React + Tailwind in `apps/extension`, tokens wired in, persistent profile, icons, popup with header only                             | `pnpm dev` opens Chrome with SafeAI loaded. The popup shows the teal shield + "SafeAI" + "Phase 1 · Dev". Close Chrome, run again, and your ChatGPT login is still there.                                                         |
| **M4** | background, router, lifecycle-lab, messaging, storage, logger + popup lab card                                                             | Click "Ping worker" and the counts go up. Wait ~40 s, ping again: memory goes back to 1, storage keeps counting, "worker started" resets.                                                                                         |
| **M5** | Adapter, interceptor, StatusBadge, content script (observe mode), popup status + last-intercept cards                                      | On chatgpt.com the badge says "SafeAI · Observing". Press Enter and the message sends normally. Popup shows the last intercept (ChatGPT, char count, "observe"). Shift+Enter still makes a new line. Switching chats still works. |
| **M6** | test-transform, editor-writer, replace flow, "don't send if not protected" rule                                                            | Toggle ON, badge says "Test replace ON". Type `email me at ali@test.com` + Enter, and ChatGPT shows `email me at [EMAIL_1]`. Badge: "Replaced 1 email". Popup shows method + success. Text with no email sends normally.          |
| **M7** | README, DECISIONS, LEARNING, phase-1-notes template, plan synced; typecheck + lint + format:check + production build; prompt-logging check | Read the docs, then run `pnpm build` and load `.output/chrome-mv3` via Load unpacked. It works the same, with no dev logs in the console.                                                                                         |

After each milestone: list of changed files + what to test, then wait for "continue".

**Git:** one short commit per milestone (e.g. `M3: extension scaffold`), pushed to `https://github.com/Zee-Gg/SafeAI` (branch `main`). M1's commit is named `Phase 1: workspace setup`.

---

## 9. Risk questions for `docs/phase-1-notes.md`

1. While typing/pasting (before pressing Send), does ChatGPT send any network requests containing my text? (DevTools → Network)
2. Which replace method worked: `insertText` or `paste`?
3. Were the selectors found? If not, what were the correct ones?
4. Does Shift+Enter still create a new line without being intercepted?
5. How long did it take for the service worker to go to sleep?
6. Did anything break when switching between chats?

---

## 10. Packages we will install (please approve)

Your prompt lists the tools; these are the exact npm packages they need:

- **Root (dev):** `typescript`, `eslint`, `@eslint/js`, `typescript-eslint`, `globals`, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`, `eslint-config-prettier`, `prettier`, `prettier-plugin-tailwindcss`
- **packages/shared:** `zod`
- **apps/extension:** `wxt`, `@wxt-dev/module-react`, `react`, `react-dom`, `@types/react`, `@types/react-dom`, `tailwindcss`, `@tailwindcss/vite`
- **Added in M3 (approved):** `vite` (WXT 0.21 no longer bundles it; it's a required peer) and `web-ext` (WXT 0.21 only auto-opens the dev browser when it's installed). We got Vite 8, which uses the Rolldown bundler.
- **Font (asking as requested):** `@fontsource-variable/geist` + `@fontsource-variable/geist-mono`. These are local font files we import in CSS, so no CDN. (Alternative: Vercel's `geist` package, which is built mainly for Next.js.)

`globals` is a small helper that tells ESLint about browser variables like `window`. It's the standard part of a flat config.

---

## 11. Questions for you before I start

1. **Status card:** OK to add the `CONTENT_PING` message (no new permission) so the popup can show "Active on ChatGPT"? Or keep static text?
2. **Font package:** OK to install `@fontsource-variable/geist` and `@fontsource-variable/geist-mono` (in M3)?
3. **Package list** in section 10: approved?
4. **`getMode()` parameter** on `startInterceptor` (section 5): OK?
