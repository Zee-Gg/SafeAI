<!--
  How to install, run, build and load the SafeAI extension.
  Start here if you are new to the repo. Details of every decision live in docs/.
-->

# SafeAI for Teams

A Chrome extension (Manifest V3) that protects sensitive data in prompts sent to AI chat tools.

**Phase 1:** ChatGPT only. It proved the riskiest idea works: SafeAI can stop a ChatGPT message
before it is sent, change its text, and send the changed version.

**Phase 2 (current):** a real **detection engine** (`packages/detection`) finds emails, phones,
cards, bank accounts, national IDs, API keys, passwords, tokens in URLs, random-looking secrets,
custom terms, names and addresses. With "Test replace mode" on, ChatGPT receives placeholders
such as `[EMAIL_1]` and `[API_KEY_1]` instead. A dev-only **Detection Playground** lets you paste
text and see every detection highlighted.

- Plans (match the code): [docs/phase-1-plan.md](docs/phase-1-plan.md),
  [docs/phase-2-plan.md](docs/phase-2-plan.md)
- Why we chose each tool: [docs/DECISIONS.md](docs/DECISIONS.md)
- Plain-English lessons: [docs/LEARNING.md](docs/LEARNING.md)
- Testing notes to fill in: [docs/phase-1-notes.md](docs/phase-1-notes.md),
  [docs/phase-2-notes.md](docs/phase-2-notes.md)

---

## 1. One-time setup

You need **Node 24**, **pnpm** and **Google Chrome**.

1. **Node 24 via fnm** (fnm lets several Node versions live side by side):
   ```powershell
   winget install --id Schniz.fnm -e --source winget
   ```
   Add fnm to PowerShell (creates your profile file if it doesn't exist), then restart VS Code:
   ```powershell
   New-Item -ItemType Directory -Force (Split-Path $PROFILE) | Out-Null
   if (-not (Test-Path $PROFILE)) { New-Item -ItemType File $PROFILE | Out-Null }
   Add-Content $PROFILE "`nfnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression"
   ```
   In a new terminal inside this folder: `fnm install 24` then `fnm use 24`.
   `node --version` should print `v24.x`.
2. **pnpm** (comes with Node through Corepack):
   ```powershell
   corepack enable pnpm
   ```
3. **Install the project's packages** (from the repo root):
   ```powershell
   pnpm install
   ```

---

## 2. Run it in development

```powershell
pnpm dev
```

- WXT builds the extension and opens a **separate Chrome window** on chatgpt.com with SafeAI
  loaded. That window uses its own profile in `apps/extension/.wxt/chrome-data`, so your
  ChatGPT login is remembered between runs. (That folder is git-ignored. Never commit it.)
- Code changes reload automatically.
- Stop with `Ctrl + C` in the terminal.

**First run only — two things to do in that Chrome window:**

1. **Turn on Developer mode.** Open `chrome://extensions` and switch on **Developer mode**
   (top-right). Recent Chrome versions don't run unpacked extensions without it. The symptom
   is "Background unreachable: Receiving end does not exist" in the popup. Then click the
   reload ↻ icon on the SafeAI card.
2. **Pin the icon.** Click the puzzle icon 🧩 in the toolbar, then the pin 📌 next to SafeAI.

If "Continue with Google" is blocked on the ChatGPT login page, log in with email + password.

---

## 3. Try it

1. On chatgpt.com, a pill at the top-right says **"SafeAI · Observing"**.
2. Click the SafeAI shield. The popup says **"Active on ChatGPT"**.
3. Switch on **Test replace mode**. The pill changes to **"SafeAI · Test replace ON"**.
4. Type `email me at ali@test.com` and press Enter. ChatGPT receives `email me at [EMAIL_1]`,
   and the pill briefly says **"Replaced 1 email"**.
5. The popup's **Last intercept** card shows what happened (metadata only, never your text).

If SafeAI can't safely change the text, it **does not send** the message and shows a red pill.

---

## 4. Build for production

```powershell
pnpm build
```

The finished extension is in `apps/extension/.output/chrome-mv3`. To load it in any Chrome:

1. Open `chrome://extensions` and switch on **Developer mode**.
2. Click **Load unpacked** and pick the `apps/extension/.output/chrome-mv3` folder.
3. After rebuilding, click the reload ↻ icon on the SafeAI card. Chrome doesn't reload it by
   itself.

Production builds contain no debug logging. Their only permission is `storage`.

---

## 5. All scripts (run from the repo root)

| Command             | What it does                                                   |
| ------------------- | -------------------------------------------------------------- |
| `pnpm dev`          | Builds in dev mode and opens Chrome with SafeAI loaded.        |
| `pnpm build`        | Production build into `apps/extension/.output/chrome-mv3`.     |
| `pnpm typecheck`    | Checks TypeScript types in every package.                      |
| `pnpm lint`         | Checks code with ESLint (bugs, React hooks, accessibility).    |
| `pnpm lint:fix`     | Same, and fixes what it can automatically.                     |
| `pnpm format`       | Formats every file with Prettier (and sorts Tailwind classes). |
| `pnpm format:check` | Checks formatting without changing anything.                   |
| `pnpm test`         | Runs the detection engine's tests once, with coverage (≥ 90%). |
| `pnpm test:watch`   | Re-runs the engine's tests on every save (no coverage).        |

**Detection Playground (dev only):** run `pnpm dev`, open the SafeAI popup, and click
**"Open Detection Playground ↗"** in its footer. It isn't included in production builds.

---

## 6. Project layout

```
apps/extension/        The Chrome extension (WXT + React + Tailwind v4)
  entrypoints/         background.ts, chatgpt.content/, popup/, playground/ (dev only)
  src/                 adapters/, content/, background/, ui/, lib/, styles/
packages/detection/    The detection engine: detect(text, policy) — pure, no DOM/network/logging
packages/design/       Design tokens (one CSS file)
packages/shared/       Message schemas, categories and policy (Zod), supported sites
docs/                  Plan, decisions, learning notes, testing notes
```

---

## 7. Troubleshooting

| Problem                                                       | Fix                                                                                                                                                               |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node --version` shows v22, or `pnpm` is "not recognized"     | Finish step 1 (the fnm profile line), restart VS Code completely, then run `fnm use 24`.                                                                          |
| Popup: "Background unreachable: Receiving end does not exist" | Turn on Developer mode in `chrome://extensions`, then reload SafeAI.                                                                                              |
| The pill's dev line says `input ✗ not found`                  | ChatGPT changed its page. Update `SELECTORS` in `apps/extension/src/adapters/chatgpt.ts` (right-click the input box → Inspect to find its `id` or `data-testid`). |
| Red pill: "Couldn't protect this message — not sent"          | The text change didn't take effect, so SafeAI refused to send. Check the Console (F12) for `[SafeAI]` lines (dev builds only).                                    |
| The SafeAI icon disappeared                                   | Make sure you are in the window `pnpm dev` opened, Developer mode is on, and the icon is pinned (puzzle icon 🧩).                                                 |
