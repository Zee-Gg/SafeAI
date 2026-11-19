<!--
  Template you fill in while testing Phase 2 (the Detection Playground and ChatGPT).
  Your answers decide what Phase 3 must improve. Replace each "_Answer:_" line with what you saw.
  NEVER paste real sensitive data here: describe the KIND of text instead.
-->

# Phase 2 — testing notes

**Tested by:** _name_ · **Date:** _yyyy-mm-dd_ · **Chrome version:** _(chrome://version)_ ·
**SafeAI commit:** _(`git log --oneline -1`)_

---

## Risk questions

### 1. Which false alarms did I see in the Playground with my own real-world text?

Paste some of your everyday text into the Playground (emails, code, notes). Look for highlights
that are **not** sensitive. Describe the **kind** of text, never the real data. For example:
"order numbers like ABC-1234 flagged as phone", "product names after 'Hi' flagged as names".

_Answer:_

### 2. Which real sensitive items were missed?

Same text: what **should** have been highlighted but wasn't? Again, describe the kind
("a UK phone number written with dots", "an internal API key format starting with 'acme_'").

_Answer:_

### 3. How noisy are names and addresses? Should they stay "warn"?

Look at the dashed (low-confidence) highlights. Roughly how many were right vs. wrong?

_Answer (names):_

_Answer (addresses):_

_Keep them as "warn"? (yes / no, and why):_

### 4. What time was shown for a very long paste, and for 5,000 custom terms?

1. In the Playground, paste a long document (e.g. 10,000+ characters).
2. Click **Generate 5,000 test terms**, then type one more character (that time is the real
   scan; the first one includes the one-time preparation).
3. Read the **ms** in the summary bar.

| Text length  | Custom terms | Time shown (ms) | Complete? |
| ------------ | ------------ | --------------- | --------- |
| ~10,000      | 0            |                 |           |
| ~10,000      | 500          |                 |           |
| ~10,000      | 5,000        |                 |           |
| _(your long doc)_ | 5,000   |                 |           |

Goal: **10,000 characters + 500 terms under 30 ms.**

### 5. Did any API key format fail to match, or did any public key get flagged?

Try **fake** keys in each provider's format (made-up characters after the real prefix, e.g.
`sk_live_` + random letters). Note any format that wasn't caught, and whether `pk_live_…`,
`sb_publishable_…` or `AC…` Twilio SIDs were (wrongly) highlighted.

_Answer:_

### 6. In ChatGPT, did protected messages send correctly? Any "blocked" or "too long" cases that felt wrong?

With **Test replace mode ON**, send messages with fake emails, phones, cards, keys and passwords.

_Answer (sent correctly with placeholders?):_

_Answer (anything blocked or "too long" that shouldn't have been?):_

---

## Main checks

Write ✅ or ❌ in the Result column.

| #   | Check                              | Expected                                      | Result |
| --- | ---------------------------------- | --------------------------------------------- | ------ |
| 1   | `pnpm test`                        | all tests pass, coverage ≥ 90%                |        |
| 2   | `pnpm typecheck`                   | no errors                                     |        |
| 3   | Playground samples                 | highlights match the M7 table                 |        |
| 4   | 10k chars + 500 terms              | under 30 ms                                   |        |
| 5   | ChatGPT replace mode               | placeholders like `[EMAIL_1]` arrive          |        |
| 6   | Warn-only message                  | sent unchanged                                |        |
| 7   | Production build                   | no `playground.html`, no SafeAI log lines     |        |

## Anything else I noticed

-
