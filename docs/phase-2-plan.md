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
always in the ORIGINAL text), `RawDetection` (a Detection without `action`), `Detector`
(`id`, `categories`, `regexes`, `detect(text, ctx)`), `DetectorContext` (policy, custom-term
matcher, helpers), `DetectOptions` (`timeBudgetMs`, default 500), `DetectResult`
(`detections`, `countsByCategory`, `durationMs`, `complete`).

**`engine.ts`**

- `detect(text, policy, options?)`: the 7 steps in section 3. Empty text gives an empty result
  with `complete: true`. **It never throws.** Each detector runs inside a try/catch, so one
  failing detector can't break the others. A failure gives `complete: false` and (dev only) the
  failing detector's id in `failedDetectors`, never the text.

**`chunking.ts`**

- `splitIntoChunks(text, size, overlap)` → `{ text, offset }[]`. Chunks of 20,000 characters
  overlapping by 500. **Approved refinement:** each cut moves back to the nearest whitespace
  within the **last 200 characters** of the chunk, so a token is less likely to be cut in half.
  If there's no whitespace there, it cuts at the normal place (the 500-character overlap still
  covers it).
- `dedupeAcrossChunks(detections)`: removes identical findings (same category, start, end)
  that were found twice in an overlap.

**`context.ts`**

- `prepareContext(policy)`: builds the custom-term matcher and the list of enabled detectors.
- Cached by `policy.version` + a quick hash of `customTerms` (and the other policy fields), so
  changing terms rebuilds it, while repeated `detect()` calls reuse it.
- `clearContextCache()`: for tests.

**`overlap.ts`**

- `resolveOverlaps(detections)`: when two findings overlap, the winner is decided by these
  rules, in order:
  1. action `block` beats everything;
  2. custom-term (business) categories beat built-in ones;
  3. higher confidence beats lower;
  4. longer match beats shorter;
  5. earlier start wins.
- Exact duplicates are removed. Findings that don't overlap anything are left alone.

### packages/detection: utils

| File              | Functions                                                                                                                                                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `luhn.ts`         | `passesLuhn(digits)`: the card checksum (catches typos and random numbers)                                                                                                                                                        |
| `iban.ts`         | `isValidIban(iban)`: known country + exact length (SWIFT registry) + mod-97 checksum; `compactIban(iban)` removes spaces and uppercases                                                                                           |
| `entropy.ts`      | `shannonEntropy(s)`: "randomness" in bits per character                                                                                                                                                                           |
| `normalize.ts`    | `normalizeTerm(term)`; `normalizeForMatching(text)` → `{ normalized, indexMap, sourceLength }`; `toOriginalRange(map, start, end)` maps a match back (includes the whole original character if NFKC expanded it, e.g. "ﬁ" → "fi") |
| `boundaries.ts`   | `isWordChar(char)` (Unicode letters/digits/accent marks/underscore); `isWholeWordMatch(text, start, end)` (handles emojis)                                                                                                        |
| `match.ts`        | `matchAll(regex, text, group?)`: runs a regex with the `d` flag, gives exact start/end of the whole match or of one capture group                                                                                                 |
| `aho-corasick.ts` | Only if chosen in M5: `buildAutomaton(terms)`, `search(text)`                                                                                                                                                                     |

`normalizeForMatching` lowercases, applies Unicode NFKC, and collapses every run of whitespace
(spaces, tabs, line breaks) into one space. It keeps `indexMap[i]` = the position in the
ORIGINAL text of normalized character `i`. Tests cover extra spaces, line breaks, emojis
(which take 2 "characters" in JavaScript) and Urdu/Arabic text.

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

### credit-card (`credit-card.ts`), high

- **How:** 13–19 digits with optional spaces/dashes between groups, then **Luhn** and a **known
  prefix** check (Visa 4; Mastercard 51–55, 2221–2720; Amex 34/37; Discover 6011/65/644–649;
  UnionPay 62; JCB 3528–3589; Diners 36/38/300–305).
- **Catches:** `4242 4242 4242 4242`, `5555-5555-5555-4444`, `378282246310005`
- **Must NOT catch:** `1234 5678 9012 3456` (fails Luhn), tracking numbers, order numbers

### bank-account (`bank-account.ts`)

- **IBAN (high):** 2 letters + 2 check digits + 11–30 letters/digits, spaces allowed; must
  pass mod-97. Catches `GB82 WEST 1234 5698 7654 32`. Must NOT catch `GB00 WEST 1234 5698 7654 32`
  (bad checksum).
- **Account number (medium):** only after "account number", "acct", "a/c", "account no",
  "IBAN", followed by 8–20 digits. **Only the number** is caught. Catches
  `Account number: 0123456789` → `0123456789`. Must NOT catch `account 2024 summary`.

### national-id (`national-id.ts`), only for countries in `policy.nationalIdCountries`

| Country     | Candidate                                         | Validator                                                                                     | Confidence                                                                                      |
| ----------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| PK CNIC     | `12345-1234567-1` or 13 digits                    | 13 digits, no leading 0 in the 5-digit area part                                              | dashed: medium; plain: medium near "CNIC / NIC / ID card / identity card" (≤30 chars), else low |
| US SSN      | `123-45-6789`                                     | area ≠ 000, 666, 900–999; group ≠ 00; serial ≠ 0000                                           | medium                                                                                          |
| UK NINO     | `AB 12 34 56 C` (spaces optional)                 | no D, F, I, Q, U, V in either letter; no O second; not BG, GB, KN, NK, NT, TN, ZZ; suffix A–D | medium                                                                                          |
| AE Emirates | `784-1990-1234567-1` (dashes optional), 15 digits | starts with 784                                                                               | medium                                                                                          |

