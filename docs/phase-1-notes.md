<!--
  Template you fill in while testing Phase 1 in a real browser (the dev Chrome from `pnpm dev`).
  Your answers decide what Phase 2 must handle. Replace each "_Answer:_" line with what you saw.
-->

# Phase 1 — testing notes

**Tested by:** _name_ · **Date:** _yyyy-mm-dd_ · **Chrome version:** _(chrome://version)_ ·
**SafeAI commit:** _(`git log --oneline -1`)_

---

## Risk questions

### 1. While typing/pasting (before pressing Send), does ChatGPT send any network requests containing my text?

This matters because SafeAI only acts when you press Send. If ChatGPT uploads drafts while
you type, the text could leave before we protect it.

How to check:

1. On chatgpt.com, press **F12** and open the **Network** tab.
2. Click the 🚫 icon (clear) so the list is empty.
3. Type a unique word in the input box, e.g. `zebra-pineapple-42`. **Don't press Send.**
   Also try pasting it.
4. Press **Ctrl + F** inside the Network panel and search for `zebra-pineapple-42`.
5. That search may not look inside what was _sent_ (request bodies), so also check by hand:
   click each request that appeared while you typed, open its **Payload** tab, and look for
   your word.
6. Any match means your text left the browser before Send.

_Answer:_

### 2. Which replace method worked: `insertText` or `paste`?

With Test replace mode ON, send `email me at ali@test.com`, then open the popup. The
**Last intercept → Method** field shows it.

_Answer:_

### 3. Were the selectors found? If not, what were the correct ones?

The dev line under the badge shows `input ✓` / `✗`. After typing, the send button is checked
on each send.

_Answer (input box):_

_Answer (send button):_

### 4. Does Shift+Enter still create a new line without being intercepted?

Type a line, press **Shift + Enter**, type another. Check that the popup's Last intercept did
**not** change, in both Observe and Test replace mode.

_Answer:_

### 5. How long did it take for the service worker to go to sleep?

1. Close any DevTools window for the extension's service worker.
2. In the popup, click **Ping worker** and note the time.
3. Wait, close the popup, reopen and ping. When **Memory** drops back to 1, the worker had
   slept. Try 30 s, 45 s, 60 s.
4. If it never resets in `pnpm dev`, try the production build (`pnpm build` → Load unpacked).

_Answer (dev build):_

_Answer (production build):_

### 6. Did anything break when switching between chats?

Switch between existing chats and "New chat" a few times, sending a message in each
(both modes). Does the badge stay? Are sends still logged? Are emails still replaced?

_Answer:_

---

## Main test results

| Test                                                   | Expected                                          | Result (✅/❌ + notes) |
| ------------------------------------------------------ | ------------------------------------------------- | ---------------------- |
| Badge appears on chatgpt.com                           | "SafeAI · Observing", top-right                   |                        |
| Observe mode: Enter sends normally                     | Sent unchanged; Last intercept = observe, Success |                        |
| Observe mode: send-arrow click is logged               | Last intercept updates                            |                        |
| Toggle ON updates the badge instantly                  | "SafeAI · Test replace ON", no reload             |                        |
| **Done-when test:** `email me at ali@test.com` + Enter | ChatGPT receives `email me at [EMAIL_1]`          |                        |
| Same email twice + another email                       | `[EMAIL_1] … [EMAIL_2] … [EMAIL_1]`               |                        |
| Message without emails (replace mode)                  | Sent unchanged                                    |                        |
| Popup status on another website                        | "Open chatgpt.com to start"                       |                        |
| Production build (Load unpacked) works the same        | Same results, no `[SafeAI]` lines in the Console  |                        |

## Anything else I noticed

-
