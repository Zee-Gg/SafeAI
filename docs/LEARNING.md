<!--
  Plain-English notes on what we learned while building SafeAI, one section per phase.
  Written for someone new to Chrome extensions. Each idea links to the file where it lives.
-->

# Learning notes

## Phase 1 — what I learned

### 1. An extension is three separate programs

A Chrome extension isn't one program. It's several small ones that live in different places
and can only talk by sending messages.

| Part                            | Where it runs                                    | What SafeAI uses it for                                                 | File                                          |
| ------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------- |
| **Content script**              | Inside the web page (chatgpt.com)                | Sees the input box, catches Enter/Send, swaps the text, shows the badge | `apps/extension/entrypoints/chatgpt.content/` |
| **Service worker** (background) | Hidden, in Chrome itself, no page                | Receives messages, saves the "last intercept", runs the lifecycle lab   | `apps/extension/entrypoints/background.ts`    |
| **Popup**                       | The small window when you click the toolbar icon | Shows status, the toggle, the last intercept and the worker lab         | `apps/extension/entrypoints/popup/`           |

They don't share variables. If the content script wants the background to know something,
it **sends a message** (`sendToBackground` in `src/lib/messaging.ts`). Each message has a
**Zod schema** in `packages/shared/src/messages.ts`, so both sides agree on its exact shape,
and anything else is rejected.

| Message         | Sent from → to              | What it carries                                                     |
| --------------- | --------------------------- | ------------------------------------------------------------------- |
| `PING`          | Popup → background          | Nothing. The reply has the lab counters and the worker's start time |
| `GET_STATUS`    | Popup → background          | Nothing. The reply has the last intercept                           |
| `LOG_INTERCEPT` | Content script → background | Metadata about one send attempt (never the text)                    |
| `CONTENT_PING`  | Popup → content script      | Nothing. A reply means "SafeAI is running on this tab"              |

**Privacy rule:** messages only carry _metadata_ (site, character count, how many items were
replaced, method, time). The prompt text itself never leaves the ChatGPT tab.

### 2. The "isolated world"

Our content script runs on chatgpt.com, but in an **isolated world**:

| Shared with ChatGPT?                                | What it means for us                                                          |
| --------------------------------------------------- | ----------------------------------------------------------------------------- |
| ✅ **The page's HTML** (the DOM)                    | We can find the input box, read its text and listen to clicks and key presses |
| ❌ **The page's JavaScript** (variables, functions) | We can't call ChatGPT's code, and ChatGPT can't call ours                     |

That's why we can't "call ChatGPT's send function". We can only do what a user does:
press keys, click buttons, paste text.

It's also why we store data in `chrome.storage`, not in the page's storage:

