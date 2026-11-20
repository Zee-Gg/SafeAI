<!--
  Phase 3 plan for SafeAI for Teams: the real review-and-protect flow on ChatGPT.
  This is the single source of truth for what Phase 3 builds. If the code changes, this file changes too.
-->

# SafeAI — Phase 3 Plan

> Status: **Approved** (2026-11-20, answers recorded in section 10). Work in progress.
> Last updated: 2026-11-20

---

## 1. Goal and "done when"

**Goal:** turn Phase 2's "test replace mode" into the real protection flow on ChatGPT:

> press Enter → SafeAI scans → a **review panel** shows what it found → you can untick, add or
> remove items → **"Protect and Send"** replaces the chosen values with **stable placeholders**
> and sends.

**Phase 3 is done when:**

1. **Protection is ON by default.** A message with sensitive data opens the review panel; a
   clean message sends instantly with no panel.
2. In the panel you can: see every detection, untick allowed items, add your own item by
   selecting text, remove blocked items, cancel, and Protect and Send.
3. ChatGPT receives **only placeholders**, and the same value keeps the same placeholder for the
   whole conversation, including a brand-new chat after it gets its ID.
4. The panel looks polished in both light and dark ChatGPT themes and works fully with the
   keyboard.

**Not in this phase:** restoring real values in ChatGPT's replies (Phase 4), encrypted long-term
mapping storage (Phase 4), Claude/Gemini (Phase 5), login/server/audit (Phases 6–7), override
reason codes (Phase 7). **ChatGPT's reply and your own sent message will still show
placeholders. That is expected.**

**How we work:** I write the code; I don't write new automated tests (your Phase 3 rule) and I
don't run tests or checks (your answer 6): **you run every test and check**. After every
milestone I give you complete, numbered steps with the exact commands and expected results.

---

## 2. Decisions (with a one-line reason each)

Everything from Phases 1 and 2 still applies (pnpm workspaces, strict TypeScript with no `any`,
ESLint + Prettier, Tailwind v4 tokens, WXT, the pure detection engine).

| Decision                                                                 | Reason                                                                                                    |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| **Review panel = modal in a Shadow DOM**                                 | It dims ChatGPT and blocks typing, so nothing is sent by accident; Shadow DOM keeps both designs separate |
| **Mappings only in the service worker (`chrome.storage.session`)**       | Memory-only and wiped when the browser closes; content scripts can't read it directly by default          |
| **Mapping store behind a small interface**                               | Phase 4 swaps in an encrypted, longer-lived store without touching the rest                               |
| **Placeholders `[LABEL_n]`, numbered per label per conversation**        | The AI sees consistent, readable stand-ins; the same value → the same placeholder                         |
| **Placeholder hint once per conversation**                               | Tells the AI to keep placeholders intact, without repeating it every message                              |
| **Fonts injected into the page head, files exposed only to chatgpt.com** | Fonts declared inside a Shadow DOM don't load in Chrome; other sites can't see our files                  |
| **Panel follows ChatGPT's light/dark theme**                             | It must feel native in both                                                                               |
| **No new automated tests**                                               | Your Phase 3 rule: you test by hand; existing tests keep passing                                          |

### What the current WXT docs said (checked 2026-11-20)

| Topic                       | Docs                                                                                                                            | Effect                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| SPA URL changes             | Built-in **`wxt:locationchange`** event: `ctx.addEventListener(window, 'wxt:locationchange', ({ newUrl }) => …)`                | **Used instead of** our own 500 ms URL check (your rule: follow the docs)                          |
| `createShadowRootUi`        | Options include `position: 'modal'`, `zIndex`, `isolateEvents` (stops key events leaving the shadow root), `onMount`/`onRemove` | Panel uses `modal` + max `zIndex` + `isolateEvents: true`                                          |
| Fonts in Shadow DOM         | "@font-face definitions outside the shadow root can be used inside it"                                                          | Confirms the decision: inject `@font-face` into the page `<head>`                                  |
| `rem` units                 | "not fully isolated"; they follow the page's font size                                                                          | We keep using **px** tokens (Phase 1 decision)                                                     |
| `public/` + content scripts | `public/` files are copied as-is; content scripts can only use them if listed in `web_accessible_resources`                     | `public/fonts/*.woff2`, listed for `https://chatgpt.com/*` only; URLs via `browser.runtime.getURL` |
| Storage areas               | `local:`, `session:`, `sync:`, `managed:`                                                                                       | Mapping store uses `session:` keys from the service worker                                         |

---

## 3. The full user flow (numbered)

**Protection ON (the default):**

1. You type a message in ChatGPT and press **Enter** (or click Send).
2. SafeAI blocks that send before ChatGPT sees it (Phase 1 interceptor).
3. SafeAI runs `detect(text, getActivePolicy())`.
4. **Scan not complete** → the panel opens in its **"Too long to check safely"** state, with only
   "Edit message" and "Cancel". Nothing is sent.
