<!--
  Phase 2 plan for SafeAI for Teams: the detection engine.
  This is the single source of truth for what Phase 2 builds. If the code changes, this file changes too.
-->

# SafeAI — Phase 2 Plan

> Status: **Approved** (2026-11-18, with the changes recorded in section 12). Work in progress.
> Last updated: 2026-11-18

---

## 1. Goal and "done when"

**Goal:** build `packages/detection`, a fast, safe, well-tested engine. It takes **text + a
policy** and returns a list of the sensitive items it found: **where** they are, **what kind**,
**how confident** it is, and **what the policy says to do** with each one.

**Phase 2 is done when:**

1. `pnpm test` passes with **90%+ line and branch coverage** on `packages/detection`, and
   `pnpm typecheck` passes.
2. The benchmark shows **10,000 characters + 500 custom terms in under 30 ms**. We also report
   the time with **5,000 terms**.
   _Changed after M5 (your choice):_ no benchmark test file. You measure this by hand in the
   Playground: its summary bar shows the time in ms, and "Generate 5,000 test terms" loads
   5,000 terms. Type a few more characters after generating, so the shown time is a cached
   scan and not the one-time preparation.
3. The **Detection Playground** page (dev-only) lets you paste text and see every detection
   highlighted.
4. In ChatGPT, with **Test replace mode ON**, the extension uses the **real engine** instead of
   the Phase 1 email-only test.

**Not in this phase:** review panel, stable placeholders across a conversation, restoring
replies, Claude/Gemini, login, server.

**How we split the work:** you do all the testing in the browser. I write and run the automated
tests (Vitest), and after every milestone I give you complete, numbered steps for what to check
by hand.

---

## 2. Decisions (with a one-line reason each)

Everything from Phase 1 still applies (pnpm workspaces, strict TypeScript with no `any`, ESLint
flat config + Prettier, Tailwind v4 tokens, WXT, Developer mode in Chrome).

| Decision                                       | Reason                                                                                        |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Vitest + @vitest/coverage-v8**               | Fast, works with Vite and TypeScript out of the box, and has built-in coverage and benchmarks |
| **90% lines + branches on detection**          | The engine guards private data, so almost every code path must be proven by a test            |
| **`pnpm typecheck` stays a separate step**     | Vitest strips types without checking them, so type errors would slip through otherwise        |
| **libphonenumber-js with "max" metadata**      | Strict validation (real number ranges per country) plus number types; about 145 kB            |
| **Aho-Corasick for custom terms**              | Finds thousands of terms in one pass over the text; library vs our own is decided in M5       |
| **Token URLs: only the secret part**           | The rest of the URL is useful to the AI; only the token or password is sensitive              |
| **National IDs = candidate regex + validator** | The regex finds "ID-shaped" text cheaply; the validator rejects impossible numbers            |
| **4 ID countries, each switchable**            | PK, US, UK, AE, our first markets; a company can turn off the ones it doesn't need            |
| **ReDoS protection in layers**                 | No single tool catches every slow regex, so several cheap layers back each other up           |
| **Public keys are NOT secrets**                | Stripe `pk_`, Supabase `sb_publishable_` and Twilio `AC…` SIDs are designed to be public      |
| **The engine is pure**                         | No DOM, chrome, fetch or logging. It can run anywhere, is easy to test, and can't leak data   |

### What the current docs said (checked 2026-11-18)

| Library                 | Version | What I found                                                                                                                                                                                   |
| ----------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| vitest / coverage-v8    | 5.1.0   | Current major is 5. Both packages must be the same version. Needs Node 22.12+ or 24. **Pinned to 5.1.0:** 5.1.1 came out today and pnpm's supply-chain rule blocks very new releases.          |
| libphonenumber-js       | 1.13.16 | Import from `libphonenumber-js/max`. `findPhoneNumbersInText(text, { defaultCountry })` is a port of Google's `PhoneNumberMatcher` and returns `startsAt` / `endsAt`.                          |
| eslint-plugin-regexp    | 3.3.3   | Flat config: `regexpPlugin.configs.recommended`. Needs ESLint ≥ 9.38 (we have 9.39.5).                                                                                                         |
| safe-regex2             | 5.1.2   | `safe(regex, { limit })` returns true/false. The README warns it has false positives AND negatives, so it's a basic check only.                                                                |
| recheck                 | 4.6.2   | A much stronger ReDoS checker. Installs native binaries or a JS fallback. We try it in M6 and **ask you** before keeping it if it's heavy.                                                     |
| WXT dev-only pages      | 0.21.5  | `manifest.include` / `manifest.exclude` filter by **browser**, not by dev/production. We'll remove the page in production with the `entrypoints:resolved` hook and **check the build output**. |
| `@remusao/aho-corasick` | —       | **Not found on npm.**                                                                                                                                                                          |
| `ahocorasick`           | 1.0.2   | Last release **June 2022** (more than 2 years ago), CommonJS only. M5 will very likely propose our own implementation, and I'll stop and ask.                                                  |

**API key formats** are checked against each provider's official docs in **M4**, and every
pattern gets its source link in a comment (your rule 7).

---

## 3. What the engine does, explained simply

```
text + policy
   │
   ▼
1. PREPARE (once per policy, cached)  → which detectors are on, custom-term "search machine"
   │
   ▼
2. CHUNK  → long text is cut into 20,000-character pieces that overlap by 500 characters
   │
   ▼
3. DETECT → each enabled detector scans each chunk and returns "raw" findings
   │         (positions are shifted back so they point into the ORIGINAL text)
   ▼
4. ACTIONS → each finding gets the policy's action: redact / block / warn
   │          (categories set to "allow" are dropped)
   ▼
5. CLEAN UP → duplicates from chunk overlaps removed, then overlapping findings resolved
   │           (e.g. an API key that also looks "random" keeps only the better label)
   ▼
6. OUTPUT → findings sorted by position + counts per category + time taken + "complete?"
```

Throughout, a **time budget** (default 500 ms) is checked between detectors and between
chunks. If it runs out, the engine stops and says `complete: false`. The extension then
**refuses to send** the message.

---

## 4. Folder structure (new and changed)