- **Must NOT catch:** `000-12-3456`, `666-12-3456`, `QQ 12 34 56 A`, `785-…`, any ID when its
  country is switched off.

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

### jwt (`jwt.ts`), high, **runs on the whole text**

- **Why whole text:** JWTs are often 800–1,500 characters, so one could cross a chunk border.
- **How:** three base64url parts separated by dots, the first two starting with `eyJ`. The regex
  has **no nested quantifiers**: each part is one flat `[A-Za-z0-9_-]+`, and a lookbehind makes
  a match start only at the beginning of a token. Every character is examined a fixed number of
  times, so it stays linear even on a megabyte of text.
- **Catches:** a JWT built at runtime in the tests from fake parts.
- **Must NOT catch:** `eyJ` on its own, two-part strings, `version.1.2`.

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

- **Must NOT catch (public by design):** Stripe `pk_live_` / `pk_test_`, Supabase
  `sb_publishable_`, Twilio Account SID (`AC` + 32 hex). Tests prove this, with a comment saying
  why.

### password (`password.ts`), high, value only

- **How:** `password | passwd | pwd | pass | passcode | pin`, then `:` or `=` (optional
  quotes), then the value.
- **Catches:** `password: Hunter2!` → `Hunter2!`; `DB_PASSWORD=abc123` → `abc123`;
  `"password": "secret"` → `secret`
- **Must NOT catch:** `forgot password?`, `password reset link`, `the password field`

### token-url (`token-url.ts`), high, secret part only

- **How:** inside URLs, the **values** of query parameters named token, access_token,
  refresh_token, id_token, auth, key, api_key, apikey, secret, sig, signature, code, session,
  sessionid, X-Amz-Signature, X-Amz-Credential, X-Amz-Security-Token; and the `user:password`
  part of `https://user:pass@host`.
- **Catches:** `https://x.com/cb?code=TEST_CODE_VALUE&state=1` → only `TEST_CODE_VALUE`
- **Must NOT catch:** `https://x.com/?page=2`, the host or path of any URL

### secret-entropy (`secret-entropy.ts`), catches random-looking leftovers

- **Candidates:** 20+ characters of letters/digits/`+/=_-`, with at least one letter and one
  digit.
- **Scores:** entropy ≥ 3.5 → medium; ≥ 4.0 **and** near key/secret/token/auth/apikey/credential
  → high; hex-only strings of 32/40/64 characters → low.
- **Skips:** UUIDs, file paths, URLs, letters-only words, base64 images over 500 characters,
  public key formats.
- **Must NOT catch:** `550e8400-e29b-41d4-a716-446655440000`, `src/components/Button.tsx`,
  `internationalization`

### custom-terms (`custom-terms.ts`), high, category from the term

- **How:** Aho-Corasick over `normalizeForMatching(text)`, then a Unicode whole-word check
  (unless `wholeWord: false`), the longest term wins at the same position, and positions are
  mapped back with `indexMap`.
- **Catches** (term `ABC Corp`): `abc corp`, `ABC Corp's`, `ABC⏎Corp` (line break)
- **Must NOT catch:** `ABC Corporation` (unless that is also a term)

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

### address (`address.ts`), low by design

- **How:** number + up to 4 words + Street/St/Road/Rd/Avenue/Ave/Lane/Ln/Boulevard/Blvd/Drive/
  Block/Sector/Phase/Town/Colony; `House #12, Street 5` style; UK postcodes; US "State ZIP"
  (`NY 10001`); 5-digit codes only next to a city / "postal code" word.
- **Catches:** `221B Baker Street`, `House #12, Street 5`, `SW1A 1AA`, `NY 10001`
- **Must NOT catch:** `Road map`, `Phase 2 of the project`, `Block quote`

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

---

## 10. Milestones and what you check by hand

After each milestone: changed files + test results + **complete manual steps**, then one git
commit (pushed), then I wait for "continue".

| #       | What gets built                                                                                             | What you check                                                            |
| ------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **M0**  | This plan                                                                                                   | Read it, answer section 12, approve                                       |
| **M1**  | categories + policy; detection scaffold; Vitest + coverage; ESLint regexp + purity rules; all utils + tests | `pnpm test`, `pnpm typecheck`, `pnpm lint` pass; open the coverage report |
| **M2**  | types, engine, chunking, time budget, context cache, overlap, registry, email detector                      | Tests pass; a tiny script prints detections for a sample                  |
| **M3**  | phone (+ bundle size), credit-card, bank-account, national-id                                               | Tests pass; bundle size numbers reported                                  |
| **M4**  | api-key patterns (with sources), password, token-url, secret-entropy; public-key tests                      | Tests pass; `git push` not blocked by GitHub push protection              |
| **M5a** | Evaluate the Aho-Corasick libraries → **stop for your decision**                                            | Choose: library or our own                                                |
| **M5b** | custom-terms, person-name, address                                                                          | Tests pass                                                                |
| **M6**  | Corpora + precision/recall; regex-safety; benchmarks (incl. 5,000 terms); coverage; bundle size; tuning     | Read the numbers; **30 ms target met**                                    |
| **M7**  | Detection Playground (dev-only) + popup link                                                                | Paste samples, see highlights; production build has no Playground         |
| **M8**  | test-redact, new content-script flow, message schema, popup card; delete test-transform                     | Real ChatGPT tests: redact, block, too long, warn                         |
| **M9**  | LEARNING Phase 2, DECISIONS, phase-2-notes template, plan synced; final checks                              | Read docs; run the final commands                                         |

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
