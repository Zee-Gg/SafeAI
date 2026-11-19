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

## Phase 2 — what I learned

### 1. What the detection engine does

The engine is a function: **text + policy in → list of findings out**. Each finding says
**where** it is, **what kind** it is, **how sure** we are, and **what the policy says to do**.

| Step        | What happens                                                                              | File             |
| ----------- | ----------------------------------------------------------------------------------------- | ---------------- |
| 1. Prepare  | Work out which detectors are on; build the custom-term search machine (once, then cached) | `context.ts`     |
| 2. Chunk    | Cut long text into 20,000-character pieces that overlap by 500                             | `chunking.ts`    |
| 3. Detect   | Each detector looks for its kind of data; positions are shifted back to the original text | `detectors/*.ts` |
| 4. Actions  | Each finding gets redact / block / warn from the policy; "allow" findings are dropped      | `engine.ts`      |
| 5. Clean up | Remove duplicates from the overlaps; where findings overlap, keep only the winner         | `overlap.ts`     |
| 6. Output   | Sort by position, count per category, measure the time, say whether it finished           | `engine.ts`      |

### 2. What a regex is

A **regular expression** ("regex") is a tiny pattern language for finding text. For example,
`\d{3}-\d{2}-\d{4}` means "3 digits, a dash, 2 digits, a dash, 4 digits", the shape of a US
Social Security number.

| Piece    | Means                                      | Example                            |
| -------- | ------------------------------------------ | ---------------------------------- |
| `\d`     | any digit                                  | `7`                                |
| `[A-Z]`  | any capital letter                         | `Q`                                |
| `{4}`    | exactly 4 of the previous thing            | `\d{4}` → `2026`                   |
| `+`      | one or more                                | `a+` → `aaa`                       |
| `?`      | optional                                   | `colou?r` → `color` or `colour`    |
| `(?<!x)` | "only if NOT right after x" (a lookbehind) | used to start at a token beginning |

Regexes are fast and compact, but they only find **shapes**. That's why most of our detectors
check something extra after the regex (see 4).

### 3. ReDoS: when a regex becomes a trap

**ReDoS** (regular-expression denial of service) happens when a badly written regex meets
unlucky text and tries an enormous number of ways to match, so the page freezes. The classic
cause is a **repeat inside a repeat** (for example `(a+)+`): on a long run of `a`s, the engine
tries every way of splitting the run between the inner and outer repeat.

Our layers of protection:

| #   | Layer                              | What it does                                                                                             |
| --- | ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | **eslint-plugin-regexp**           | Flags risky patterns while typing. It caught a real one in Phase 2 (two `\s*` that could trade spaces).  |
| 2   | **Writing style**                  | No nested repeats; matches only start at a token's beginning; names/addresses use code, not big regexes  |
| 3   | **Chunking**                       | Most regexes never see more than 20,000 characters at once                                               |
| 4   | **Time budget (500 ms)**           | If scanning takes too long, the engine stops and says `complete: false`                                   |
| 5   | **"Not complete → not sent"**      | The extension never sends a message it couldn't fully check                                               |
| 6   | **No regex where it isn't needed** | Private keys are found with plain `indexOf`; custom terms with Aho-Corasick                               |

(An automatic safety test with safe-regex2 was planned for M6, which we skipped. Layers 1–6
are in place.)

### 4. Checksums: why "4242 4242 4242 4242" counts and "1234 5678 9012 3456" doesn't

Many official numbers carry a built-in **check digit**, calculated from the other digits:

| Number      | Check                                                       | A random number passes by chance |
| ----------- | ----------------------------------------------------------- | -------------------------------- |
| Card number | **Luhn**: double every second digit, add up, must end in 0 | about 1 in 10                    |
| IBAN        | **mod-97**: the whole number divided by 97 must leave 1     | about 1 in 97                    |

Add the extra rules (a known card prefix, the right IBAN length for the country), and an order
number or a typo almost never gets flagged. **Fewer false alarms means people trust the warnings.**

### 5. Entropy: measuring "randomness"

**Shannon entropy** measures how unpredictable the characters in a string are, in bits per
character. Normal words reuse a few letters a lot (about 2–3 bits). Generated secrets use many
different characters evenly (often 4+ bits).

| Example                                  | Entropy  | Our decision                          |
| ---------------------------------------- | -------- | ------------------------------------- |
| `internationalization`                   | low      | a word: skipped                       |
| `aaaa1111aaaa1111aaaa1111`               | ~1 bit   | repetitive: skipped                   |
| a 40-character random-looking token      | > 4 bits | medium; **high** next to "SECRET_KEY" |
| a 40-character hex string after "commit" | —        | a git hash: skipped                   |

That's how SafeAI catches secrets that no known pattern describes.

### 6. Aho-Corasick: finding 5,000 words in one pass

The naive way to find 5,000 custom terms is to search the text 5,000 times. **Aho-Corasick**
builds one "search machine" from all the terms: a tree of characters (a **trie**) plus
**failure links** that say where to continue when the next character doesn't fit. Then it reads
the text **once**, left to right, never stepping back.