```
packages/shared/src/
├─ categories.ts          NEW: all data categories, their groups, labels and placeholder names
├─ policy.ts              NEW: policy shape (Zod) + DEFAULT_POLICY
├─ messages.ts            CHANGED (M8): intercept record gains countsByCategory, durationMs, complete
└─ index.ts               CHANGED: re-exports the new files

packages/detection/       NEW PACKAGE
├─ package.json           scripts: test (with coverage), test:watch (no coverage), coverage, bench, typecheck
├─ tsconfig.json          strict; NO "DOM" library, so DOM code doesn't even compile
├─ vitest.config.ts       test settings + 90% coverage threshold
├─ src/
│  ├─ index.ts            the public front door: detect() + types
│  ├─ clock.ts            now(): performance.now() (own tiny type, no DOM lib), else Date.now()
│  ├─ types.ts            Detection, RawDetection, Confidence, Detector, DetectOptions, DetectResult
│  ├─ engine.ts           detect()
│  ├─ chunking.ts         splitIntoChunks(), dedupeAcrossChunks()
│  ├─ context.ts          prepareContext() + cache
│  ├─ overlap.ts          resolveOverlaps()
│  ├─ utils/              luhn, iban, entropy, normalize, boundaries, match (+ aho-corasick if chosen in M5)
│  └─ detectors/          index (registry) + one file per detector
├─ tests/                 utils/, detectors/, engine, chunking, overlap, regex-safety, corpus
└─ bench/detect.bench.ts  speed tests

apps/extension/
├─ entrypoints/playground/   NEW, DEV-ONLY: index.html, main.tsx, App.tsx
├─ src/content/test-redact.ts      NEW (temporary, Phase 2 only)
├─ src/content/test-transform.ts   DELETED in M8
├─ entrypoints/chatgpt.content/index.tsx   CHANGED (M8): uses the real engine
├─ entrypoints/popup/App.tsx       CHANGED: category counts, timing, Playground link (dev only)
└─ wxt.config.ts                   CHANGED (M7): removes the Playground from production builds

Root: package.json gains `test`; eslint.config.js gains eslint-plugin-regexp + purity rules.
```

---

## 5. Every file: purpose and functions

Every file starts with a 2–4 line plain-English comment. Every exported function has a one-line
comment. **Every regex has a comment** saying in plain words what it matches.

### packages/shared

**`categories.ts`**

- `DETECTOR_CATEGORIES`: the 16 categories (email, phone, person_name, address, api_key,
  password, secret, credit_card, bank_account, national_id, token_url, client_name,
  company_name, project_name, internal_system, custom_term).
- `DetectorCategory` type; `CategoryGroup` type (`personal | secrets | financial | business`).
- `CATEGORY_GROUP`: category → group (see section 7).
- `CATEGORY_LABEL`: display names ("Email", "API key", "National ID"…).
- `PLACEHOLDER_LABEL`: email→EMAIL, phone→PHONE, person_name→PERSON, address→ADDRESS,
  api_key→API_KEY, password→PASSWORD, secret→SECRET, credit_card→CARD, bank_account→BANK,
  national_id→ID, token_url→TOKEN, client_name→CLIENT, company_name→COMPANY,
  project_name→PROJECT, internal_system→SYSTEM, custom_term→TERM.
- `CUSTOM_TERM_CATEGORIES` + `CustomTermCategory`: the 5 business categories a custom term can
  have; `isCustomTermCategory(category)` checks one (used by the overlap rules).

**`policy.ts`**

- `RuleAction`: `"redact" | "block" | "warn" | "allow"`, plus its Zod schema.
- `PolicySchema` (Zod) + `Policy` type: `version`, `rules` (one per category: action +
  allowUserOverride), `customTerms` (term, category, wholeWord), `nationalIdCountries`,
  `defaultPhoneCountry`.
- `DEFAULT_POLICY` (section 7).
- Also exported: `RuleSchema`/`Rule`, `CustomTermSchema`/`CustomTerm`, `NATIONAL_ID_COUNTRIES` /
  `NationalIdCountry`.

### packages/detection: core

**`clock.ts`** (built in M1): `createClock(source)` builds a clock from wherever `performance`
might live; `now()` = `performance.now()` if present, else `Date.now()`.

**`types.ts`**: `Confidence`, `Detection` (`id = "category:start:end"`, end exclusive, positions
always in the ORIGINAL text), `RawDetection` (a Detection without `id` **and** `action`),
`DetectorScope` (`"chunk" | "fullText"`), `Detector` (`id`, `categories`, `regexes`, optional
`scope`, `detect(text, ctx)`), `DetectorContext` (policy, plus the custom-term matcher from M5),
`DetectOptions` (`timeBudgetMs`, default 500), `DetectResult` (`detections`,
`countsByCategory`, `durationMs`, `complete`, `failedDetectors`).

_As built (M2):_ `RawDetection` leaves out `id` as well as `action`. A detector only knows
positions inside its chunk, so the engine builds the id **after** shifting positions back to the
original text, which means a wrong, chunk-relative id can never exist. `failedDetectors` is always
present (an empty list when all is well). It holds detector **ids only**, never text, so it's
safe in every build.

**`engine.ts`**

- `detect(text, policy, options?)`: the 7 steps in section 3. Empty text gives an empty result
  with `complete: true`. **It never throws.** Each detector runs inside a try/catch, so one
  failing detector can't break the others. A failure gives `complete: false` and the failing
  detector's id in `failedDetectors`, never the text. Anything else that fails (e.g. a malformed
  policy) gives `complete: false` with `failedDetectors: ["engine"]`.
- `runDetection(text, policy, detectors, options?)`: the same, with a chosen detector list.
  Used by tests to plug in fake (e.g. crashing) detectors; not exported from `index.ts`.
- Positions a detector reports outside its text are dropped, and `value` is always re-read from
  the original text.
- `DEFAULT_TIME_BUDGET_MS = 500`. The front door (`index.ts`) exports only `detect`,
  `DEFAULT_TIME_BUDGET_MS` and the types.
- **Changed in M5 (found in your test run):** the time budget is counted from **after** the
  policy is prepared. Preparation (e.g. building the matcher for 5,000 custom terms) happens
  once and is cached. Counting it made the first call with a big policy stop before scanning
  anything, which in ChatGPT would have meant a wrongly refused message. `durationMs` still
  reports the total time, preparation included.

**`chunking.ts`**

- `splitIntoChunks(text, size, overlap)` → `{ text, offset }[]`. Chunks of 20,000 characters
  overlapping by 500. **Approved refinement:** each cut moves back to the nearest whitespace
  within the **last 200 characters** of the chunk, so a token is less likely to be cut in half.
  If there's no whitespace there, it cuts at the normal place (the 500-character overlap still
  covers it).
- `dedupeAcrossChunks(detections)`: removes identical findings (same category, start, end)
  that were found twice in an overlap.
- _As built (M2):_ the cut goes **just after** the whitespace. With no whitespace, the cut never
  splits an emoji (a 2-unit character) in half. Settings that couldn't make progress
  (size ≤ overlap + snap window) throw a `RangeError`, which can only be a programming mistake.
  Constants: `CHUNK_SIZE`, `CHUNK_OVERLAP`, `SNAP_WINDOW`.

**`context.ts`**

- `prepareContext(policy, detectors)`: builds the custom-term matcher (M5) and the list of
  enabled detectors.
- Cached by `policy.version` + a quick hash of `customTerms` (and the other policy fields), so
  changing terms rebuilds it, while repeated `detect()` calls reuse it.
- `clearContextCache()`: for tests.
- _As built (M2):_ **two cache levels**. (1) The same policy object is found instantly (a
  `WeakMap`). (2) An equal policy built again is found by its key: version + detector ids + the
  length and FNV-1a hash of the policy contents. At most **8** policies are kept; the oldest is
  dropped. `fnv1a(text)` is a fast non-security hash used only for cache keys.

