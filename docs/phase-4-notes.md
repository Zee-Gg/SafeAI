<!--
  Template you fill in while testing Phase 4 (encrypted memory and real values on screen).
  Your answers decide what Phase 5 must improve. NEVER paste real sensitive data here: describe
  the KIND of text instead, and use fake data while testing.
-->

# Phase 4 — testing notes

**Tested by:** _name_ · **Date:** _yyyy-mm-dd_ · **Chrome version:** _(chrome://version)_ ·
**SafeAI commit:** _(`git log --oneline -1`)_

---

## Questions

### 1. Restore accuracy: was any value restored wrongly, or any placeholder left unrestored?

Note what ChatGPT wrote (e.g. `[Email 1]`, `EMAIL-1`, `the first email`) and what you saw.

| ChatGPT wrote | Restored? (✅ / ❌ / wrong value) |
| ------------- | --------------------------------- |
|               |                                   |

### 2. Speed: did restoring ever feel slow, flicker, or lag behind a streaming reply?

Try a long reply with many placeholders, and a chat with 50+ messages.

_Answer:_

### 3. Did ChatGPT break anywhere?

Check copy, edit message, regenerate, scrolling, switching chats, reloading, code blocks, tables.

_Answer:_

### 4. Did "Copy with real values" give exactly the text you expected?

Paste it into a plain text editor. Check paragraphs, lists, code blocks and line breaks.

_Answer:_

### 5. Did memory survive a browser restart, and expire when expected?

_Answer:_

---

## Main checks

| #   | Check                                | Expected                                                  | Result |
| --- | ------------------------------------ | --------------------------------------------------------- | ------ |
| 1   | `pnpm typecheck`                     | no errors                                                 |        |
| 2   | `pnpm lint`                          | no errors                                                 |        |
| 3   | `pnpm format:check`                  | no differences                                            |        |
| 4   | `pnpm test`                          | all tests pass                                            |        |
| 5   | `pnpm build`                         | succeeds; permissions only `storage`, `alarms`            |        |
| 6   | Production: no logging / no override | no `[SafeAI]`, no `devPolicyOverride` in the built files  |        |
| 7   | Vault in DevTools                    | `records` data unreadable bytes; key `extractable: false` |        |
| 8   | Light and dark mode                  | restored values, copy button and badge look right in both |        |

## Anything else I noticed

-
