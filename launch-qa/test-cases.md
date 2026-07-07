# Ask Bantoo — Launch QA Test Cases

**Scope:** Transaction-extraction Ask Bantoo (`BantooCommand` modal → `/api/bantoo/extract` → `resolveExtraction` → `executeBantooAction`).  
**Not in scope:** Migration wizard Q&A drawer (`AskBantooDrawer` → `wizard-assistant.ts`).

**Verification legend**

| Method | Meaning |
|--------|---------|
| **RT-UNIT** | Verified by automated unit/integration tests (341 tests pass in `ledger/`) |
| **RT-PROBE** | Verified by tracing `parseCommandText` / `ruleBasedExtract` logic on sample inputs |
| **CODE** | Code-path analysis only; live AI/UI not exercised |

**Result legend:** Pass / Fail / N/A (not applicable — feature unsupported by design)

---

## 1. Intent Recognition

Supported Bantoo action types (`lib/ai/actions.ts`): `add_inventory_item`, `receive_stock`, `supplier_purchase`, `customer_payment`, `expense`, `sales_receipt`, `unknown`.

| Test ID | Category | Input / prompt | Expected behavior | Actual behavior | Status | Method |
|---------|----------|----------------|-------------------|-----------------|--------|--------|
| INT-001 | intent | Add customer John Doe | Recognize intent to create a customer contact (or guide user to Customers form) | Rule parser: `unknown`; AI schema has no standalone “add customer” action | **Fail** | RT-PROBE |
| INT-001a | intent | Create customer Acme Corp | Same as INT-001 | `unknown` (rule path) | **Fail** | CODE |
| INT-002 | intent | Add supplier Adamou Trading | Recognize supplier creation | Rule parser: `unknown`; no standalone supplier action | **Fail** | RT-PROBE |
| INT-002a | intent | New supplier: Douala Grains | Same as INT-002 | `unknown` | **Fail** | CODE |
| INT-003 | intent | Record receipt 50000 from Elhaji | `customer_payment` with amount + customer | Rule parser: `unknown` (“receipt” ≠ “receive/received” regex) | **Fail** | RT-PROBE |
| INT-003a | intent | Received 50000 from Elhaji | `customer_payment` | Rule: `create_receipt` → `customer_payment`, amount 50000, party Elhaji | **Pass** | RT-UNIT (variant in fallback.test) |
| INT-004 | intent | Record payment 45000 to Adamou for fuel | Payment out → `expense` or supplier payment | Rule: `create_payment` → `expense`, amount 45000, supplier Adamou | **Pass** | RT-PROBE |
| INT-004a | intent | Paid 45,000 for tire change | `expense` | Rule: `expense`, amount 45000 | **Pass** | RT-UNIT |
| INT-005 | intent | Create invoice for Acme 100000 | Sales or purchase invoice intent | Rule: `unknown`; AI may map to `supplier_purchase` or `unknown` depending on wording | **Fail** (rule) / **N/A** (no sales invoice action) | CODE |
| INT-005a | intent | Supplier invoice from Adamou 120000 XAF | `supplier_purchase` | AI prompt instructs invoice photos → `supplier_purchase`; rule path `unknown` without payment/receive keywords | **Partial** | CODE |
| INT-006 | intent | Goods receipt 150 bags rice from Adamou | `receive_stock` | Rule: `unknown` (needs “Received/reçu/stock” keyword, not “Goods receipt” alone) | **Fail** | RT-PROBE |
| INT-006a | intent | Received 150 bags of rice from Adamou | `receive_stock`, qty 150, supplier Adamou | Rule: `receive_stock`, qty 150 | **Pass** | RT-UNIT |
| INT-007 | intent | Inventory adjustment -10 bags rice | Stock adjustment / write-off | No action type; rule → `unknown` | **N/A** | CODE |
| INT-007a | intent | Adjust inventory rice down by 5 bags | Same | `unknown` | **N/A** | CODE |
| INT-008 | intent | Journal entry debit rent 50000 | Manual journal | No action type; rule → `unknown` | **N/A** | CODE |
| INT-009 | intent | Add new product Peak Milk 400g | `add_inventory_item` | Rule: `unknown`; AI classifies product registration | **Partial** (AI only) | RT-UNIT (extract.test photo path) |
| INT-010 | intent | Cash sale 15000 | `sales_receipt` | Rule: `unknown` (no receipt/payment keyword match) | **Fail** (rule) | CODE |
| INT-011 | intent | Reçu 2 millions de Elhaji Adoum | `customer_payment` (French) | Rule: `create_receipt` → `customer_payment`, amount 2_000_000 | **Pass** | RT-PROBE |
| INT-012 | intent | Payé 45 000 pour changement de pneu | `expense` (French) | Rule: `expense`, amount 45000 | **Pass** | RT-PROBE |
| INT-013 | intent | Received 25 million XAF from Elhaji Adoum | `customer_payment` | Rule + AI fallback tests confirm `customer_payment` | **Pass** | RT-UNIT |
| INT-014 | intent | (AI) supplier invoice photo | `supplier_purchase` | AI system prompt prefers `supplier_purchase` for invoice images | **Pass** | CODE + RT-UNIT (extract schema) |
| INT-015 | intent | asdf qwerty | `unknown`, user prompted to clarify | Rule: `unknown`, confidence 0 | **Pass** | RT-UNIT |