**`overlap.ts`**

- `resolveOverlaps(detections)`: when two findings overlap, the winner is decided by these
  rules, in order:
  1. action `block` beats everything;
  2. custom-term (business) categories beat built-in ones;
  3. higher confidence beats lower;
  4. longer match beats shorter;
  5. earlier start wins.
- Exact duplicates are removed. Findings that don't overlap anything are left alone.
- _As built (M2):_ `compareStrength(a, b)` applies the 5 rules (plus a final tie-break by id, so
  the result never depends on input order). `resolveOverlaps` sorts by strength, then keeps each
  candidate that doesn't touch an already-kept one, found with a **binary search**, so 5,000
  findings take milliseconds. Touching ranges (one ends exactly where the next starts) don't
  count as overlapping.

### packages/detection: utils

| File              | Functions                                                                                                                                                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `luhn.ts`         | `passesLuhn(digits)`: the card checksum (catches typos and random numbers)                                                                                                                                                        |
| `iban.ts`         | `isValidIban(iban)`: known country + exact length (SWIFT registry) + mod-97 checksum; `compactIban(iban)` removes spaces and uppercases                                                                                           |
| `entropy.ts`      | `shannonEntropy(s)`: "randomness" in bits per character                                                                                                                                                                           |
| `normalize.ts`    | `normalizeTerm(term)`; `normalizeForMatching(text)` → `{ normalized, indexMap, sourceLength }`; `toOriginalRange(map, start, end)` maps a match back (includes the whole original character if NFKC expanded it, e.g. "ﬁ" → "fi") |
| `boundaries.ts`   | `isWordChar(char)` (Unicode letters/digits/accent marks/underscore); `isWholeWordMatch(text, start, end)` (handles emojis)                                                                                                        |
| `match.ts`        | `matchAll(regex, text, group?)`: runs a regex with the `d` flag, gives exact start/end of the whole match or of one capture group                                                                                                 |
| `aho-corasick.ts` | **Chosen in M5 (our own):** `buildAutomaton(patterns)`, `searchAll(automaton, text)`                                                                                                                                              |

`normalizeForMatching` lowercases, applies Unicode NFKC, and collapses every run of whitespace
(spaces, tabs, line breaks) into one space. It keeps `indexMap[i]` = the position in the
ORIGINAL text of normalized character `i`. Tests cover extra spaces, line breaks, emojis
(which take 2 "characters" in JavaScript) and Urdu/Arabic text.
_Speed-up (M5):_ plain ASCII characters with no accent after them take a fast path (lowercase
A–Z directly; NFKC leaves ASCII unchanged). Only non-ASCII text goes through the full Unicode
path. The results are identical.

### packages/detection: detectors

**`detectors/index.ts`**: `DETECTORS`, the registry in priority order, and `ALL_DETECTOR_REGEXES`,
every regex for the safety test. Each detector file exports one `Detector` object (details in
section 6).

### packages/detection: tests and benchmark

| File                              | What it proves                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| `tests/fixtures/fake-data.ts`     | All fake values in one place; real-looking tokens are **built at runtime from pieces**     |
| `tests/utils/*.test.ts`           | One file per util                                                                          |
| `tests/detectors/*.test.ts`       | One file per detector: should-catch AND should-not-catch                                   |
| `tests/engine.test.ts`            | Policy actions, "allow" skipped, sorting, timing, time budget, complete flag, never throws |
| `tests/chunking.test.ts`          | Long text; a finding across a chunk border is found exactly once                           |
| `tests/overlap.test.ts`           | Each overlap rule                                                                          |
| `tests/regex-safety.test.ts`      | Every registry regex passes safe-regex2 (and recheck if kept)                              |
| `tests/corpus/realistic.ts`       | ~30 realistic prompts with the exact findings expected                                     |
| `tests/corpus/false-positives.ts` | Text that must NOT trigger anything                                                        |
| `tests/corpus.test.ts`            | Runs both corpora; prints a precision/recall table                                         |
| `bench/detect.bench.ts`           | 1k / 10k / 100k characters × 0 / 500 / 5,000 terms                                         |

### apps/extension

| File                                    | Purpose / functions                                                                                                                                                         |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entrypoints/playground/index.html`     | Page shell for the Playground                                                                                                                                               |
| `entrypoints/playground/main.tsx`       | Loads fonts + styles, mounts `<App />`                                                                                                                                      |
| `entrypoints/playground/App.tsx`        | The Playground (section 9)                                                                                                                                                  |
| `src/content/test-redact.ts`            | `testRedact(text, detections)` → `{ text, replaced, blocked }` (temporary)                                                                                                  |
| `entrypoints/chatgpt.content/index.tsx` | Replace flow uses `detect(text, DEFAULT_POLICY)` (section 8)                                                                                                                |
| `entrypoints/popup/App.tsx`             | Last intercept card shows category counts, time, complete; "Open Detection Playground" link in dev builds only (opens via `browser.tabs.create`, which needs no permission) |

---

## 6. Every detector

Confidence levels: **high** = almost certainly sensitive, **medium** = probably, **low** = maybe.

### email (`email.ts`), high

- **How:** a standard email regex; trailing punctuation is trimmed (`ali@test.com.` → no dot).
- **Catches:** `ali@test.com`, `first.last+tag@sub.example.co.uk`
- **Must NOT catch:** `@username`, `user@localhost`, `logo@2x.png`
- _As built (M2):_
  - A lookbehind lets a match start **only where the name part starts**, so 20,000 letters in a
    row are scanned once, not 20,000 times. A test checks this stays fast.
  - Length limits come from the email rules: name ≤ 64, domain ≤ 253, ending 2–24 letters.
  - After the regex, a check rejects empty or edge-hyphen domain labels and names that start or
    end with a dot or contain `..`, plus image-file endings (png, jpg, jpeg, gif, svg, webp,
    avif, ico, bmp, tiff), none of which are real domains.

### phone (`phone.ts`), high (international) / medium (national)

- **How:** `findPhoneNumbersInText` from `libphonenumber-js/max`, with
  `policy.defaultPhoneCountry`. **Why this and not our own regex:** the docs describe it as a
  port of Google's `PhoneNumberMatcher`, which already finds candidates, handles brackets,
  dashes and spaces, and validates against real number ranges. A home-made regex would be
  weaker and slower. Then **our filters**: keep only valid numbers with 7+ digits; drop ones
  that look like dates, versions, prices, `#order` numbers or card numbers.
