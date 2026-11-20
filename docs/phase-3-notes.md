<!--
  Template you fill in while testing Phase 3 (the review panel and stable placeholders on ChatGPT).
  Your answers decide what Phase 4 must improve. Replace each "_Answer:_" line with what you saw.
  NEVER paste real sensitive data here: describe the KIND of text instead.
-->

# Phase 3 — testing notes

**Tested by:** _name_ · **Date:** _yyyy-mm-dd_ · **Chrome version:** _(chrome://version)_ ·
**SafeAI commit:** _(`git log --oneline -1`)_

---

## Risk questions

### 1. Did any message with sensitive data ever reach ChatGPT unprotected? How?

Think of every path: Enter, the Send button, pasting then sending, sending while ChatGPT was
still answering, switching chats with the panel open. If something went out unprotected, write
the exact steps (with fake data).

_Answer:_

### 2. Did the same value always keep the same placeholder in a conversation, including a new chat?

Send the same fake email in 3 messages of one chat (start in a **new** chat). Then open another
new chat and send it again. Note the placeholders you saw.

| Chat               | Message 1 | Message 2 | Message 3 |
| ------------------ | --------- | --------- | --------- |
| New chat A         |           |           |           |
| New chat B (fresh) |           |           |           |

_Anything unexpected:_

### 3. Did ChatGPT keep the placeholders exactly as written in its replies? Which ones did it change?

Ask ChatGPT to rewrite or summarize a protected message. Did it keep `[EMAIL_1]` etc. exactly,
or change them (e.g. `[Email 1]`, `EMAIL_1`, a made-up name)? Did the hint line help?

_Answer:_

### 4. Was the panel ever annoying (opened too often, too slow, false alarms)? Which categories?

Use SafeAI for your normal work for a while. Note how often the panel opened for nothing, which
category caused it (e.g. "Person name on product names"), and whether it ever felt slow.

_Answer:_

### 5. Did the panel look right in light and dark mode, on a narrow window, and with many items?

| Situation                         | Looked right? (✅ / ❌ + what was wrong) |
| --------------------------------- | ---------------------------------------- |
| Light mode                        |                                          |
| Dark mode (and switching live)    |                                          |
| Window about 360 px wide          |                                          |
| 20+ items (paste a long message)  |                                          |
| Very long value (e.g. a long key) |                                          |

### 6. Did select-to-protect and "Remove from message" work every time?

Try selecting a word, a phrase across a highlight, a whole line, and text with spaces around it.
Try removing a blocked item that appears twice.

_Answer (select-to-protect):_

_Answer (Remove from message):_

---

## Main checks

Write ✅ or ❌ in the Result column.

| #   | Check                       | Expected                                                        | Result |
| --- | --------------------------- | --------------------------------------------------------------- | ------ |
| 1   | `pnpm typecheck`            | no errors                                                       |        |
| 2   | `pnpm lint`                 | no errors                                                       |        |
| 3   | `pnpm format:check`         | no differences                                                  |        |
| 4   | `pnpm test`                 | all tests pass                                                  |        |
| 5   | `pnpm build`                | succeeds                                                        |        |
| 6   | Production: no Playground   | no `playground.html` in the build folder                        |        |
| 7   | Production: no dev override | no `devPolicyOverride` in the built files                       |        |
| 8   | Production: no logging      | no `[SafeAI]` in the built files                                |        |
| 9   | Stable placeholders         | same value → same placeholder in one chat; new chat starts at 1 |        |
| 10  | Keyboard only               | panel fully usable without the mouse                            |        |

## Anything else I noticed

-
