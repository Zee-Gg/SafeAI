<!--
  Phase 4 plan for SafeAI for Teams: real values back on screen, and an encrypted placeholder
  memory that survives browser restarts. Short and high-level on purpose (your M1 rule).
-->

# SafeAI — Phase 4 Plan

> Status: **Approved** (2026-11-20). Work in progress.

## 1. Goal

After sending, SafeAI should feel invisible:

- ChatGPT's replies, and your own sent messages, show the **real values again on your screen**.
- Placeholder memory **survives browser restarts**, encrypted, for a limited time.
- ChatGPT itself still only ever receives placeholders.

## 2. How it works (the flow)

1. **Sending (unchanged from Phase 3).** You review and send. The content script builds
   placeholders such as `[EMAIL_1]` and sends the new ones to the service worker.
2. **Storing.** The service worker encrypts the conversation's placeholder memory and saves it
   in the extension's own **IndexedDB**. Nothing is stored unencrypted.
   - Each conversation is one encrypted record (AES-GCM, a fresh random IV every time it's
     written).
   - The key is a **non-extractable** Web Crypto key, kept in the same IndexedDB. Chrome can
     use it, but no code (not even ours) can read the raw key out.
   - Next to each record, only non-secret details are kept in plain form: the conversation key
     and when it was last used.
   - With **retention 0**, the Phase 3 memory-only store is used instead (wiped when the
     browser closes).
3. **Reply arrives.** The content script asks the service worker (through the same strict
   Phase 3 sender checks) for the **current conversation's** memory. It keeps it in its own
   memory while you are in that chat, and drops it when you switch chats.
4. **Restoring.** A watcher on ChatGPT's message list finds placeholders in **message text
   only** and shows the real value in their place. That covers your sent messages, finished
   replies and replies that are still streaming. It runs again after:
   - a page reload;
   - a chat switch;
   - ChatGPT redrawing a message.

   Details:
   - The longest placeholders are matched first, so `[EMAIL_10]` is never read as `[EMAIL_1]` + "0".
   - Each restored value has a subtle dotted underline and the tooltip _"Restored on your device
     by SafeAI"_.
   - Input boxes, editable areas and the edit-message box are **never** touched.

5. **Copying.** ChatGPT's own copy button still copies placeholders (it reads ChatGPT's data,
   not the screen). Replies containing restored values get our small **"Copy with real
   values"** button, which shows "Copied".
6. **Badge.** When a reply has finished (it stops changing for a moment), the badge briefly
   shows "Restored N items".
7. **Cleanup.**
   - Once an hour (`chrome.alarms`), and whenever the service worker starts, conversations not
     used for longer than the retention period are deleted.
   - "Clear placeholder memory" in the popup (now for everyone, with a confirmation) deletes
     everything immediately.
8. **If decrypting ever fails.**
   - Placeholders stay exactly as they are (never guess).
   - The popup shows a small notice offering to clear the memory.
   - Only a count and a time are recorded, never values.

## 3. How a value is shown on screen (the delicate part)

ChatGPT is a React app. Extensions that **remove or move** React's own text often crash the
chat or make React duplicate text. So:

- **We never remove or move ChatGPT's own elements.** In ChatGPT's own text node we only cut
  out the placeholder, and we insert our own small element in its place.
- When ChatGPT changes that text again (streaming, redraws), we undo our change and redo it on
  the new text.
- **Our element shows the value inside a closed Shadow DOM.** ChatGPT's page scripts see an
  empty element. They can't read the real value through the page (`textContent`, `innerText`),
  only you see it. This keeps the rule "real values only in the vault and on your screen" as
  tight as a browser allows.
- **Side effect:** selecting reply text by hand and pressing Ctrl+C may copy it **without** the
  restored values. That's what "Copy with real values" is for.
- **Speed:** changes are collected and handled once per animation frame, and only for message
  elements that actually changed. Placeholders are found with one search pattern for the whole
  conversation.

## 4. Decisions (one-line reasons)

| Decision                                                                                          | Reason                                                                                           |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Vault in the extension's own IndexedDB, used only by the service worker                           | Web pages and content scripts can't open it; it survives restarts                                |
| AES-GCM with a non-extractable key stored in the same IndexedDB                                   | Records can't be read from disk or backups outside this browser profile; no password to remember |
| One encrypted record per conversation, fresh random IV per write                                  | Simple, safe AES-GCM use; cleanup works per conversation without decrypting                      |
| Retention counted from **last use**, default 7 days, 0–30                                         | Active chats keep working; idle ones expire                                                      |
| Retention 0 = Phase 3 memory-only store                                                           | What you asked for; keeps the Phase 3 behaviour as an option                                     |
| Shortening retention takes effect at the next cleanup; changing it to 0 empties the vault at once | The stricter setting should win quickly                                                          |
| The service worker reads the retention from the policy itself                                     | It never trusts a retention value sent in a message                                              |
| Only permission added: `alarms`                                                                   | The hourly cleanup; nothing else changes                                                         |
| Move Phase 3 data into the vault once, then delete the old session records                        | Nothing lost on update; no unencrypted leftovers                                                 |
| Decryption failure → leave placeholders, popup notice                                             | Showing the wrong value is worse than showing a placeholder                                      |
| Restore only inside ChatGPT's message elements; skip inputs, `contenteditable` and the edit box   | Real values must never reach anything that could be sent                                         |
| Never remove/move ChatGPT's nodes; show values in our own closed Shadow DOM element               | Don't break React, and keep real values away from ChatGPT's page scripts                         |
| Longest placeholder first, one combined pattern                                                   | Correct `[EMAIL_10]` vs `[EMAIL_1]`; fast on long chats                                          |
| Only the **current** conversation's values are in the content script                              | The smallest possible amount of real data in the page process                                    |
| Our own "Copy with real values" button, shown only when something was restored                    | ChatGPT's button can't know the values; no extra clutter otherwise                               |
| No new automated tests                                                                            | Your rule: you test by hand; existing checks keep passing                                        |