- **Catches:** `+92 300 1234567`, `0300-1234567` (PK default), `+1 (415) 555-0132`
- **Must NOT catch:** `2026-11-18`, `2026`, `1.2.3`, `$1,234.56`, `#10023`, `4242 4242 4242 4242`
- **Bundle size:** content-script size reported before and after.
- _As built (M3):_
  - **The library already rejects** dates, years, versions, prices, `#order` numbers, card
    numbers, IP addresses, invoice numbers, timestamps and CNICs (checked with a probe before
    writing the detector). Our filters are a second safety net: a `#` or currency sign/code
    (`$ £ € ¥ Rs PKR USD AED`) just before the number; date shapes; 13–19 digits passing Luhn.
  - Fewer than 7 national digits → skipped. `ruleId` is `phone.international` (high) or
    `phone.national` (medium). `+…` or `00…` counts as international. Extensions
    (`ext. 22`) stay part of the match.
  - **Country codes:** phones use ISO codes (`GB`), while the policy's ID list uses `UK`. If
    `defaultPhoneCountry` isn't a supported phone country, only `+international` numbers are
    found.
  - **Bundle size** (engine bundled and minified like a production build; the content script
    doesn't use the engine until M8):

    | Engine                   | Minified    | Gzip       |
    | ------------------------ | ----------- | ---------- |
    | before libphonenumber-js | 119.1 kB    | 29.5 kB    |
    | after (with "max")       | 399.2 kB    | 92.7 kB    |
    | **added**                | **+280 kB** | **+63 kB** |

    The README's "about 145 kB" is the metadata alone; the rest is the parsing and matching
    code. The file is loaded from disk, not downloaded. The content script is 330 kB today;
    M8 will report its real size once it uses the engine.

### credit-card (`credit-card.ts`), high

- **How:** 13–19 digits with optional spaces/dashes between groups, then **Luhn** and a **known
  prefix** check (Visa 4; Mastercard 51–55, 2221–2720; Amex 34/37; Discover 6011/65/644–649;
  UnionPay 62; JCB 3528–3589; Diners 36/38/300–305).
- **Catches:** `4242 4242 4242 4242`, `5555-5555-5555-4444`, `378282246310005`
- **Must NOT catch:** `1234 5678 9012 3456` (fails Luhn), tracking numbers, order numbers
- _As built (M3):_ the candidate regex has two shapes. **4-4-4-(1–7)** digits covers
  Visa/Mastercard groups and 13–19 digits with no separators. **4-6-(4–5)** covers Amex and
  Diners grouping. The separator must be the **same** every time (one space, one dash or none),
  so `4242 4242-4242 4242` and double spaces are rejected. `cardNetwork(digits)` returns the
  network name, which goes into `ruleId` (e.g. `credit_card.visa`). Tested with Stripe's
  official test numbers for every network.

### bank-account (`bank-account.ts`)

- **IBAN (high):** 2 letters + 2 check digits + 11–30 letters/digits, spaces allowed; must
  pass mod-97. Catches `GB82 WEST 1234 5698 7654 32`. Must NOT catch `GB00 WEST 1234 5698 7654 32`
  (bad checksum).
- **Account number (medium):** only after "account number", "acct", "a/c", "account no",
  "IBAN", followed by 8–20 digits. **Only the number** is caught. Catches
  `Account number: 0123456789` → `0123456789`. Must NOT catch `account 2024 summary`.
- _As built (M3):_
  - **IBAN:** the candidate is 2 capital letters + 2 digits + 11–40 capitals/digits/spaces, and
    only uppercase, as IBANs are officially written. If it ran on into following capital words
    (`… 7654 32 THANKS`), it's trimmed back one space-separated group at a time until it
    validates (`findValidIban`). The validator also checks the exact **length per country**
    from the SWIFT registry.
  - **Account number:** the number may contain single spaces or dashes (`0123 4567 8901`,
    `1234-5678-90`). It must have 8–20 digits and no double separators. Labels also accept
    `acct no`, `a/c no.` and `acct #`.
  - **Safety catch:** eslint-plugin-regexp flagged the first version of the label regex
    (`\s*[#:-]?\s*`) as able to backtrack slowly on long runs of spaces. Rewritten as
    `\s*(?:[#:-]\s*)?`, with a test proving 20,000 spaces stay fast.

### national-id (`national-id.ts`), only for countries in `policy.nationalIdCountries`

| Country     | Candidate                                         | Validator                                                                                     | Confidence                                                                                      |
| ----------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| PK CNIC     | `12345-1234567-1` or 13 digits                    | 13 digits, no leading 0 in the 5-digit area part                                              | dashed: medium; plain: medium near "CNIC / NIC / ID card / identity card" (≤30 chars), else low |
| US SSN      | `123-45-6789`                                     | area ≠ 000, 666, 900–999; group ≠ 00; serial ≠ 0000                                           | medium                                                                                          |
| UK NINO     | `AB 12 34 56 C` (spaces optional)                 | no D, F, I, Q, U, V in either letter; no O second; not BG, GB, KN, NK, NT, TN, ZZ; suffix A–D | medium                                                                                          |
| AE Emirates | `784-1990-1234567-1` (dashes optional), 15 digits | starts with 784                                                                               | medium                                                                                          |

- **Must NOT catch:** `000-12-3456`, `666-12-3456`, `QQ 12 34 56 A`, `785-…`, any ID when its
  country is switched off.
- _As built (M3):_
  - The PK validator checks that the first digit is a **province code 1–7** (stricter than "no
    leading 0").
  - **Timestamps vs plain CNICs:** a plain 13-digit number that **starts with 1 and has no CNIC
    word nearby** is skipped, because millisecond timestamps (`1731974400000`) look exactly like
    that, and the policy would redact them. With context (`CNIC: 1…`) it's still caught
    (medium).
  - NINOs are matched in capitals only, as they're officially written.
  - Exported validators: `validatePkCnic`, `validateUsSsn`, `validateUkNino`,
    `validateAeEmiratesId`. `ruleId`s: `national_id.pk_cnic`, `national_id.pk_cnic_plain`,
    `national_id.us_ssn`, `national_id.uk_nino`, `national_id.ae_emirates_id`.
  - Test IDs are **assembled at runtime from pieces** (`tests/fixtures/fake-data.ts`), so no
    complete ID-shaped value is written in the source.

### api-key (`api-key-patterns.ts` + `api-key.ts`), high

A **data table** of `{ provider, ruleId, regex, sourceUrl }`. Each format is checked against the
provider's current docs in M4, and the link goes in `sourceUrl`.

| Provider         | Formats (verified in M4)                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------- |
| OpenAI           | `sk-proj-…`, `sk-svcacct-…`, `sk-admin-…`, legacy `sk-…`                                  |
| Anthropic        | `sk-ant-…`                                                                                |
| Stripe           | secret `sk_live_` / `sk_test_`, restricted `rk_live_` / `rk_test_`                        |
| GitHub           | `ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`, `github_pat_`                                     |
| AWS              | access key ID `AKIA` / `ASIA` + 16; secret key (40 chars) **only near AWS context words** |
| Google           | `AIza` + 35                                                                               |
| Slack            | `xoxb-`, `xoxp-`, `xoxo-`, `xoxs-` (+ `xoxa-`, `xoxr-` if the docs list them)             |
| SendGrid         | `SG.<22>.<43>`                                                                            |
| Twilio           | API key SID `SK` + 32 hex; auth token (32 hex) **only near "twilio" / "auth token"**      |
| Hugging Face     | `hf_…`                                                                                    |
| Supabase         | `sb_secret_…` (JWT-style keys are caught by the JWT rule)                                 |
| JWT              | **own detector `jwt.ts`, whole-text scope** (see below)                                   |
| PEM private keys | **own detector `private-key.ts`, whole-text scope, no regex** (see below)                 |

_As built (M4), formats checked against the sources on 2026-11-19:_

| Provider     | ruleId                          | Pattern used                                                        | Source (in the code)                                 |
| ------------ | ------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------- |
| OpenAI       | `api_key.openai`                | `sk-proj-` / `sk-svcacct-` / `sk-admin-` + 20–300                   | OpenAI API reference (admin keys); no formal spec    |
| OpenAI       | `api_key.openai_legacy`         | `sk-` + 20 + `T3BlbkFJ` marker + 20                                 | GitHub secret-scanning list                          |
| Anthropic    | `api_key.anthropic`             | `sk-ant-` + 20–300                                                  | platform.claude.com (docs examples `sk-ant-api03-…`) |
| Stripe       | `api_key.stripe`                | `sk_live_` `sk_test_` `rk_live_` `rk_test_` **`sk_org_`** + 10–250  | docs.stripe.com/keys                                 |
| GitHub       | `api_key.github`                | `ghp_ gho_ ghu_ ghs_ ghr_` + exactly 36                             | GitHub engineering blog (token formats)              |
| GitHub       | `api_key.github_pat`            | `github_pat_` + 22 + `_` + 59                                       | GitHub secret-scanning list                          |
| AWS          | `api_key.aws_access_key_id`     | `AKIA`/`ASIA` + 16                                                  | AWS IAM identifiers page                             |
| AWS          | `api_key.aws_secret_access_key` | 40 base64-style chars **only after** aws_secret / secret access key | AWS access-keys page                                 |
| Google       | `api_key.google`                | `AIza` + 35                                                         | Google Cloud API keys page (its example key)         |
| Slack        | `api_key.slack`                 | `xoxb- xoxp- xoxo- xoxs- xoxe- xoxe.xapp- xapp- xwfp-`              | docs.slack.dev/authentication/tokens                 |
| SendGrid     | `api_key.sendgrid`              | `SG.` + 22 + `.` + 43 (= 69 chars, matches Twilio's stated length)  | Twilio SendGrid API keys page                        |
| Twilio       | `api_key.twilio_api_key`        | `SK` + 32 hex (official `^SK[0-9a-fA-F]{32}$`)                      | Twilio Key resource reference                        |
| Twilio       | `api_key.twilio_auth_token`     | 32 hex **only after** "twilio" / "auth token"                       | Twilio API keys page                                 |
| Hugging Face | `api_key.huggingface`           | `hf_` + 30–100                                                      | huggingface.co/docs/hub/security-tokens              |
| Supabase     | `api_key.supabase_secret`       | `sb_secret_` + 20–200                                               | supabase.com/docs/guides/api/api-keys                |

- **Changes from the brief:**
  - Slack's current docs list `xoxb- xoxp- xapp- xoxe.xapp- xwfp-`, but **not** `xoxa-`/`xoxr-`, so those are left out. `xoxo-`/`xoxs-` are kept because the brief named them (older tokens can still be in use).
  - Stripe organization keys (`sk_org_`) were added because Stripe's docs list them as secret.
  - OpenAI publishes no formal key format, so the legacy `sk-` rule requires the `T3BlbkFJ` marker, so it doesn't fire on any word that starts with `sk-`.
- Every regex may only **start where a token starts** (a lookbehind), so a long run of letters is scanned once.
- Context-only rows (AWS secret, Twilio auth token) look for their context words in the **60 characters before** the value.
- **Public keys** live in `PUBLIC_KEY_PREFIXES` + `TWILIO_ACCOUNT_SID` + `isPublicKey()`, documented with the reason. The entropy detector skips them too.
- **Test values** are all assembled at runtime from pieces (`fakeChars()` in `tests/fixtures/fake-data.ts`). The AWS ones are AWS's own documentation example values, also split into pieces.

### jwt (`jwt.ts`), high, **runs on the whole text**

- **Why whole text:** JWTs are often 800–1,500 characters, so one could cross a chunk border.
- **How:** three base64url parts separated by dots, the first two starting with `eyJ`. The regex
  has **no nested quantifiers**: each part is one flat `[A-Za-z0-9_-]+`, and a lookbehind makes
  a match start only at the beginning of a token. Every character is examined a fixed number of
  times, so it stays linear even on a megabyte of text.
- **Catches:** a JWT built at runtime in the tests from fake parts.
- **Must NOT catch:** `eyJ` on its own, two-part strings, `version.1.2`.
- _As built (M4):_ each of the first two parts needs at least 10 characters after `eyJ`; the
  signature may be empty (unsigned tokens). Category `api_key`, `ruleId` `api_key.jwt`. A test
  feeds 200,000 characters with no dots to prove it stays fast, and another puts a
  1,200-character JWT across a chunk border to prove it's found once.

### private-key (`private-key.ts`), high, **runs on the whole text, no regex at all**

- **Why whole text:** PEM blocks are usually 1,500–3,500 characters, far longer than the
  500-character chunk overlap.
- **How (guaranteed linear):** plain string search. `indexOf("-----BEGIN")`, check that the same
  line ends with `PRIVATE KEY-----`, then `indexOf` for the matching
  `-----END … PRIVATE KEY-----`. The search always moves forward, so it can never loop.
- **BEGIN without END:** must not hang. It's still detected (confidence high), from BEGIN to the
  end of that **line block**: the first empty line, or the end of the text.
- **Tests:** a key crossing a chunk border is found once; a BEGIN with no END; `PUBLIC KEY`
  and `CERTIFICATE` blocks are NOT caught.
- _As built (M4):_
  - The label is read from `-----BEGIN ` up to the next `-----`, so it also works for keys
    pasted inside JSON on one line with `\n` escapes. Labels longer than 40 characters are
    ignored.
  - Accepted labels end in `PRIVATE KEY` (PRIVATE KEY, RSA, EC, DSA, OPENSSH, ENCRYPTED) **or
    `PRIVATE KEY BLOCK`** (PGP private keys: an addition, the same kind of secret).
  - The matching END must use the **same label**. A different label counts as "no END".
  - A block never runs past the **next BEGIN**, so two keys can't merge. The END search only
    looks between this BEGIN and the next one; those stretches never overlap, so the whole scan
    stays linear even with thousands of BEGIN lines (tested: 5,000).
  - With no END, the block runs to the first empty line, else the next BEGIN, else the end of
    the text (a trailing `\r` is left out). Category `api_key`, `ruleId` `api_key.private_key`.
    `isPrivateKeyLabel(label)` is exported for tests.

- **Must NOT catch (public by design):** Stripe `pk_live_` / `pk_test_`, Supabase
  `sb_publishable_`, Twilio Account SID (`AC` + 32 hex). Tests prove this, with a comment saying
  why.

### password (`password.ts`), high, value only

- **How:** `password | passwd | pwd | pass | passcode | pin`, then `:` or `=` (optional
  quotes), then the value.
- **Catches:** `password: Hunter2!` → `Hunter2!`; `DB_PASSWORD=abc123` → `abc123`;
  `"password": "secret"` → `secret`
- **Must NOT catch:** `forgot password?`, `password reset link`, `the password field`
- _As built (M4):_
  - **Two regexes:** a quoted value (`"…"` / `'…'`, may contain spaces) and an unquoted value
    (stops at whitespace, quotes, `,` `;` `&`, for connection strings and query strings). If
    both match at the same place, the quoted one wins.
  - The label must not be glued to letters before it (`bypass`, `spin` don't count), but
    `DB_PASSWORD` and `user.password` do.
  - **Skipped values:** shorter than 3 characters; settings words (true, false, null, none, nil,
    undefined, required, optional, string, yes, no, empty); placeholders starting with
    `$ { < % *` (`${DB_PASS}`, `{{ … }}`, `<your password>`, `****`); code that _reads_ a
    password (`process.env…`, `getenv(…)`, anything with `(`).

### token-url (`token-url.ts`), high, secret part only

- **How:** inside URLs, the **values** of query parameters named token, access_token,
  refresh_token, id_token, auth, key, api_key, apikey, secret, sig, signature, code, session,
  sessionid, X-Amz-Signature, X-Amz-Credential, X-Amz-Security-Token; and the `user:password`
  part of `https://user:pass@host`.
- **Catches:** `https://x.com/cb?code=TEST_CODE_VALUE&state=1` → only `TEST_CODE_VALUE`
- **Must NOT catch:** `https://x.com/?page=2`, the host or path of any URL
- _As built (M4):_
  - URLs are `http://` or `https://` (up to 2,048 characters), with trailing sentence
    punctuation trimmed. Parameters are split on `&` or `;`, and names are compared in lowercase.
  - **Also the `#fragment`**, for the OAuth implicit flow (`#access_token=…`).
  - `user:password@` counts only with a `:` and a non-empty password (`user@host` alone is
    skipped), and `@` in the path never counts.
  - `ruleId`s: `token_url.<parameter name>` and `token_url.credentials`.

### secret-entropy (`secret-entropy.ts`), catches random-looking leftovers

- **Candidates:** 20+ characters of letters/digits/`+/=_-`, with at least one letter and one
  digit.
- **Scores:** entropy ≥ 3.5 → medium; ≥ 4.0 **and** near key/secret/token/auth/apikey/credential
  → high; hex-only strings of 32/40/64 characters → low.
- **Skips:** UUIDs, file paths, URLs, letters-only words, base64 images over 500 characters,
  public key formats.
- **Must NOT catch:** `550e8400-e29b-41d4-a716-446655440000`, `src/components/Button.tsx`,
  `internationalization`
- _As built (M4):_
  - **`=` only at the end** of a candidate (at most two, base64 padding), so
    `SECRET_KEY=abc…` splits into the name and the value. `/` is not part of a candidate, so
    paths and URLs break apart; the surrounding word is then checked.
  - The surrounding word (at most 300 characters each way) is skipped if it contains `://`
    (URL) or looks like a file path: it starts with `/ ./ ../ ~/ C:\`, contains `\`, or has a
    `/` and ends in a file extension.
  - **Context** = key/secret/token/auth/credential in the **40 characters before**.
  - **Hex strings after hash words** (commit, sha…, hash, md5, checksum, digest) are skipped,
    so git hashes and checksums aren't flagged (the false-positive corpus in M6 checks this).
    Other hex lengths are skipped too.
  - Big base64 = over 500 characters with `base64,` just before it.
  - `ruleId`s: `secret.entropy` (medium/high) and `secret.hex` (low).
  - **Speed fix (found in your M4 test run):** with 1,500 candidates in one long word, each
    candidate re-walked up to 600 characters. Now the cheap checks run first, the surrounding
    word is looked up only for candidates that would be reported, the last word is reused while
    the next candidate is still inside it, and whitespace is checked by character code (no
    regex).
- **Speed tests (all detectors):** inputs are built **before** the stopwatch starts, and the
  limit is a generous 2,000 ms. These tests guard against runaway (quadratic) slowness, which
  takes seconds; with coverage on and 21 test files running in parallel, tight limits failed
  randomly. Real speed numbers come from the M6 benchmarks.

### custom-terms (`custom-terms.ts`), high, category from the term

- **How:** Aho-Corasick over `normalizeForMatching(text)`, then a Unicode whole-word check
  (unless `wholeWord: false`), the longest term wins at the same position, and positions are
  mapped back with `indexMap`.
- **Catches** (term `ABC Corp`): `abc corp`, `ABC Corp's`, `ABC⏎Corp` (line break)
- **Must NOT catch:** `ABC Corporation` (unless that is also a term)
- _As built (M5):_
  - **Matcher decision (M5a, your choice): our own Aho-Corasick** in `utils/aho-corasick.ts`.
    `@remusao/aho-corasick` doesn't exist on npm; `ahocorasick` was last released in Nov 2018
    (no types, CommonJS only). `modern-ahocorasick` (maintained, typed) was considered, but we'd
    still have to wrap it for positions, longest match and whole words.
  - `buildAutomaton(patterns)`: a trie keyed by UTF-16 code, failure links built breadth-first,
    and "output links" (the nearest node that ends a pattern) so outputs are never copied.
    `searchAll(automaton, text)` returns `{ start, end, pattern }` for every occurrence,
    overlapping ones included, in one pass.
  - `prepareCustomTerms(terms)` normalizes the terms, drops empty ones, keeps the **first** of any
    duplicates, builds the automaton, and returns `null` when there's nothing to search. The
    context (`context.ts`) calls it **once per policy**, so 5,000 terms are built once and cached.
  - The detector maps each match back with `toOriginalRange`, does the whole-word check on the
    **original** text, keeps the longest term per start position, and leaves other overlaps to
    the engine. `ruleId`: `custom_term.<category>`.
  - `DetectorContext` gained an optional `customTerms` (the prepared matcher).

### person-name (`person-name.ts`), context only, name only

| Pattern                                                               | Confidence |
| --------------------------------------------------------------------- | ---------- |
| Mr/Mrs/Ms/Miss/Dr/Prof/Sir + 1–3 capitalised words                    | medium     |
| `name:` / `name =` / `full name:` + 1–4 capitalised words             | medium     |
| Dear/Hi/Hello/Hey at line start + 1–3 capitalised words, until , or ⏎ | low        |
| Regards, / Thanks, / Best, / Sincerely, / Cheers, + name on next line | low        |

- Ignores team, all, everyone, there, guys, sir, madam, folks, friends after greetings.
- **Catches:** `Dr. Ayesha Khan` → `Ayesha Khan`; `Hi Sarah,` → `Sarah`
- **Must NOT catch:** `Hi team,`, `Hello there`, capitalised words without context
- _As built (M5):_
  - **Regexes find only the trigger** (title, label, greeting, sign-off); a small reader
    (`readNameWords`) then collects the capitalised words. A regex like "1–3 capitalised words"
    would need a repeated group of repeated characters, the nested-quantifier shape that
    slow-regex checkers reject.
  - Name words may contain letters, accents, `'`, `’` and `-` (`O'Neil`, `Al-Khan`). A possessive
    `'s` ends the name (`Smith's report` → `Smith`). Names never continue across a line break.
  - **Greetings** must be followed by `,`, `!` or the end of the line (`Hi Sarah and the team` →
    skipped). When the first word is a title (`Dear Mr Khan,`), the title rule reports the name.
  - **Labels:** `name`/`full name` must not be glued to letters (`username:` doesn't count), and
    are skipped after company, business, file, user, project, host, domain, display, product,
    brand, app, account, bank, street, city, field, variable (e.g. `Company name:`).
  - **Sign-offs** also accept Best/Kind/Warm regards and Thank you. "The" was added to the
    not-a-name list (`Thanks,⏎The Team`).
  - `ruleId`s: `person_name.title`, `.label`, `.greeting`, `.sign_off`.

### address (`address.ts`), low by design

- **How:** number + up to 4 words + Street/St/Road/Rd/Avenue/Ave/Lane/Ln/Boulevard/Blvd/Drive/
  Block/Sector/Phase/Town/Colony; `House #12, Street 5` style; UK postcodes; US "State ZIP"
  (`NY 10001`); 5-digit codes only next to a city / "postal code" word.
- **Catches:** `221B Baker Street`, `House #12, Street 5`, `SW1A 1AA`, `NY 10001`
- **Must NOT catch:** `Road map`, `Phase 2 of the project`, `Block quote`
- _As built (M5):_
  - **Street:** a flat regex finds the street word (capitalised; only St/Rd/Ave/Ln/Blvd may take
    a dot). Code then walks **back** over 1–4 capitalised words to a house number (`221B`, `12`)
    on the same line. "Drive" is included, but "Dr" is not (it's a title for names).
  - Street words followed by map, maps, quote, quotes, diagram, chain or test are skipped (`Road
map`, `Block quote`). `Phase 2 of …` is skipped because the number comes **after** the word.
  - **Labelled 5-digit codes:** after postal code / post code / postcode / zip (code), or after
    a major Pakistani or UAE city (Lahore, Karachi, Islamabad, Rawalpindi, Faisalabad, Multan,
    Peshawar, Quetta, Sialkot, Hyderabad, Dubai, Sharjah). **Only the code** is caught.
  - UK postcodes and US state codes are matched in capitals only.
  - `ruleId`s: `address.street`, `.house_street`, `.uk_postcode`, `.us_zip`, `.postal_code`.

---

## 7. Default policy

| Category         | Group     | Action     | Placeholder |
| ---------------- | --------- | ---------- | ----------- |
| email            | personal  | **redact** | EMAIL       |
| phone            | personal  | **redact** | PHONE       |
| person_name      | personal  | warn       | PERSON      |
| address          | personal  | warn       | ADDRESS     |
| national_id      | personal  | **redact** | ID          |
| api_key          | secrets   | **redact** | API_KEY     |
| password         | secrets   | **redact** | PASSWORD    |
| secret (entropy) | secrets   | warn       | SECRET      |
| token_url        | secrets   | **redact** | TOKEN       |
| credit_card      | financial | **redact** | CARD        |
| bank_account     | financial | **redact** | BANK        |
| client_name      | business  | **redact** | CLIENT      |
| company_name     | business  | **redact** | COMPANY     |
| project_name     | business  | **redact** | PROJECT     |
| internal_system  | business  | **redact** | SYSTEM      |
| custom_term      | business  | **redact** | TERM        |

- `allowUserOverride: true` for all. `customTerms: []`. `nationalIdCountries: ["PK","US","UK","AE"]`.
  `defaultPhoneCountry: "PK"`. `version: 1`.
- **Note for Phase 2:** "warn" has no UI until Phase 3, so in ChatGPT warn items are **sent
  unchanged** for now. They are counted in the popup and highlighted in the Playground.

---

## 8. Safety layers

| #   | Layer                         | What it stops                                                                                                                                                                                        |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **eslint-plugin-regexp**      | Risky or wrong regex patterns, flagged while typing (`recommended` config)                                                                                                                           |
| 2   | **regex-safety test**         | Every registry regex must pass safe-regex2 (and recheck, if kept after M6)                                                                                                                           |
| 3   | **Chunked scanning**          | Per-chunk regexes never run on more than 20,000 characters at once. The only whole-text regex is the flat, linear JWT one (see below).                                                               |
| 4   | **Time budget (500 ms)**      | If detection runs long, it stops and reports `complete: false`                                                                                                                                       |
| 5   | **"Not complete → not sent"** | The extension never sends a message it couldn't fully check                                                                                                                                          |
| 6   | **Purity rules**              | In `packages/detection`: ESLint `no-restricted-globals` (window, document, chrome, browser, fetch, localStorage, XMLHttpRequest, navigator…) + `no-console` + a tsconfig **without the DOM library** |

### Which detectors run on the whole text, and why (approved)

Most detectors run **per chunk**. Three run **once over the whole text** (`scope: "fullText"` on
the detector), because the things they find can be longer than the 500-character overlap, or
because chunking would add nothing:

| Detector          | Why whole text                                                    | Why it's still safe                                                          |
| ----------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `private-key.ts`  | PEM blocks are 1,500–3,500 characters                             | No regex at all: only forward `indexOf` searches                             |
| `jwt.ts`          | JWTs are often 800–1,500 characters                               | Flat regex, no nested quantifiers, matches start only at a token's beginning |
| `custom-terms.ts` | Aho-Corasick is one linear pass; chunks would only add duplicates | Not a regex; time grows with text length, not with the number of terms       |

The time budget is still checked before and after each whole-text detector.

### Extension flow (M8)

```
result = detect(text, DEFAULT_POLICY)
if !result.complete          → NOT sent · badge "Message too long to check safely — not sent"
else if any "block"          → NOT sent · badge "Not sent: contains <category label>"
else if testRedact replaced>0 → write text → verify → allowNextSubmit → send
                                · badge "Protected 3 items (2 emails, 1 API key)"
else                          → send normally
Phase 1 rule kept: if writing the text fails → NOT sent.
```

`testRedact` replaces "redact" findings with `[LABEL_n]` (the same value gets the same number in
one message), working **from the end of the text backwards** so earlier positions stay correct.
"warn" findings are left as they are. LOG_INTERCEPT gains `countsByCategory`, `durationMs`,
`complete`. Still **no text and no values**.

---

## 9. Playground page design (dev only)

```
┌──────────────────────── SafeAI · Detection Playground (dev) ────────────────────────┐
│ INPUT                                   │ RESULTS                                    │
│ [Load sample ▾]          1,234 chars    │ 7 found · 3.2 ms · ✓ complete              │
│ ┌─────────────────────────────────────┐ │ [Email 2] [API key 1] [Phone 1] …          │
│ │ textarea                            │ │ ┌────────────────────────────────────────┐ │
│ │                                     │ │ │ text with coloured highlights          │ │
│ └─────────────────────────────────────┘ │ │ (dashed border = low confidence;       │ │
│ ▸ Settings                              │ │  hover = category, confidence, rule,   │ │
│   Phone country [PK ▾]                  │ │  action)                               │ │
│   National IDs ☑PK ☑US ☑UK ☑AE          │ └────────────────────────────────────────┘ │
│   Custom terms (term | category)        │ value · category · confidence · action ·   │
│   [Generate 5,000 test terms]           │ rule · position   (table)                  │
│   Actions per category [redact ▾] …     │ Empty: "No sensitive data found"           │
│   [Reset to default]                    │                                            │
└─────────────────────────────────────────┴────────────────────────────────────────────┘
```

- Two columns, stacking on narrow screens. Results update live as you type (debounced
  150 ms).
- Highlight colours use the **category group** tokens: personal violet, secrets red, financial
  amber, business blue.
- Design tokens everywhere; visible focus rings; every control has a label.
- Settings live only in memory (no storage). The page is **removed from production builds**
  (checked in M7 and in the final checks).
- _As built (M7):_
  - **Files:** `entrypoints/playground/index.html`, `main.tsx`, `App.tsx`, plus
    **`samples.ts`** (5 realistic samples written for the Playground, since the M6 corpus was
    skipped). All values are fake; keys and IDs are assembled at runtime.
  - **Removed from production:** a WXT `entrypoints:resolved` hook in `wxt.config.ts` deletes
    the `playground` entrypoint when `mode === 'production'`. WXT's `include`/`exclude` only
    filter by browser.
  - **Popup link:** "Open Detection Playground ↗" in the footer, only when
    `import.meta.env.DEV` (so the code is removed from production). It opens a tab with
    `browser.tabs.create`, which needs no permission.
  - **Custom terms box:** one per line, `term | category` (category optional, default
    `custom_term`). Lines with an unknown category are counted and shown as "invalid".
    "Generate 5,000 test terms" fills it with `Test Term 0001 | client_name` …
  - **Phone country list:** PK, US, GB, AE, SA, IN, CA, AU, DE (phones use `GB`, not `UK`).
  - **Results:** a summary bar (count, ms, complete/incomplete, any failed detectors, category
    chips); the text with `<mark>` highlights (group colour, dashed border = low confidence,
    hover = category · confidence · rule · action); and a table.
  - The policy object only changes when a setting changes, so the engine's cache keeps each
    keystroke fast.
  - The extension now depends on `@safeai/detection` (a workspace link).

---

## 10. Milestones and what you check by hand

After each milestone: changed files + **the exact commands for you to run** (tests, typecheck,
lint, build) with the expected output + complete manual steps, then I wait for "continue".

**Changed in M4 (your request):** I write the code, including the test files, but **I don't run
tests or checks**. You run them all. Once you confirm they pass ("continue"), I make that
milestone's one git commit, push it, and start the next milestone.

| #       | What gets built                                                                                             | What you check                                                               |
| ------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **M0**  | This plan                                                                                                   | Read it, answer section 12, approve                                          |
| **M1**  | categories + policy; detection scaffold; Vitest + coverage; ESLint regexp + purity rules; all utils + tests | `pnpm test`, `pnpm typecheck`, `pnpm lint` pass; open the coverage report    |
| **M2**  | types, engine, chunking, time budget, context cache, overlap, registry, email detector                      | Tests pass; the verbose test list shows what each detector catches and skips |
| **M3**  | phone (+ bundle size), credit-card, bank-account, national-id                                               | Tests pass; bundle size numbers reported                                     |
| **M4**  | api-key patterns (with sources), password, token-url, secret-entropy; public-key tests                      | Tests pass; `git push` not blocked by GitHub push protection                 |
| **M5a** | Evaluate the Aho-Corasick libraries → **stop for your decision**                                            | Choose: library or our own                                                   |
| **M5b** | custom-terms, person-name, address                                                                          | Tests pass                                                                   |
| **M6**  | **SKIPPED after M5 (your choice): no new test files.** Tuning happens in code from what you find in the Playground | —                                                              |
| **M7**  | Detection Playground (dev-only) + popup link                                                                | Paste samples, see highlights; production build has no Playground            |
| **M8**  | test-redact, new content-script flow, message schema, popup card; delete test-transform                     | Real ChatGPT tests: redact, block, too long, warn                            |
| **M9**  | LEARNING Phase 2, DECISIONS, phase-2-notes template, plan synced; final checks                              | Read docs; run the final commands                                            |

---

## 11. Risk questions for `docs/phase-2-notes.md`

1. Which false alarms did I see in the Playground with my own real-world text? (Describe the
   kind; never paste real data.)
2. Which real sensitive items were missed?
3. How noisy are names and addresses? Should they stay "warn"?
4. What time was shown for a very long paste (e.g. a full document) and for 5,000 custom terms?
5. Did any API key format fail to match, or did any public key get flagged?
6. In ChatGPT, did protected messages send correctly? Any "blocked" or "too long" cases that
   felt wrong?

---

## 12. Questions asked in M0, and your answers (2026-11-18)

1. **Packages:** ✅ install `vitest`, `@vitest/coverage-v8`, `libphonenumber-js`,
   `eslint-plugin-regexp`, `safe-regex2`. Try `recheck` in M6 and **ask before keeping it**.
2. **Whole-text scope:** ✅ for custom terms and PEM keys, **plus JWT** (often 800–1,500
   characters). The JWT regex must have no nested quantifiers. PEM keys are found with **plain
   `indexOf` string search, no regex**, with tests for a key crossing a chunk border and a BEGIN
   with no END (detected to the end of its line block, confidence high, no hang). Documented in
   section 8 and in the code.
3. **Chunk cuts:** ✅ move back to the nearest whitespace within the **last 200 characters**; if
   there's none, cut normally.
4. **No DOM library in the detection tsconfig:** ✅. **Timing choice:** both. A tiny type
   declaration plus a runtime fallback, **both inside `clock.ts`**. It declares the one thing we
   need (`{ now(): number }`) and reads `performance` from `globalThis` (sub-millisecond
   precision, needed to prove the 30 ms target; `Date.now()` only counts whole milliseconds). If
   `performance` doesn't exist, it falls back to `Date.now()`, so timing can never crash.
   _Changed in M1:_ a separate global `env.d.ts` would clash with the Node types that Vitest
   brings into the test type-check, so the declaration lives locally in `clock.ts`.
5. **`pnpm test` runs with coverage + the 90% threshold:** ✅. **`pnpm test:watch` runs without
   coverage** for fast feedback while working.
6. **"Warn" items sent unchanged in Phase 2:** ✅ shown only in the Playground and counted in
   the popup.