5. **No detections** → the message is sent immediately, unchanged. No panel. (Log: `sent_clean`.)
6. **Detections found** → SafeAI loads this conversation's placeholder memory from the service
   worker and opens the **review panel**.
7. In the panel you can:
   - untick allowed items, or tick "Suggested" (warn) items;
   - select text in "Your message" → **Protect this** → pick a category, which adds it (and every
     other place the same text appears);
   - press **Remove from message** on a blocked item: that value is deleted from the message and
     the message is scanned again;
   - switch the preview between **"Your message"** and **"What ChatGPT will see"**.
8. **Cancel** (or Esc, or ×) → the panel closes, focus returns to ChatGPT's input, and the text is
   unchanged. (Log: `cancelled`.)
9. **Edit message** → like Cancel, but the badge says "Edit your message, then press Enter
   again". (Log: `cancelled`.)
10. **Protect and Send** (or Ctrl/Cmd+Enter):
    1. `buildRedaction` turns the ticked items into placeholders (reusing ones this conversation
       already has) and adds the one-time hint line if needed;
    2. the protected text is written into ChatGPT's input and **read back to verify**;
    3. our own re-send is allowed once (`allowNextSubmit`) and Send is clicked;
    4. the new placeholder entries and the hint status are saved in the service worker;
    5. if this was a brand-new chat, its memory is re-keyed once ChatGPT gives it an ID;
    6. the badge shows "Protected 3 items" (Log: `protected`).
11. If writing or verifying fails → **not sent**, with an error badge. (Log: `write_failed`.)

**Protection OFF ("Paused"):** messages send unchanged; the badge says "SafeAI · Paused". (Log:
`paused`.)

---

## 4. Features

### 4.1 Protection toggle (replaces "Test replace mode")