## 5. Privacy and safety (additions to Phase 3)

- Real values exist only in the **encrypted vault** and in **what you see on screen**. While you
  are in a chat, that chat's values are also in the content script's memory; that's unavoidable,
  because it has to draw them on screen. They are never logged, never sent anywhere, and never
  written to unencrypted storage (not `chrome.storage.local`, not the page's storage).
- **What the encryption does NOT do:** it protects the records on disk (files, backups, other
  programs reading the profile folder). It cannot protect against malware running as you
  inside Chrome. No browser-only design can.
- Restored values never enter an editable area, so they can never be sent by accident.
- "Copy with real values" puts real values on your clipboard, but only when you click it.

## 6. Milestones

| #      | What gets built                                                                                                                                   | What you check by hand                                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **M1** | This plan                                                                                                                                         | Read it, answer section 7, approve                                                                         |
| **M2** | Encrypted vault, `mappingRetentionDays` in the policy (+ Playground override), hourly cleanup, Phase 3 → vault migration, decryption-failure flag | Placeholders stay stable after a browser restart; retention 0 behaves like Phase 3; cleanup and Clear work |
| **M3** | On-screen restoring: streaming, reload, chat switching, redraws, agreed variations, never in editable areas                                       | Real values appear in replies and sent messages; ChatGPT's edit/copy/regenerate/scroll still work          |
| **M4** | "Copy with real values", "Restored N items" badge, popup (retention sentence, Clear for everyone with confirmation, decryption notice)            | Copy result, badge, popup texts                                                                            |
| **M5** | Light/dark design check, final checks run by you, no values logged or stored unencrypted, LEARNING Phase 4, DECISIONS, `phase-4-notes.md`         | Run the final commands, read the docs                                                                      |

## 7. Questions for you

1. **Variations.** Your `phase-3-notes.md` is still empty, so I have no data on how ChatGPT
   changes placeholders. I propose restoring only these clear variations, and only when the
   label **and** number match a placeholder this chat really has:

   | ChatGPT wrote                                                   | Restored as                   |
   | --------------------------------------------------------------- | ----------------------------- |
   | `[EMAIL_1]`                                                     | the value                     |
   | `EMAIL_1` (no brackets, as a whole word, capitals)              | the value                     |
   | `[ EMAIL_1 ]`, `[EMAIL 1]`, `[EMAIL-1]`                         | the value                     |
   | `[Email_1]`, `[email_1]` (case changed, brackets kept)          | the value                     |
   | `[EMAIL]` (number missing), `Email 1` (no brackets and changed) | **not** restored, too unclear |

   OK, or should I add or remove any?

2. **Content-script memory.** Showing values on screen requires the current chat's values in
   the content script's memory, as described in section 5. Do you approve?
3. **Retention from last use** (a chat you keep using never expires), or from the **first**
   time a value was stored?
4. **The hint line** (`(Note: keep any [LABEL_n] placeholders…)`) is visible in your own sent
   messages. Should Phase 4 hide it there on screen? It's display only: ChatGPT still receives
   it.
5. **Closed Shadow DOM display** (section 3), including the side effect on copying by hand. Do
   you approve?

## 8. Your answers (2026-11-20)

Approved as proposed:

1. **Variations:** exactly the list in question 1.
2. **Content-script memory:** approved, current chat only.
3. **Retention** counts from the **last use**.
4. **The hint line** stays visible in sent messages. No proposal was made, and hiding it wasn't
   part of your brief.
5. **Closed Shadow DOM display:** approved, including the copy side effect.

## 9. As built

### M2 — Encrypted vault

- **Policy:** `mappingRetentionDays` (0–30, default 7). The Playground has a "Keep placeholder
  memory for N days" field, included in the dev override. An override saved before Phase 4 has no
  such field, so it's ignored until saved again.
- **The vault:**
  - The extension's own IndexedDB `safeai-vault` holds a `keys` store (one non-extractable
    AES-GCM 256 key) and a `records` store (one encrypted record per conversation, plus its
    `lastUsedAt`).
  - Every write uses a fresh random IV, with the conversation key as "additional data".
  - Reading a conversation updates `lastUsedAt` (retention from last use).
- **Never guess:**
  - A record that can't be decrypted is never overwritten.
  - The worker replies "Placeholder memory unreadable", so the message is **not sent**. The badge
    says "Placeholder memory can't be read — not sent. Open SafeAI's popup".
  - A count and a time (no values) are saved for the popup notice, which comes in M4.
- **Choosing the store:** retention 0 uses the Phase 3 session store; anything else, the vault.
  The service worker reads the retention from the policy itself.
- **Maintenance** runs at start-up, every hour (`chrome.alarms`, re-created if Chrome dropped it)
  and, in dev, when the Playground policy changes:
  1. It moves everything into the active store and empties the other one. That's also the
     **one-time Phase 3 → vault migration**, and what happens when you switch between 0 and
     more than 0 days.
  2. It deletes vault conversations not used for longer than the retention period.

  Memory requests wait until any running maintenance has finished.

- **Clear placeholder memory** empties both stores and resets the notice. It is still in the
  dev tools card; it moves to everyone in M4.
- **Permissions:** `storage`, `alarms`.
