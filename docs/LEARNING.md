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

**Privacy rule:** messages only carry _metadata_ (site, character count, how many items were
replaced, method, time). The prompt text itself never leaves the ChatGPT tab.

### 2. The "isolated world"

Our content script runs on chatgpt.com, but in an **isolated world**:

- It **shares the page's HTML** (the DOM). It can find the input box, read its text and
  listen to clicks.
- It **does not share the page's JavaScript.** ChatGPT's variables and functions are
  invisible to us, and ours are invisible to ChatGPT.

That's why we can't "call ChatGPT's send function". We can only do what a user does:
press keys, click buttons, paste text.

It's also why we never use `localStorage` in the content script. That storage belongs to
chatgpt.com, so ChatGPT's own code could read it. We use `chrome.storage` instead, which only
the extension can see (`src/lib/storage.ts`).

### 3. Capture phase: getting there first

When you press a key or click, the browser sends the event on a trip through the page:

```
document  →  …  →  the form  →  the input box        (1. CAPTURE: going down)
document  ←  …  ←  the form  ←  the input box        (2. BUBBLE: coming back up)
```

Most code, including ChatGPT's, listens on the way **up**. We listen on `document` on the
way **down** (the third argument `true` in `addEventListener(…, true)`), so **we run first**.
In replace mode we then call:

- `preventDefault()`: "browser, don't do your normal thing" (e.g. submitting a form);
- `stopImmediatePropagation()`: "nobody else gets this event", so ChatGPT never sees the Enter.

We listen on `document` rather than on the input box itself because ChatGPT is a
**single-page app**: when you switch chats it throws away the input box and makes a new one.
A listener on `document` keeps working. This is called **event delegation**
(`src/content/interceptor.ts`).

Shift+Enter is left alone (it makes a new line), and so is Enter while typing with an
**IME** (Chinese/Japanese input), where Enter picks a character (`event.isComposing`).

### 4. Why changing ChatGPT's text needs a special trick

ChatGPT's input box is a **ProseMirror** editor. ProseMirror keeps its **own copy** of your
text in JavaScript memory; what you see on screen is just a drawing of that copy.

- If we set `composer.textContent = "new text"`, we only change the _drawing_. ProseMirror
  ignores it or redraws the old text, and ChatGPT sends the **original**. That would leak
  exactly what we wanted to hide.
- So we change the text **the way a user would**: select everything, then
  `document.execCommand("insertText", …)`, which acts like typing. If that doesn't work, we
  simulate a **paste**. Both fire the real editing events ProseMirror listens to, so it
  updates its own copy.
- `execCommand` is officially "deprecated", but it's still the most reliable way to drive
  rich editors.

**Trust, but verify:** after each attempt we **read the text back**. Only if it matches do we
send. If not: **we don't send at all**, and the badge turns red. This is SafeAI's core safety
rule: _if we can't protect it, we don't send it_ (`src/content/editor-writer.ts`).

To send the protected version, we turn on a one-time **bypass** (`allowNextSubmit()`) so our
own interceptor doesn't block our own click, then click ChatGPT's send button. When ChatGPT
empties the input box, we know it really went.

### 5. The service worker forgets things

The background is a **service worker**, and Chrome **puts it to sleep** after about
30 seconds of doing nothing. When a new message arrives, Chrome starts it again **from
scratch**: the whole file runs from the top.

The popup's **Service worker lab** shows this:

- `memoryCount` is a normal variable. After a sleep it's back to 0, so the next ping shows 1.
- `storageCount` is saved in `chrome.storage`, so it **survives** the sleep and keeps counting.
- "Started X ago" resets too, because `workerStartedAt = Date.now()` runs again on wake-up.

**Lesson:** never keep important state only in a service-worker variable. Put it in storage.

Two related rules:

- **Add message listeners immediately, at the top level.** When Chrome wakes the worker just
  to deliver a message, it only hands that message to listeners that exist once the file's
  first run finishes. A listener added after an `await` would miss it (`background.ts`).
- **The worker can stay awake while you look at it.** An open DevTools window on the worker,
  or WXT's hot-reload connection in dev mode, can keep it from sleeping. Test the lifecycle
  lab with DevTools closed, or with a production build.

### 6. Shadow DOM: a walled garden for our badge

The badge lives inside a **Shadow DOM**, a private mini-page attached to chatgpt.com.
ChatGPT's CSS can't reach in and break our badge, and our CSS can't leak out and break
ChatGPT. WXT's `createShadowRootUi` sets this up.

One surprise: Tailwind gives some internal variables their starting values with a CSS feature
called `@property`, and **Chrome ignores `@property` inside a Shadow DOM**. So the badge's
border didn't draw at first. We fixed it by setting those values by hand in
`src/styles/ui.css`.

### 7. Smaller lessons

- **Design tokens:** every colour, size, radius and shadow is defined once in
  `packages/design/src/tokens.css`. Tailwind turns the names into classes (`bg-primary-600`).
- **px, not rem, for UI inside other sites:** `rem` follows the _website's_ font size.
- **Chrome needs Developer mode** to run unpacked extensions (our dev builds).
- **Selectors are guesses:** ChatGPT changes its HTML often. Every selector lives in one place
  (`src/adapters/chatgpt.ts`), each with fallbacks, so a fix is a one-line change.
- **Tool versions move fast:** ESLint 10 and TypeScript 7 were out, but plugins didn't support
  them yet, so we pinned ESLint 9 and TypeScript 6.0 (see `DECISIONS.md`).