- `settings.protectionEnabled` (default **true**) replaces `settings.testReplaceMode`.
- **Migration** on install/update: the old setting is removed and `protectionEnabled` becomes
  `true` (protection is on by default; Phase 2's test switch meant something different). See
  question 4 in section 10.
- OFF = observe only: messages send unchanged; the badge says "SafeAI · Paused".
- Popup: a clear **Protection** switch (On / Paused) at the top, with helper text.

### 4.2 Active policy

- `getActivePolicy()` returns `DEFAULT_POLICY`. **Dev builds only:** if a `devPolicyOverride`
  is stored, that is used instead. In production builds the override code is removed entirely
  (`import.meta.env.DEV`).
- Playground (dev): **"Use these settings in ChatGPT (dev)"** saves the current Playground
  policy (actions, custom terms, ID countries, phone country) as `devPolicyOverride`; **"Clear
  override"** removes it.
- Policy schema: new field **`placeholderHint: boolean`** (default `true`).

### 4.3 Conversation tracking

- Key = `chatgpt:<id>` from the URL (`/c/<id>`, also inside project URLs such as
  `/g/<project>/c/<id>`). A new chat with no id yet = `chatgpt:new:<random id>` (random per page
  visit).
- URL changes are watched with WXT's `wxt:locationchange`.
- When a new chat gets its real id after the first send, its memory is re-keyed from
  `chatgpt:new:…` to `chatgpt:<id>`, so the next message reuses the same placeholders.

### 4.4 Placeholder mapping store (service worker)

- Interface `MappingStore`: `getMapping(key)`, `saveEntries(key, entries, counters)`,
  `markHintSent(key)`, `rekey(fromKey, toKey)`, `clearAll()`, plus `countConversations()` for
  the dev popup line.
- Implementation: `SessionMappingStore` on `chrome.storage.session` (via WXT `session:` keys,
  one key per conversation).
- Entry: `{ placeholder, value, category, createdAt }`. Record: `{ entries, counters (per
label), hintSent }`.
- **Value matching for reuse:** emails compared lowercase; custom-term categories compared
  normalized (the engine's own normalization); everything else exactly.
- Writes for the same conversation are queued one after another, so two quick sends can't
  overwrite each other.

### 4.5 Redactor (replaces Phase 2's `test-redact.ts`, which is deleted)

`buildRedaction(text, selectedItems, mapping, policy)` → `{ redactedText, newEntries,
counters, hintNeeded }`:

- reuses existing placeholders for values already in the mapping, otherwise takes the next
  number for that label;
- **skips any number whose placeholder already appears literally in your message**, so a
  placeholder never collides with real text;
- replaces from the **end** of the text backwards, so positions stay correct;
- adds the hint line `(Note: keep any [LABEL_n] placeholders exactly as written.)` when
  `placeholderHint` is on, at least one placeholder is used, and the hint hasn't been sent in
  this conversation yet.

### 4.6 Send flow

Exactly the numbered flow in section 3. `LOG_INTERCEPT` gets an **`action`**: `protected` |
`sent_clean` | `cancelled` | `blocked` | `incomplete` | `write_failed` | `paused`. Metadata only
(counts, categories, action, timing, method).

### 4.7 Review panel

See section 6.

### 4.8 Badge (update)

"SafeAI · Protecting" (on), "SafeAI · Paused" (off), success "Protected 3 items" (fades after
4 s), and the error states from the safety rules. Uses Geist once loaded.

### 4.9 Popup (update)

- Top: **Protection** switch (On / Paused).
- **Last activity** card: action (Protected / Sent clean / Cancelled / Blocked / Too long /
  Couldn't write / Paused), time ago, counts per category, scan time.
- **Dev builds only:** service worker lab card, "Open Detection Playground" link, **"Dev policy
  override active"** warning pill, a line "Placeholder memory: N conversations" (a count only),
  and a **"Clear placeholder memory"** button (calls `clearAll()`).

---

## 5. Every file: purpose and functions

Every file starts with a 2–4 line plain-English comment; every exported function has a one-line
comment.

### packages/shared/src

| File          | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `policy.ts`   | Adds `placeholderHint: boolean` (default `true`) to `PolicySchema` and `DEFAULT_POLICY`.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `messages.ts` | **New:** `MAPPING_GET {key}` → `{ mapping }`; `MAPPING_SAVE {key, entries, counters}` → ok; `MAPPING_MARK_HINT {key}` → ok; `MAPPING_REKEY {fromKey, toKey}` → ok; `MAPPING_CLEAR_ALL` → ok; `MAPPING_STATS` → `{ conversations }` (count only, for the dev popup). Schemas `MappingEntrySchema`, `MappingRecordSchema`. **Changed:** `InterceptRecord` gets `action` (the 7 values) instead of `mode`/`success`; keeps `charCount`, `replacedCount`, `method`, `countsByCategory`, `durationMs`, `complete`. |

### packages/design/src

| File         | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tokens.css` | **Semantic tokens** that switch by theme: `--color-canvas`, `--color-surface`, `--color-surface-muted`, `--color-line`, `--color-fg`, `--color-fg-muted`, `--color-action`, `--color-on-action`. Light values from the existing palette; **dark** values from the blueprint (background #0D1118, surface #151A23, border #262D3A, text #E6EAF0, secondary #9AA5B3, primary #2FB8B0 with #042827 text), applied under `[data-theme='dark']`. Plus dark-friendly category colours. |

### packages/detection

| File           | Change                                                                                                                                                            |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.ts` | Also exports **`normalizeTerm`**, so custom-term values are matched with exactly the engine's normalization (see question 5). Nothing else in the engine changes. |

### apps/extension

| File                                    | Purpose / functions                                                                                                                                                                                                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wxt.config.ts`                         | `web_accessible_resources: [{ resources: ['fonts/*.woff2'], matches: ['https://chatgpt.com/*'] }]`.                                                                                                                                                               |
| `public/fonts/`                         | Geist + Geist Mono **variable** `.woff2` files (latin + latin-ext), copied from the already-approved `@fontsource-variable` packages, plus the font licence (SIL OFL). See question 1.                                                                            |
| `entrypoints/chatgpt.content/index.tsx` | Starts badge, fonts, theme watcher, conversation tracker, interceptor; hands each send attempt to `send-flow.ts`.                                                                                                                                                 |
| `entrypoints/popup/App.tsx`             | Protection switch, last-activity card, dev tools (lab, Playground link, override pill, memory count, Clear memory).                                                                                                                                               |
| `entrypoints/playground/App.tsx`        | "Use these settings in ChatGPT (dev)" + "Clear override".                                                                                                                                                                                                         |
| `entrypoints/background.ts`             | Settings migration on install/update.                                                                                                                                                                                                                             |
| `src/content/send-flow.ts`              | `createSendFlow(deps)` → `handleAttempt(trigger)`: scan → panel → decision → redact → write → verify → send → save → log, with every safety rule.                                                                                                                 |
| `src/content/conversation.ts`           | `conversationKeyFromUrl(url)`, `createConversationTracker(ctx)` → `currentKey()`, and re-keying a new chat once ChatGPT gives it an id (`onFirstSend`, `wxt:locationchange`).                                                                                     |
| `src/content/redactor.ts`               | `buildRedaction(text, items, mapping, policy)` (section 4.5); `HINT_LINE`.                                                                                                                                                                                        |
| `src/content/placeholders.ts`           | `matchKey(category, value)` (the reuse rules), `nextFreeNumber(label, counters, text)` (skips collisions), `formatPlaceholder(label, n)`.                                                                                                                         |
| `src/content/policy-source.ts`          | `getActivePolicy()`: default policy, or the dev override (dev builds only).                                                                                                                                                                                       |
| `src/content/test-redact.ts`            | **Deleted** (M4).                                                                                                                                                                                                                                                 |
| `src/background/mapping-store.ts`       | `MappingStore` interface + `SessionMappingStore` (chrome.storage.session) with per-conversation write queue.                                                                                                                                                      |
| `src/background/router.ts`              | Handles the 6 mapping messages with the **strict guard** from section 7: browser-provided sender checks (extension id, `https://chatgpt.com` origin, tab, top frame), key-format validation, conversation/tab binding; popup may only get the count or clear all. |
| `src/background/sender-guard.ts`        | `isChatGptContentScript(sender)`, `isExtensionPage(sender)`, `conversationIdFromSenderUrl(sender)`, and the new-chat key ownership (`claimNewKey`, `ownsNewKey`, `releaseNewKey`).                                                                                |
| `src/ui/fonts.ts`                       | `ensureFonts()`: injects the `@font-face` rules (family names "SafeAI Geist" / "SafeAI Geist Mono", so they never clash with the page's own fonts) into the page `<head>` once; falls back to system fonts if they fail to load.                                  |
| `src/ui/theme.ts`                       | `getChatGptTheme()` (reads ChatGPT's `<html>` class / `color-scheme`), `watchTheme(callback)` (MutationObserver), returns `'light' \| 'dark'`.                                                                                                                    |
| `src/ui/StatusBadge.tsx`                | New states: Protecting / Paused / success / errors; Geist when loaded.                                                                                                                                                                                            |
| `src/ui/review/mountReviewPanel.tsx`    | `openReviewPanel(ctx, input)` → `Promise<ReviewDecision>`: mounts the panel with `createShadowRootUi` (`position: 'modal'`, max `zIndex`, `isolateEvents: true`), resolves on the user's choice, then unmounts (real values leave React state).                   |
| `src/ui/review/ReviewPanel.tsx`         | The whole panel: header, preview, list, footer, focus trap, keyboard shortcuts, re-scan after removals.                                                                                                                                                           |
| `src/ui/review/MessagePreview.tsx`      | Two tabs ("Your message" with highlights / "What ChatGPT will see" with placeholder chips), select-to-protect (maps the selection back to text positions).                                                                                                        |
| `src/ui/review/AddItemPopover.tsx`      | The small "Protect this" button and the category menu (default: Custom term).                                                                                                                                                                                     |
| `src/ui/review/DetectionGroup.tsx`      | One category group (Secrets / Personal / Financial / Business): colour, count, rows.                                                                                                                                                                              |
| `src/ui/review/DetectionRow.tsx`        | One row in every variant: ticked, locked ("Required by your policy"), suggested, blocked (+ "Remove from message"), added by you (+ ×).                                                                                                                           |
| `src/ui/review/PanelFooter.tsx`         | Live summary + Cancel / Edit message / Protect and Send (with spinner).                                                                                                                                                                                           |
| `src/components/`                       | Small shared pieces: `Button`, `Checkbox`, `Badge`, `Chip`, `IconButton`, `Tooltip`, `Spinner` (all token-based, focus rings, reduced motion).                                                                                                                    |
| `src/lib/storage.ts`                    | `settingsItem` → `{ protectionEnabled }` (version 2, with migration from `testReplaceMode`); `devPolicyOverrideItem` (dev only).                                                                                                                                  |

---

## 6. Review panel: layout and every state

```
┌──────────────────────── (page dimmed; clicking it does nothing) ────────────────────────┐
│                                                                                           │
│   ┌──────────────────────────────── max 600 px ─────────────────────────────────┐       │
│   │ 🛡  Review before sending                                              [×]  │       │
│   │     SafeAI found 4 items. Ticked items are replaced before sending.         │       │
│   ├─────────────────────────────────────────────────────────────────────────────┤       │
│   │  [ Your message ] [ What ChatGPT will see ]                                  │       │
│   │  ┌───────────────────────────────────────────────────────────────────────┐ │       │
│   │  │ Hi, email ali@example.com and use key sk_live_…   (highlighted)        │ │       │
│   │  │                       [ Protect this ▾ ]  ← appears on text selection  │ │       │
│   │  └───────────────────────────────────────────────────────────────────────┘ │       │
│   │  SECRETS · 1                                                                │       │
│   │  [✓] sk_live_…EF  API key  · Likely   →  [API_KEY_1]                         │       │
│   │  PERSONAL · 2                                                               │       │
│   │  [✓] ali@example.com  Email           →  [EMAIL_1]                           │       │
│   │  [ ] Sarah  Person name · Possible · Suggested  →  [PERSON_1]                │       │
│   │  FINANCIAL · 1                                                              │       │
│   │  🔒 4242…4242  Card number  Must be removed before sending [Remove from message] │   │
│   │                                       (scrolls; max 70vh)                   │       │
│   ├─────────────────────────────────────────────────────────────────────────────┤       │
│   │  Remove 1 blocked item to send          [Cancel] [Edit message] [Protect and Send] │
│   └─────────────────────────────────────────────────────────────────────────────┘       │
│                          ChatGPT's input box (below)                                     │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

| Row / state          | Look and behaviour                                                                                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **redact**           | Ticked; can be unticked                                                                                                                                                                              |
| **redact, locked**   | Ticked + lock icon + "Required by your policy" (when `allowUserOverride` is false); can't be unticked                                                                                                |
| **warn**             | Unticked + "Suggested" badge; can be ticked                                                                                                                                                          |
| **block**            | No checkbox; red style, lock, "Must be removed before sending", **Remove from message** (deletes the value from the panel's copy of the message and re-scans)                                        |
| **added by you**     | Ticked + "Added by you" badge + remove (×)                                                                                                                                                           |
| **confidence badge** | "Likely" (medium), "Possible" (low); none for high                                                                                                                                                   |
| **long values**      | Shortened in the middle (`sk_live_…abcdEF`), full value in a tooltip on hover/focus                                                                                                                  |
| **"Too long" state** | Warning icon, short explanation, only "Edit message" and "Cancel"                                                                                                                                    |
| **Footer summary**   | "3 of 4 items will be protected" / "Remove 1 blocked item to send"; announced to screen readers                                                                                                      |
| **Primary button**   | **"Protect and Send"** when ≥ 1 item is ticked; **"Send Without Redaction"** when none are (e.g. a warn-only name left unticked). **Disabled** while any blocked item remains; spinner while sending |
| **Unticked notice**  | Shown whenever something is unticked: "Unticked items are sent to ChatGPT unchanged." (approved answer 7)                                                                                            |

**Keyboard & accessibility:** `role="dialog"`, `aria-modal="true"`, labelled by the title; focus
goes to "Protect and Send" on open (or "Edit message" in the "Too long" state); Tab stays inside
(focus trap); **Esc** = Cancel; **Ctrl/Cmd+Enter** = Protect and Send; Space toggles the focused
checkbox; visible focus rings; the summary is a live region.

**Visuals:** design tokens only; light/dark follows ChatGPT live; 200 ms fade/slide in and out,
none with reduced motion; works with 1 or 40 items, very long values, and windows down to 360 px
wide; max `z-index`; ChatGPT's layout untouched after closing.

**Remove from message:** edits the **panel's working copy** of the message and re-scans it; your
other choices (unticks, added items) are kept by matching value + category. ChatGPT's own box
only changes on Protect and Send; **Cancel leaves the original text** (see question 9).

---

## 7. Privacy and safety rules

**Privacy (updated for Phase 3):**

1. Real values travel **only** between the content script and our own service worker, for the
   mapping store. They are **never** sent to any server, **never** logged (not even in dev; the
   Phase 1 `devLogText` is no longer called with real values), **never** written to
   `chrome.storage.local`, and **never** put in the page's localStorage/sessionStorage/IndexedDB.
2. `chrome.storage.session` is memory-only, wiped when the browser closes, and **not readable by
   content scripts by default**. Only the service worker reads it.
3. **Router guard (strict, approved in M1).** Messages carrying real values (`MAPPING_GET`,
   `MAPPING_SAVE`, `MAPPING_MARK_HINT`, `MAPPING_REKEY`) are accepted only when the
   **browser-provided** sender data shows our ChatGPT content script:
   - `sender.id` is our extension's id;
   - `sender.origin` (or `sender.url`'s origin) is exactly `https://chatgpt.com`;
   - `sender.tab` exists, and `sender.frameId === 0` (the top frame, not an iframe).

   Nothing inside the message (for example a "source" field) is trusted. Every message is
   checked against its Zod schema, and conversation keys must have the exact format
   `chatgpt:<id>` or `chatgpt:new:<random>`.

   **Binding to tab/conversation:**
   - a `chatgpt:<id>` key is only accepted when the sender's URL is that conversation
     (`/c/<id>`);
   - a `chatgpt:new:<random>` key belongs to the **tab that first used it** (ownership kept in
     session storage, so it survives the worker sleeping); other tabs are refused;
   - `MAPPING_REKEY` must come from the owning tab, and the target `chatgpt:<id>` must match
     that tab's URL.

   `MAPPING_STATS` (count only) and `MAPPING_CLEAR_ALL` are accepted only from our own extension
   pages (the popup), never from web pages, and never return values. Unauthorized requests get a
   generic `{ ok: false, error: 'Not allowed' }`; payloads are never logged.

4. `LOG_INTERCEPT` and the popup show only metadata (counts, categories, action, timing).
5. The review panel shows real values **only inside our Shadow DOM, only while it is open**, and
   they leave React state when it closes (the panel is unmounted).
6. The dev policy override (custom terms) lives in `chrome.storage.local` in **dev builds only**;
   production builds don't contain the code.

**Safety (unchanged, still apply):**

1. Scan not complete → **don't send**.
2. Any "block" item still in the text → **Protect and Send is disabled**.
3. Writing the protected text fails, or the read-back doesn't match → **don't send**; show an
   error.
4. Our own re-send is never intercepted again (`allowNextSubmit`).

---

## 8. Milestones and what you check by hand

| #      | What gets built                                                                                                                                                                                                                                                | What you check                                                                                                                                |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **M1** | This plan                                                                                                                                                                                                                                                      | Read it, answer section 10, approve                                                                                                           |
| **M2** | Foundations (no panel yet): shared policy/messages; dark tokens; protection toggle + migration + popup switch; policy source + Playground override; conversation tracking + re-keying; mapping store + router; placeholders + redactor; dev popup memory count | Popup switch works and survives reload; badge Protecting/Paused; Playground override pill; memory count line; typecheck/lint/tests still pass |
| **M3** | Review panel UI: fonts, theme, mount, all components and states, keyboard, light/dark, animation. Enter on a message with detections opens the panel; Cancel, Esc, Edit message work                                                                           | Open the panel with sample messages; every state; keyboard-only use; switch ChatGPT's theme; narrow window                                    |
| **M4** | Full send flow: Protect and Send with stable placeholders, hint line, select-to-protect, remove blocked + re-scan, write → verify → send, mapping save, new-chat re-key, badge, LOG_INTERCEPT actions, popup last activity; delete test-redact.ts              | Send real-looking fake data; check placeholders stay stable across messages and in a brand-new chat; popup last activity                      |
| **M5** | Polish + docs: design review pass; typecheck, lint, format:check, existing tests, production build; confirm no Playground / no dev override / no logging of values in production; LEARNING Phase 3, DECISIONS, phase-3-notes, plan synced                      | Read docs; run the final commands                                                                                                             |

After each milestone: changed files + complete manual steps; one short commit per milestone,
pushed when you say "continue".

---

## 9. Questions for `docs/phase-3-notes.md` (M5 template)

1. Did any message with sensitive data ever reach ChatGPT unprotected? How?
2. Did the same value always keep the same placeholder in a conversation, including a new chat?
3. Did ChatGPT keep the placeholders exactly as written in its replies? Which ones did it change?
4. Was the panel ever annoying (opened too often, too slow, false alarms)? Which categories?
5. Did the panel look right in light and dark mode, on a narrow window, and with many items?
6. Did select-to-protect and "Remove from message" work every time?

---

## 10a. Refinements made while starting M2

- **New log action `sent_unredacted`.** With answer 7, a message can be sent with "Send Without
  Redaction" while findings exist. Logging that as `sent_clean` would hide that flagged items
  went out unchanged, so it has its own action. The full list is now 8: `protected` |
  `sent_clean` | `sent_unredacted` | `cancelled` | `blocked` | `incomplete` | `write_failed` |
  `paused`.
- **The Phase 2 flow uses the new redactor and memory from M2.** Until the panel exists, "ON"
  protects every "redact" item directly, but through `buildRedaction` and the mapping store.
  Stable placeholders, the hint line and new-chat re-keying can therefore be hand-tested in M2.
  `test-redact.ts` is deleted in **M2** (as soon as nothing uses it), not M4.
- **Dev badge line** also shows the current conversation (`chat: new` or the first 8
  characters of its id; ids aren't sensitive), so you can watch re-keying happen.

## 10. Questions asked in M1, and your answers (2026-11-20)

1. **Font files:** ✅ copy the Geist / Geist Mono variable woff2 files (latin + latin-ext) from
   the installed `@fontsource-variable` packages into `public/fonts/`, plus the SIL OFL licence.
2. **URL changes:** ✅ WXT's `wxt:locationchange`.
3. **Last-activity record:** ✅ `action` replaces `mode`/`success`; old records show "No activity
   yet".
4. **Migration:** ✅ everyone gets `protectionEnabled: true`.
5. **Engine export:** ✅ `normalizeTerm` exported from `@safeai/detection`.
6. **Checks:** **you run every test and check yourself.** I list the exact commands and expected
   results; I don't run them (same rule as Phase 2).
7. **Warn-only messages:** ✅ **keep the review panel.** If the only finding is a name or another
   warn-only item, the panel opens with that item unticked. The panel **clearly says that
   unticked items are sent unchanged**, and the primary button names the real action:
   - **"Protect and Send"** when at least one item is selected for redaction;
   - **"Send Without Redaction"** when no items are selected.

   Sensitive findings are never sent silently with only a badge in this MVP. An explicitly
   enabled low-friction setting may be tested later, after measuring how often warnings are
   unnecessary.

8. **Router guard:** ✅ **approved with strict validation** (details in section 7):
   - messages with real values are accepted only from the expected ChatGPT content-script
     context, checked with browser-provided sender data (extension id, `https://chatgpt.com`
     origin, a tab, the top frame);
   - message schemas are validated, and mapping access is bound to the right tab/conversation;
   - a "source: content-script" field inside the message is never trusted;
   - the popup may read a count or clear mappings, and never receives original values;
   - unauthorized requests are rejected, and payloads are never logged.
9. **Remove from message:** ✅ edits the panel's working copy and re-scans; Cancel leaves the
   original text.

---

## 11. As built

### M2 — Foundations

- **Shared:** `policy.ts` has `placeholderHint` (default `true`). `messages.ts` has
  `InterceptActionSchema` (8 actions), `ConversationKeySchema` (exact formats
  `chatgpt:<id>` / `chatgpt:new:<uuid>`), `MappingEntrySchema`, `MappingRecordSchema`,
  `EMPTY_MAPPING`, the 6 mapping requests, and `OkReplySchema` / `MappingGetReplySchema` /
  `MappingStatsReplySchema`.
- **Detection:** `normalizeTerm` exported. The existing engine test that lists the exports was
  updated to include it (not a new test).
- **Tokens:** semantic colours (`canvas`, `surface`, `surface-muted`, `line`, `fg`, `fg-muted`,
  `action`, `action-hover`, `on-action`, `focus`, `backdrop`) in `@theme`, and dark values under
  `[data-theme='dark']`, including dark-friendly status and category colours.
- **Storage:** `settingsItem` = `{ protectionEnabled }` (default `true`). `isProtectionEnabled()`
  treats anything except an explicit `false` as ON, so an unmigrated old value still protects.
  `migrateSettings()` runs on install/update in the service worker. `devPolicyOverrideItem` is
  defined **only in dev builds** (`null` in production, so not even its key name ships).
- **`src/content/policy-source.ts`:** `getActivePolicy()`, `isDevOverrideActive()`,
  `startPolicySource()` (loads and watches the override; invalid stored values are ignored).
- **`src/content/conversation.ts`:** `conversationIdFromUrl()`, `createConversationTracker(ctx,
onChange)` → `currentKey()`, `afterSave(savedKey)`. Re-keying works whichever comes first: the
  URL change or the save.
- **`src/background/mapping-store.ts`:** `MappingStore` interface; `SessionMappingStore` (one
  `session:mapping:<key>` item per conversation, a **write queue per key**, merge on save and
  re-key); `mappingStore` singleton (the one line Phase 4 swaps).
- **`src/background/sender-guard.ts`:** `isChatGptContentScript`, `isExtensionPage` (the URL
  must start with our own `chrome-extension://<id>/`), `conversationIdFromSenderUrl`,
  `mayUseConversation` (claims a new-chat key for the first tab that uses it),
  `releaseNewKey`, `clearNewKeyOwners`.
- **`src/background/router.ts`:** `isSenderAllowed` per message type; generic
  "Not allowed" / "Something went wrong" replies; mapping payloads are never logged.
- **`src/content/placeholders.ts`:** `formatPlaceholder`, `matchKey`, `nextFreeNumber`.
- **`src/content/redactor.ts`:** `HINT_LINE`, `planPlaceholders` (also for the M3 preview),
  `buildRedaction`.
- **`src/content/send-flow.ts`:** created in M2 (not M4) with the panel-less flow. `observe()`
  = paused; `protectAndSend()` = scan → incomplete/blocked checks → load memory → redact → write
  and verify → **save memory before sending** (so the memory matches the box even if you have
  to press Send yourself) → send → `afterSave` → badge → log. If memory can't be loaded, the
  message is **not sent**.
- **`src/ui/protection-text.ts`:** `describeCount`, `summarizeProtection` (moved from the
  deleted `test-redact.ts`).
- **Content script:** a short startup file; prompt text is **no longer logged in dev**
  (privacy rule). The dev badge line shows the selector check, `chat: new` / `chat: <8 chars>…`,
  and `dev policy` when an override is active.
- **Badge:** "SafeAI · Protecting" (teal) / "SafeAI · Paused" (grey dot).
- **Popup:** Protection switch at the top; **Last activity** card (action pill, time, replaced,
  scan time, characters, category chips); dev builds only: "Phase 3 · Dev" pill, **Dev tools**
  card (override pill, "Placeholder memory: N conversations", "Clear placeholder memory"),
  service-worker lab, Playground link.
- **Playground:** a bar with the override status, **"Use these settings in ChatGPT (dev)"** and
  **"Clear override"**.
- **Deleted:** `src/content/test-redact.ts`.

### M3 — Review panel

- **Fonts:** `public/fonts/` holds Geist and Geist Mono (latin + latin-ext, variable woff2) and
  `OFL-LICENSE.txt`. `wxt.config.ts` makes only `fonts/*.woff2` web-accessible, and only to
  `https://chatgpt.com/*`. **Change from the plan:** `src/ui/fonts.ts` registers the fonts with
  the **FontFace API** (`document.fonts.add`) instead of adding a `<style>` to ChatGPT's
  `<head>`. Same effect (fonts on the page document work inside our Shadow DOM), but nothing is
  inserted into the page and the page's style rules can't interfere. Family names: "SafeAI
  Geist" / "SafeAI Geist Mono". New tokens `--font-ui` / `--font-ui-mono` fall back to system
  fonts. The badge now uses `font-ui` too.
- **Theme:** `src/ui/theme.ts`: `getChatGptTheme()` (the `dark`/`light` class on `<html>`, then
  `color-scheme`) and `watchTheme()` (MutationObserver). The panel's wrapper gets
  `data-theme`, so the semantic tokens switch live.
- **Shadow DOM CSS fix extended** (`ui.css`): starting values for Tailwind's translate, scale,
  space and divide variables (Chrome ignores `@property` inside Shadow DOM).
- **Components** (`src/components/`): `Button` (primary / secondary / ghost, `loading`),
  `IconButton`, `Checkbox` (a real checkbox, styled), `Badge`, `Chip`, `Tooltip` (hover and
  focus), `Spinner`, `icons.tsx`.
- **Panel** (`src/ui/review/`): `model.ts` (pure logic: rows per category + value, choices kept
  across re-scans, summary, button label, preview pieces), `ReviewPanel`, `MessagePreview`,
  `AddItemPopover`, `DetectionGroup`, `DetectionRow`, `PanelFooter`, `group-style.ts`,
  `mountReviewPanel.tsx` (`openReviewPanel(ctx, input)` → `{ decision, close() }`).
- **Rows are per value**, not per occurrence: "×2" shows when a value appears more than once,
  and ticking it covers every place it appears.
- **"Protect this" is a bar under the preview**, not a floating bubble. It never covers text,
  works at 360 px and is easy to reach by keyboard. You pick the category (default: Custom
  term).
- **Wired already in M3** (more than the plan required), so M2's working protection is not lost
  while the panel exists:
  - "Protect and Send" / "Send Without Redaction" go through the M2 write → verify → save → send
    path.
  - **Before sending**, the final text is scanned again (incomplete or blocked → not sent).
  - ChatGPT's box must still hold the message you reviewed.
  - Placeholder memory is re-loaded.
  - The panel shows a spinner until the send finishes.

  M4 becomes the end-to-end check of the whole flow, plus anything you find.

- **Send flow:** no findings → sent as typed (no panel). Findings, blocked items, or an
  unfinished scan → the panel. Cancel / Esc / × → `cancelled`. Edit message → `cancelled`, plus
  the badge hint "Edit your message, then press Enter again". Closing the "Too long" panel →
  `incomplete`.
- **Badge:** new `info` state (blue, fades after 4 s).
- **Playground (dev):** a checkbox **"Lock “redact” items"** sets `allowUserOverride: false` in the
  override, so the panel's locked rows ("Required by your policy") can be tested by hand.

### M4 — Full send flow

Most of M4 was wired early in M3: the panel's decision goes through write → verify → save →
send, with stable placeholders, the hint line, select-to-protect, Remove + re-scan, re-keying
of new chats, badge messages and every `LOG_INTERCEPT` action. M4 is therefore the end-to-end
review of that flow, plus these fixes:

- **Popup:** `write_failed` is shown as **"Not sent (error)"**. It covers every "stopped for
  safety" case: couldn't write or verify, no placeholder memory, the message changed while you
  were reviewing it, or the automatic send failed.
- **Panel:** a text selection made before "Remove from message" is cleared when the text
  changes, so "Protect this" can never add a value that is no longer in the message.

**The whole flow, as built.** Enter →

1. Scan. If there are no findings, the message is sent as typed (`sent_clean`).
2. Otherwise, load placeholder memory. If that fails, nothing is sent (`write_failed`).
3. The panel opens.
4. **Cancel / Esc / × / Edit message** → `cancelled` (or `incomplete` from the "Too long" state).
5. **Send:**
   - re-scan the final text (incomplete → `incomplete`; blocked → `blocked`);
   - ChatGPT's box must still hold the reviewed text;
   - reload placeholder memory;
   - `buildRedaction`;
   - write and read back, only if the text changed;
   - save the new placeholders and the hint status;
   - send;
   - re-key a new chat;
   - badge;
   - log: `protected` / `sent_unredacted` / `sent_clean` / `write_failed`.