---

## 2. Language Consistency

UI locale via `next-intl` (`messages/en.json`, `messages/fr.json`). AI asked to put `summary` in the user's language (`lib/ai/extract.ts`).

| Test ID | Category | Input / prompt | Expected behavior | Actual behavior | Status | Method |
|---------|----------|----------------|-------------------|-----------------|--------|--------|
| LANG-001 | language | French UI (`document.documentElement.lang=fr`), open Ask Bantoo | All chrome, labels, buttons, errors from `messages/fr.json` | Modal uses `useTranslations("command")` — localized | **Pass** | CODE |
| LANG-002 | language | French UI, low-confidence extraction | “Not sure” banner in French | `t("notSure")` renders French; **also** English warning injected in `proposal.warnings` | **Fail** | CODE |
| LANG-003 | language | French UI, missing supplier on goods receipt | Validation hints in French | `resolve.ts` pushes English strings e.g. “Choose the supplier…” | **Fail** | CODE |
| LANG-004 | language | French UI, pattern-learning hint under quantity | Hint in French | `command-patterns.ts` reasons are English e.g. “Suggested because you usually receive…” | **Fail** | CODE |
| LANG-005 | language | French voice note | Transcription biased to French | Client sends `lang=fr` to `/api/bantoo/transcribe` | **Pass** | CODE |
| LANG-006 | language | French prompt “Reçu 2 millions de Elhaji” | AI `summary` in French | Prompt requires summary in user's language; not runtime-verified without API key | **Partial** | CODE |
| LANG-007 | language | French UI, execute validation error | Error in French | `executeBantooAction` returns English e.g. “Enter the amount received.” | **Fail** | CODE |
| LANG-008 | language | French UI, rate limit on extract | Localized rate-limit message | API returns English; client maps 429 to `t("rateLimited")` (French OK) | **Pass** | CODE |
| LANG-009 | language | French UI, extract API 400 empty input | Localized error | API: English “Type something, take a photo…”; client shows raw `data.error` | **Fail** | CODE |
| LANG-010 | language | English UI, AI fallback note | English fallback banner | `t("aiFallbackNote")` when `aiFallback=true` | **Pass** | CODE |

---

## 3. Entity Extraction

| Test ID | Category | Input / prompt | Expected behavior | Actual behavior | Status | Method |
|---------|----------|----------------|-------------------|-----------------|--------|--------|
| ENT-001 | entity | Received 25 million XAF from Elhaji Adoum | Amount 25_000_000; customer “Elhaji Adoum” | Rule extracts amount + party | **Pass** | RT-UNIT |
| ENT-002 | entity | Paid 45,000 for tire change | Amount 45000; description “Tire Change” | `humanizeDescription` splits glued words | **Pass** | RT-UNIT |
| ENT-003 | entity | Received 150 bags of rice from Adamou | Qty 150, unit bags, item “Rice”, supplier Adamou | Rule parser extracts all | **Pass** | RT-UNIT |
| ENT-004 | entity | Party match “elhaj adom” → “Elhaji Adoum” | Fuzzy match ≥60, auto-select ≥90 | `similarity` + `rankMatches` tests pass | **Pass** | RT-UNIT |
| ENT-005 | entity | Product match “Pampers midi” | Maps to full product name | Subset token match ≥90 | **Pass** | RT-UNIT |
| ENT-006 | entity | Accent-insensitive “Épicerie” vs “Epicerie” | 100 score | normalizeText + similarity | **Pass** | RT-UNIT |
| ENT-007 | entity | Date “today” / “aujourd'hui” in AI path | ISO date in draft | AI prompt maps to injected `today`; rule path leaves null → resolve uses today() | **Pass** | CODE |
| ENT-008 | entity | Amount with “million” modifier | Correct major units | “25 million” → 25_000_000 | **Pass** | RT-UNIT |
| ENT-009 | entity | City in party name “Douala Trading Co” | Preserved in partyName | Passed through to draft.partyName; matcher uses full string | **Pass** | CODE |
| ENT-010 | entity | Barcode on product photo (AI) | barcode field populated | extract.test validates barcode passthrough | **Pass** | RT-UNIT |
| ENT-011 | entity | Quantity vs amount disambiguation “150 bags” vs “150 XAF” | Quantity not parsed as money | `isQuantityNumber` guard in command-parse | **Pass** | CODE |
| ENT-012 | entity | Empty party on goods receipt | Warning to choose supplier | English warning pushed in resolve | **Pass** (function) / **Fail** (i18n) | CODE |