| Storage                                       | Who can read it            | Used by SafeAI?               |
| --------------------------------------------- | -------------------------- | ----------------------------- |
| `localStorage`, `sessionStorage`, `IndexedDB` | chatgpt.com's own code too | ❌ Never                      |
| `chrome.storage` (via WXT's storage helper)   | Only our extension         | ✅ Yes (`src/lib/storage.ts`) |

### 3. Capture phase: getting there first

When you press a key or click, the browser sends the event on a trip through the page, first
down to the element you touched and then back up:

| Phase      | Direction                                | Who listens here                                       |
| ---------- | ---------------------------------------- | ------------------------------------------------------ |
| 1. Capture | `document` → … → form → input box (down) | **SafeAI** (`addEventListener(…, true)` on `document`) |
| 2. Target  | At the input box itself                  | The element's own listeners                            |
| 3. Bubble  | input box → form → … → `document` (up)   | Most code, including ChatGPT's                         |

Because we listen on the way **down**, **we run first**. In replace mode we then call:

| Call                         | What it tells the browser                                      |
| ---------------------------- | -------------------------------------------------------------- |
| `preventDefault()`           | "Don't do your normal thing" (e.g. submit a form)              |
| `stopImmediatePropagation()` | "Nobody else gets this event", so ChatGPT never sees the Enter |

We listen on `document` rather than on the input box itself because ChatGPT is a
**single-page app**: when you switch chats it throws away the input box and makes a new one.
A listener on `document` keeps working. This is called **event delegation**
(`src/content/interceptor.ts`).

Which key presses count as "send":

| Key press                                      | Treated as send? | Why                                                |
| ---------------------------------------------- | ---------------- | -------------------------------------------------- |
| Enter                                          | ✅ Yes           | ChatGPT's normal send                              |
| Shift + Enter                                  | ❌ No            | Makes a new line                                   |
| Enter while typing with an IME (`isComposing`) | ❌ No            | In Chinese/Japanese input, Enter picks a character |
| Click on the send arrow (or its icon)          | ✅ Yes           | Same as Enter                                      |

### 4. Why changing ChatGPT's text needs a special trick

ChatGPT's input box is a **ProseMirror** editor. ProseMirror keeps its **own copy** of your
text in JavaScript memory; what you see on screen is just a drawing of that copy. ChatGPT
sends the text from that copy.

| Way to change the text                                      | What happens                                                                | Used?         |
| ----------------------------------------------------------- | --------------------------------------------------------------------------- | ------------- |
| `composer.textContent = "new text"`                         | Only the drawing changes. ChatGPT sends the **original**, a leak            | ❌ Never      |
| `document.execCommand("insertText", …)` after selecting all | Acts like typing. ProseMirror sees real editing events and updates its copy | ✅ Strategy 1 |
| A simulated **paste** event with the new text               | Acts like pasting. ProseMirror updates its copy                             | ✅ Strategy 2 |

`execCommand` is officially "deprecated", but it's still the most reliable way to drive rich
editors.

**Trust, but verify:** after each attempt we **read the text back**. Only if it matches do we
send. If not: **we don't send at all**, and the badge turns red. This is SafeAI's core safety
rule: _if we can't protect it, we don't send it_ (`src/content/editor-writer.ts`).

The whole replace flow, step by step:

| Step | What SafeAI does                                                               | If it fails                                 |
| ---- | ------------------------------------------------------------------------------ | ------------------------------------------- |
| 1    | Blocks your Enter/click before ChatGPT sees it                                 | —                                           |
| 2    | Reads the text and swaps emails for `[EMAIL_1]`, `[EMAIL_2]`…                  | —                                           |
| 3    | Writes the new text into the editor (insertText, then paste)                   | Red badge: **not sent**                     |
| 4    | Reads the editor back to check                                                 | Red badge: **not sent**                     |
| 5    | Turns on a one-time **bypass** (`allowNextSubmit()`) and clicks ChatGPT's Send | Falls back to pressing Enter in the editor  |
| 6    | Waits for ChatGPT to empty the input box, which proves it was sent             | Red badge: protected, but please press Send |

### 5. The service worker forgets things

The background is a **service worker**, and Chrome **puts it to sleep** after about
30 seconds of doing nothing. When a new message arrives, Chrome starts it again **from
scratch**: the whole file runs from the top.

The popup's **Service worker lab** shows this:

| Value shown       | Where it lives                    | After the worker sleeps             |
| ----------------- | --------------------------------- | ----------------------------------- |
| **Memory**        | A normal variable (`memoryCount`) | Back to 0, so the next ping shows 1 |
| **Storage**       | `chrome.storage` (`storageCount`) | **Survives**, keeps counting        |
| **Started X ago** | `workerStartedAt = Date.now()`    | Resets: the file ran again          |

**Lesson:** never keep important state only in a service-worker variable. Put it in storage.

Two related rules:

| Rule                                                    | Why                                                                                                                                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Add message listeners immediately, at the top level** | When Chrome wakes the worker just to deliver a message, it only hands it to listeners that exist once the first run finishes. One added after an `await` misses it (`background.ts`). |
| **Test sleep with nothing watching the worker**         | An open DevTools window on the worker, or WXT's hot-reload connection in dev mode, can keep it awake. Close DevTools, or use a production build.                                      |

### 6. Shadow DOM: a walled garden for our badge

The badge lives inside a **Shadow DOM**, a private mini-page attached to chatgpt.com.
WXT's `createShadowRootUi` sets this up.

| Without Shadow DOM                             | With Shadow DOM                |
| ---------------------------------------------- | ------------------------------ |
| ChatGPT's CSS could change how our badge looks | ChatGPT's CSS can't reach in   |
| Our CSS (Tailwind) could break ChatGPT's page  | Our CSS stays inside the badge |

One surprise: Tailwind gives some internal variables their starting values with a CSS feature
called `@property`, and **Chrome ignores `@property` inside a Shadow DOM**. So the badge's
border didn't draw at first. We fixed it by setting those values by hand in
`src/styles/ui.css`.

### 7. Smaller lessons

| Lesson                                     | What it means                                                                                                      | Where                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| **Design tokens**                          | Every colour, size, radius and shadow is defined once. Tailwind turns the names into classes (`bg-primary-600`)    | `packages/design/src/tokens.css` |
| **px, not rem, for UI inside other sites** | `rem` follows the _website's_ font size, so our badge could change size                                            | `tokens.css`                     |
| **Chrome needs Developer mode**            | Recent Chrome won't run unpacked extensions (our dev builds) without it                                            | `chrome://extensions`            |
| **Selectors are guesses**                  | ChatGPT changes its HTML often. Every selector lives in one place with fallbacks, so a fix is one line             | `src/adapters/chatgpt.ts`        |
| **Tool versions move fast**                | ESLint 10 and TypeScript 7 were out, but plugins didn't support them yet, so we pinned ESLint 9 and TypeScript 6.0 | `docs/DECISIONS.md`              |
| **Badges must not block the page**         | The badge first covered ChatGPT's buttons. Now it sits top-right and is click-through                              | `src/ui/StatusBadge.tsx`         |