| Approach            | Work for 10,000 characters and 5,000 terms                |
| ------------------- | --------------------------------------------------------- |
| Search term by term | about 5,000 passes over the text                          |
| Aho-Corasick        | **1 pass** (plus building the machine once per policy)    |

We wrote our own (about 100 lines, `utils/aho-corasick.ts`), because the npm options were
missing or unmaintained, and we needed exact start/end positions on normalized text.

### 7. Why we keep an index map

To match "ABC Corp" in "abc   CORP" or "ABC⏎Corp", we first **normalize** the text:
- lowercase it;
- apply Unicode NFKC, so full-width `ＡＢＣ` and the ligature `ﬁ` become normal letters;
- turn every whitespace run into one space.

But normalizing **changes positions**, and we must replace the *original* characters. So
`normalizeForMatching` also builds an **index map**: for every normalized character, where it
came from in the original text.

| Position in normalized text | 0   | 1   | 2   | 3       | 4   | 5   | 6   | 7   |
| --------------------------- | --- | --- | --- | ------- | --- | --- | --- | --- |
| Normalized character        | a   | b   | c   | (space) | c   | o   | r   | p   |
| Came from original position | 0   | 1   | 2   | 3       | 6   | 7   | 8   | 9   |

So a match on normalized positions 0–8 maps back to original positions 0–10: exactly `ABC   Corp`.

### 8. Why public keys aren't secrets

Some "keys" are **meant** to be shared. Redacting them would only add noise and teach people to
ignore warnings.

| Key                              | Why it's public                                                  |
| -------------------------------- | ---------------------------------------------------------------- |
| Stripe `pk_live_…` / `pk_test_…` | Goes into web pages by design; Stripe: "safe to expose"          |
| Supabase `sb_publishable_…`      | Supabase: "safe to expose online"; protected by database rules   |
| Twilio Account SID `AC…`         | An account **identifier** (like a username), not a password      |

Their secret siblings (`sk_live_…`, `sb_secret_…`, Twilio auth tokens) **are** detected.

### 9. Why we'd rather miss a name than flood you with false alarms

Names and addresses are the hardest data to detect: "Paris", "Apple", "Jordan" and "Model Town"
can be people, places or products. Guessing from capital letters alone would flag half of every
message. So:

| Choice                                                          | Reason                                                                |
| --------------------------------------------------------------- | --------------------------------------------------------------------- |
| Names only with **context** (Dr., "Name:", "Hi …,", "Regards,") | Context makes a name very likely                                      |
| Low confidence → **warn**, not redact                           | Mistakes don't change your message; Phase 3 will show them for review |
| Skip "Hi team", "Thanks, The Team"                              | Common phrases that aren't names                                      |

A tool that cries wolf gets switched off. **Precision builds trust**, and trust keeps people
protected.

### 10. Overlap rules: who wins when findings collide

Sometimes two detectors claim the same text (an API key also looks "random"; a custom term
contains an email). Only one can be replaced, so the winner is chosen by these rules, in order:

| #   | Rule                                  | Why                                          |
| --- | ------------------------------------- | -------------------------------------------- |
| 1   | `block` beats everything              | The strictest action must never be lost      |
| 2   | Custom terms beat built-in categories | The company knows its own data best          |
| 3   | Higher confidence wins                | "Definitely an API key" beats "looks random" |
| 4   | Longer match wins                     | `ABC Corp Holdings` beats `ABC Corp`         |
| 5   | Earlier start wins                    | A stable, predictable tie-breaker            |

### 11. Why the engine is "pure"

**Pure** means the engine only takes text + policy and returns findings. It never touches the
page, the browser, the network, storage or the console.

| Benefit           | Explanation                                                                    |
| ----------------- | ------------------------------------------------------------------------------ |
| **Can't leak**    | No network, no storage, no logging, so detected values can't escape from it    |
| **Runs anywhere** | Same code in the content script, the Playground, and later a server            |
| **Easy to test**  | Same input → same output                                                       |
| **Enforced twice**| ESLint blocks `window`, `fetch`, `console`…; TypeScript has no DOM types there |

### 12. Smaller lessons

| Lesson                                                                                                   | Where                         |
| -------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Some findings are longer than the chunk overlap (PEM keys, long JWTs), so those detectors scan the whole text | `private-key.ts`, `jwt.ts`    |
| The time budget must start **after** one-time preparation, or big policies get wrongly refused           | `engine.ts`                   |
| Brand-new npm releases can be blocked by pnpm's supply-chain rule, so use a version a few days old        | `DECISIONS.md`                |
| Provider key formats change, so every pattern links to its official source                               | `api-key-patterns.ts`         |
| Test values must be fake and **assembled at runtime**, so GitHub push protection never sees a real-looking key | `tests/fixtures/fake-data.ts` |
| Adding the engine grew the content script from 330 kB to 580 kB (mostly the phone library)              | `phase-2-plan.md`             |