---

## 4. Confidence Scoring

Threshold: `LOW_CONFIDENCE_THRESHOLD = 0.5` (`lib/ai/actions.ts`). UI shows amber “Not sure” when `proposal.lowConfidence`.

| Test ID | Category | Input / prompt | Expected behavior | Actual behavior | Status | Method |
|---------|----------|----------------|-------------------|-----------------|--------|--------|
| CONF-001 | confidence | Received 25 million from Elhaji (rule path) | No “Not sure” banner | Rule confidence 0.75 → `lowConfidence=false` | **Pass** | RT-UNIT + CODE |
| CONF-002 | confidence | Paid 45,000 for tire change (rule path) | No “Not sure” | confidence 0.75 | **Pass** | RT-UNIT |
| CONF-003 | confidence | Received 150 bags of rice from Adamou (rule) | No “Not sure” | confidence 0.75 | **Pass** | RT-UNIT |
| CONF-004 | confidence | Gibberish input | “Not sure” or unknown action guidance | confidence 0 → `lowConfidence=true` | **Pass** | RT-UNIT |
| CONF-005 | confidence | Malformed AI JSON | Safe unknown, low confidence | confidence 0, action unknown | **Pass** | RT-UNIT |
| CONF-006 | confidence | AI returns action with confidence 0.9 | No “Not sure” | `lowConfidence=false` | **Pass** | RT-UNIT (route.test mock) |
| CONF-007 | confidence | AI returns action with confidence 0.3 | “Not sure” shown | resolve sets `lowConfidence=true` | **Pass** | CODE |
| CONF-008 | confidence | Obvious command “Record receipt 50000 from Elhaji” | Should NOT show “Not sure” | Rule returns `unknown`, confidence 0 → **shows “Not sure”** | **Fail** | RT-PROBE |
| CONF-009 | confidence | Entity match score 89 (medium bucket) | Do not auto-select; no false “high” | autoId null unless ≥90 | **Pass** | RT-UNIT |
| CONF-010 | confidence | Pattern boost borderline text 75 + pattern 90 same id | Auto-select after blend | blendEntity → score 93, id selected | **Pass** | RT-UNIT |

---

## 5. Duplicate Detection

| Test ID | Category | Input / prompt | Expected behavior | Actual behavior | Status | Method |
|---------|----------|----------------|-------------------|-----------------|--------|--------|
| DUP-001 | duplicate | Create party “Elhaji Adoum” when exact match exists | Reuse existing contact on save | `ensurePartyId` reuses HIGH match (≥90); createParty skipped | **Pass** | RT-UNIT |
| DUP-002 | duplicate | Create party “Elhaji Adoum” when only distant names exist | Create new party | No HIGH match → `createParty` called | **Pass** | RT-UNIT |
| DUP-003 | duplicate | Name “elhaji adoum” vs stored “Elhaji Adoum” | Duplicate surfaced | findPossiblePartyDuplicates score 100 | **Pass** | RT-UNIT |
| DUP-004 | duplicate | Typo “Elhaj Adom” | Medium+ duplicate candidate | parties.test: score ≥60 | **Pass** | RT-UNIT |
| DUP-005 | duplicate | Phone exact match, different name | Score 100 on phone | findPossiblePartyDuplicates | **Pass** | RT-UNIT |
| DUP-006 | duplicate | Add inventory item matching existing product name (high) | Warn user; suggest receive stock | resolve warns “An item like … already exists” | **Pass** | CODE |
| DUP-007 | duplicate | Barcode collision on add_inventory_item | Warn duplicate barcode | Barcode exact match warning | **Pass** | CODE |
| DUP-008 | duplicate | receive_stock creates item if no match | User can still create near-duplicate item | Allowed by design if user confirms new item | **Pass** | CODE |
| DUP-009 | duplicate | UI shows medium matches before confirm | Dropdown highlights best match | resolveParty returns options with buckets | **Pass** | CODE |

---

## 6. Pattern Learning

Org-scoped history from `lib/command-patterns.ts`, blended in `lib/bantoo/resolve.ts`.

| Test ID | Category | Input / prompt | Expected behavior | Actual behavior | Status | Method |
|---------|----------|----------------|-------------------|-----------------|--------|--------|
| PAT-001 | pattern | “Received rice” (no supplier), history favors Supplier A | Suggest Supplier A | supplierPatternForItem ranks by frequency + recency | **Pass** | RT-UNIT |
| PAT-002 | pattern | Ambiguous “rice” query, history favors 50kg bag | Item disambiguation | itemPatternForQuery selects 50kg item | **Pass** | RT-UNIT |
| PAT-003 | pattern | Resolved item with mode qty 50 | Prefill quantity 50 | quantityPatternForItem mode | **Pass** | RT-UNIT |
| PAT-004 | pattern | Last purchase cost 21,500 XAF | Prefill unit cost 21500 | costPatternForItem uses last not average | **Pass** | RT-UNIT |
| PAT-005 | pattern | Supplier with invoice due-date history | Suggest dueDate offset | paymentTermsPatternForSupplier on supplier_purchase | **Pass** | CODE + RT-UNIT |
| PAT-006 | pattern | Monday delivery history, today is Monday | Supplier score boost | weekdayComponent +10 | **Pass** | RT-UNIT |
| PAT-007 | pattern | Single stale delivery 200 days ago | Low bucket; no auto-fill of values | score 40, bucket low | **Pass** | RT-UNIT |
| PAT-008 | pattern | Org B history must not affect org A | Strict orgId filters | org isolation test passes | **Pass** | RT-UNIT |
| PAT-009 | pattern | Text match 65 + different pattern candidate 95 | Pattern must NOT override | blendEntity keeps text candidate | **Pass** | RT-UNIT |
| PAT-010 | pattern | Confirmed barcode on receive_stock | Skip item pattern blend | resolve skips applyItemPatternBlend when barcode hit | **Pass** | CODE |
| PAT-011 | pattern | customer_payment action | No pattern suggestions | getCommandPatternSuggestions only for receive_stock, add_inventory_item, supplier_purchase | **Pass** | CODE |

---

## 7. Error Messages

| Test ID | Category | Input / prompt | Expected behavior | Actual behavior | Status | Method |
|---------|----------|----------------|-------------------|-----------------|--------|--------|
| ERR-001 | error | Unauthenticated extract request | Clear auth error | 401 “Please sign in again.” | **Pass** | CODE |
| ERR-002 | error | Empty text + no attachments | Actionable prompt | 400 “Type something, take a photo, or record a voice note.” | **Pass** | CODE |
| ERR-003 | error | Image when AI not configured | Clear 503 | AiNotConfiguredError message | **Pass** | CODE |
| ERR-004 | error | Image + AI hard failure | 502 with retry guidance | “temporarily unavailable… type the details as text” | **Pass** | RT-UNIT |
| ERR-005 | error | Text + AI hard failure | Degrade to rule parser | 200 + `aiFallback:true` | **Pass** | RT-UNIT |
| ERR-006 | error | Rate limit exceeded | 429 + Retry-After | Rate limit message; client uses i18n for 429 | **Pass** | CODE |
| ERR-007 | error | AI credits exhausted + image | 402 upgrade message | Test confirms upgrade wording | **Pass** | RT-UNIT |
| ERR-008 | error | Invalid execute payload | Validation error | “Invalid request. Please review…” | **Pass** | CODE |
| ERR-009 | error | receive_stock, qty empty on confirm | Field-specific error | “Enter the quantity received.” | **Pass** | CODE |
| ERR-010 | error | Cross-org itemId on execute | Generic not-found | “That item was not found.” | **Pass** | RT-UNIT |
| ERR-011 | error | Unknown action on execute | Honest limitation | “This action can't be saved automatically yet.” | **Pass** | CODE |
| ERR-012 | error | resolveExtraction throws | Generic 500 | “Sorry, I couldn't read that…” | **Pass** | CODE |
| ERR-013 | error | Unsupported audio format on transcribe | Clear rejection | “Unsupported audio format.” | **Pass** | CODE |
| ERR-014 | error | File too large (>8 MB) | Size limit message | “A file is too large (max 8 MB).” | **Pass** | CODE |
| ERR-015 | error | PDF parse failure | Specific error | “Could not read that PDF.” | **Pass** | CODE |

---

## Summary

| Category | Total | Pass | Fail | N/A / Partial |
|----------|-------|------|------|---------------|
| Intent | 20 | 8 | 7 | 5 |
| Language | 10 | 3 | 6 | 1 |
| Entity | 12 | 11 | 0 | 1 |
| Confidence | 10 | 9 | 1 | 0 |
| Duplicate | 9 | 9 | 0 | 0 |
| Pattern | 11 | 11 | 0 | 0 |
| Error | 15 | 15 | 0 | 0 |
| **Total** | **87** | **66** | **14** | **7** |

**Runtime testing:** 341 automated unit/integration tests executed successfully. Live AI extraction and full UI E2E were **not** run (requires authenticated app + OpenAI key). Rule-parser probes marked **RT-PROBE** were verified by manual trace through `lib/command-parse.ts` and `lib/bantoo/fallback.ts`.
