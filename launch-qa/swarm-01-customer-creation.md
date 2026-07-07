# Ask Bantoo Reliability Swarm — Track 1: Customer Creation Agent — Findings

Repo state tested: HEAD `de87013` ("Fix Ask Bantoo create_customer field persistence and duplicate-save behavior"), on top of `012175a` + `57589fb` (the prior duplicate-safety sprint). No source files were modified — this is a read-only investigation plus one new test file.

## Summary

| # | Command | Result |
|---|---|---|
| 1 | "Add Musa as a customer." | ✅ PASS |
| 2 | "Add Musa as a customer in Garoua." | ✅ PASS |
| 3 | Full complex (English) — Atlas Agro Trading Ltd | ⚠️ PASS except `country` (see Bug #1) |
| 4 | Full complex (French) — same, in French | ⚠️ PASS except `country` (see Bug #1) |
| 5 | Persistence trap — Test Non Default Customer | ✅ PASS |
| extra | Distinct `company_name` ("John" @ "Acme Corp") | ✅ PASS |
| extra | Confirmation href/id correctness across 2 creates | ✅ PASS |

**Test file executed:** `npm test -- lib/bantoo/qa-swarm-01-customer-creation.test.ts` → **9 tests, 8 passed, 1 failed.** The 1 failure is a dedicated, intentional regression test that pins down a confirmed real bug (Bug #1 below) — it is not a test-authoring mistake; see the raw output below.

```
 ❯ lib/bantoo/qa-swarm-01-customer-creation.test.ts (9 tests | 1 failed) 16ms
     × BUG: `country` is accepted by createCustomerSchema and supported by the
       Party model, but resolve.ts never carries it into BantooDraft, so it is
       silently NEVER persisted (expected: 'Cameroon', actual: null) 2ms

 FAIL  ... AssertionError: expected undefined to be 'Cameroon'
  ❯ lib/bantoo/qa-swarm-01-customer-creation.test.ts:398:76

 Test Files  1 failed (1)
      Tests  1 failed | 8 passed (9)
```

I also ran the **full suite** (`npm test`, 713 tests) to confirm this file doesn't collide with or break anything else: **705 passed, 8 failed** — 1 is mine (the intentional bug pin above) and the other **7 pre-existing failures all live in a different, unrelated file `lib/bantoo/qa-swarm-05-complex-extraction.test.ts`**, which belongs to a different parallel swarm agent (Track 5, not created by me, not touched by me). Those 7 are out of scope for this report; flagging only so the reconciliation pass knows they aren't collateral damage from Track 1's changes.

---

## Bug #1 (confirmed, reproducible): `country` is extracted but silently dropped, never persisted — for BOTH create_customer and create_supplier

### Expected

Command 3/4 ("...in Bertoua, **Cameroon**...") should extract `country: "Cameroon"`, show it (or at least apply it) on save, and persist it on the new `Party` row's `country` column.

### Actual

`country` never reaches the `Party` record. It is silently discarded between extraction and persistence. Confirmed via the new regression test `lib/bantoo/qa-swarm-01-customer-creation.test.ts` → `"BUG: \`country\` is accepted by createCustomerSchema..."` (fails today: draft has no `country` property at all; persisted `Party.country` is `null`).

### Root cause (exact chain, all in files this agent was NOT permitted to edit)

1. **`ledger/lib/ai/actions.ts`**, `createCustomerSchema` (and mirror `createSupplierSchema`) — `country: ntext` **is** part of the extracted action shape (line ~217/381). The extraction prompt in **`ledger/lib/ai/extract.ts`** (line ~27/35) explicitly documents `country (optional)` for both `create_customer` and `create_supplier`. So the AI is asked to extract it, and (per the schema) can.
2. **`ledger/lib/bantoo/types.ts`** — `BantooDraft` (the flat, editable proposal type the confirmation UI is built from) has **no `country` field at all** — contrast with `city`, `phone`, `whatsapp`, `email`, `taxId`, etc., which all have one. `emptyDraft()` likewise never initializes one.
3. **`ledger/lib/bantoo/resolve.ts`**, `resolveExtraction`'s `case "create_customer":` block (lines ~747-809) sets `draft.city`, `draft.phone`, `draft.whatsapp`, `draft.email`, `draft.companyName`, `draft.taxId`, `draft.paymentTermsDays`, `draft.creditLimit`, `draft.defaultDiscount`, ... from `action.*` — but never reads `action.country` anywhere, because there is nowhere on `draft` to put it. Same gap in the mirrored `case "create_supplier":` block (~966-992).
4. `buildPartyPlan` (same file, ~253-298) — builds the confirmation checklist from `action.city`/`action.phone`/`action.whatsapp`/... but has no equivalent `if (action.country?.trim())` branch, and `BantooPlanStepCode` (types.ts) has no `"setCountry"` code to push. So the confirmation preview never even mentions country — which is at least "honest" (it doesn't falsely claim to save something), but it means the user is never told country was dropped either.
5. **`ledger/app/actions/bantoo.ts`**:
   - `draftSchema` (the Zod schema validating the client's execute payload) has no `country` key, so even if a client somehow sent one it would be stripped by `safeParse`.
   - `ensurePartyId`'s `input` type (line ~169-190) only accepts `city`/`phone`/`whatsapp` — no `country` — and its call to `createParty(ctx.orgId, { name, type, city, phone, whatsapp })` (line ~224-231) never forwards a country even though `lib/parties.ts`'s `createParty` **already fully supports** a `country` argument.
   - The `case "create_customer":` execute branch's "use existing" `enrichment` object (line ~533-566) and the new-party `profileFields` object (line ~610-636) both enumerate every other extended field (email, companyName, taxId, paymentTermsDays, creditLimit, defaultDiscount, defaultCurrency, preferredLanguage, preferredPaymentMethod) but never `country`.
   - The mirrored `case "create_supplier":` branch (line ~657-705) has the exact same gap — `ensurePartyId` is called with only `city`/`phone`/`whatsapp`, so a supplier's country is dropped too.
6. Confirmed the DB/data-layer side is **not** the bottleneck — it's 100% ready:
   - **`ledger/prisma/schema.prisma`**, `model Party` (line ~234): `country String?` column already exists (used today by the quick-add flow).
   - **`ledger/lib/parties.ts`**: `CreatePartyInput`, `createParty`, `PartyQuickFieldsInput`, `updateParty`, and `PartyContactInfo`/`getPartyContact` **all already** read/write/select `country` correctly. The plumbing gap is entirely in `lib/bantoo/{types,resolve}.ts` and `app/actions/bantoo.ts` — nothing in the schema or `lib/parties.ts` needs to change.

### Regression test

`ledger/lib/bantoo/qa-swarm-01-customer-creation.test.ts`, `describe("QA swarm 01 — commands 3 & 4: ...")`, the `it("BUG: ...")` case (and its sibling `it("the plan/preview never falsely CLAIMS it will save country ...")`, which passes today and should keep passing after the fix — it documents that the omission, while a real data-loss bug, is at least not a *misleading* one).

### Proposed fix (precise; NOT applied — for the reconciliation pass)

**File `ledger/lib/bantoo/types.ts`:**
- Add `country: string;` to the `BantooDraft` type (alongside `city`), and `country: "",` to `emptyDraft()`.
- Add `"setCountry"` to the `BantooPlanStepCode` union (alongside `"setCity"`).

**File `ledger/lib/bantoo/resolve.ts`:**
- In `resolveExtraction`'s `case "create_customer":` block, add: `draft.country = action.country ?? "";` (next to the existing `draft.city = action.city ?? "";`).
- In `case "create_supplier":`, add the same line for the supplier action.
- In `buildPartyPlan`, add (near the existing `if (action.city?.trim()) steps.push({ code: "setCity", ... })`):
  ```ts
  if (action.country?.trim())
    steps.push({ code: "setCountry", status: "ready", params: { value: action.country.trim() } });
  ```
- Optional (recommended): extend `customerConflictsWithExisting`'s field set to also compare `country` (it already has `existing.country` available via `PartyContactInfo`), so a genuine country conflict also triggers the duplicate-safety prompt, exactly like city/phone/whatsapp already do.

**File `ledger/app/actions/bantoo.ts`:**
- Add `country: z.string().max(200).default(""),` to `draftSchema`.
- Extend `ensurePartyId`'s `input` parameter type with `country?: string | null;` and pass `country: input.country?.trim() || null` through to the `createParty(...)` call inside it.
- In `case "create_customer":`, pass `country: draft.country` into the `ensurePartyId(...)` call for the new-party path, add `if (draft.country.trim()) enrichment.country = draft.country;` to the "use existing" `enrichment` object, and add `if (draft.country.trim()) profileFields.country = draft.country;`-equivalent — actually simplest: since `country` is a quick-add field (not a `PartyProfileInput` field), it should be passed directly on the `ensurePartyId({ ..., country: draft.country })` call for creation (handled by `createParty`), and via a small `updateParty(ctx.orgId, party.id, { ...profileFields, country: draft.country.trim() || undefined })` for the already-created path — i.e. fold `country` into the same `updateParty` call already being made for `profileFields`, since `updateParty` accepts both `PartyQuickFieldsInput` and `PartyProfileInput` simultaneously (see its combined type signature).
- Mirror all of the above for `case "create_supplier":`.

**Files `ledger/messages/en.json` / `ledger/messages/fr.json`:**
- Add a `"setCountry"` key beside the existing `"setCity"` key under the same `command.plan` (or equivalent) namespace, e.g.:
  - en: `"setCountry": "Country — {value}",`
  - fr: `"setCountry": "Pays — {value}",`

**File `ledger/lib/bantoo/fallback.ts` (optional, low priority):**
- `mergeCreateCustomer`/`mergeCreateSupplier` don't explicitly re-merge `country` from the rule-based parser, but since the rule-based extractor always returns `country: null` today (no French/English regex for it) and the merge functions spread `...action` first, the AI's own `country` value already survives untouched. No change strictly required here unless a rule-based country extractor is added later.

### Files that would need to change (fix)
`ledger/lib/bantoo/types.ts`, `ledger/lib/bantoo/resolve.ts`, `ledger/app/actions/bantoo.ts`, `ledger/messages/en.json`, `ledger/messages/fr.json`. (`prisma/schema.prisma` and `lib/parties.ts` need **no** changes — already fully support `country`.)

### Blast radius note
This is not customer-creation-only: `create_supplier` has the exact same gap (same `ensurePartyId` helper, same missing plan step, same missing draft field), for the same root cause. Flagging here since it was discovered while tracing the shared pipeline, but out of scope for this agent's dedicated supplier-side testing (presumably Track 2/whichever swarm agent owns `create_supplier`).

---

## Per-command detail

### 1. "Add Musa as a customer."
- **Expected:** `action: create_customer`, `customer_name: "Musa"`, no other fields. Plan shows only "Create customer — Musa". Execute creates exactly one `Party` (type `customer`), `companyName` defaults to `"Musa"` (per the documented "no distinct company name → falls back to the customer's own name" behavior), `defaultCurrency: "XAF"`.
- **Actual:** Matches exactly. ✅ PASS.
- **Test:** `qa-swarm-01-customer-creation.test.ts` → `'QA swarm 01 — command 1: "Add Musa as a customer." (simple, no extras)'`.

### 2. "Add Musa as a customer in Garoua."
- **Expected:** `city: "Garoua"` extracted, plan shows `createCustomer` then `setCity` with `{ value: "Garoua" }`, persisted `Party.city === "Garoua"`.
- **Actual:** Matches exactly. ✅ PASS.
- **Test:** `'QA swarm 01 — command 2: "Add Musa as a customer in Garoua." (with city)'`.

### 3 & 4. Full complex create_customer (English / French) — Atlas Agro Trading Ltd
- **Expected:** name, city, country, phone, whatsapp (same as phone), email, payment terms (45), credit limit (8,500,000 XAF), tax ID, note — all proposed in the plan and all persisted on the new `Party`, identically regardless of source language.
- **Actual:** Every field **except `country`** round-trips correctly (name, city, phone, whatsapp, email, taxId, paymentTermsDays, creditLimit, companyName-defaulted-to-name, note, defaultCurrency all persist exactly as submitted, in both English and French). `country` is silently dropped — see **Bug #1** above. ⚠️ PASS except country.
- **Test:** `'QA swarm 01 — commands 3 & 4: full complex create_customer (English + French)'` (4 sub-tests: English full round-trip, French full round-trip, the dedicated country-bug pin, and the "plan never falsely claims to save country" check).
- Note on scope: the exact numeric parsing of "8,500,000" / "8 500 000" into `8500000` and the French phrase→field mapping happen inside the live AI extraction call (`lib/ai/extract.ts`), which cannot be exercised offline — per this file's template (`bantoo-create-customer.e2e.test.ts`), these tests start from the already-extracted `ExtractedAction` the AI layer is documented to produce, and verify everything downstream of extraction (resolve → execute → persisted read-back), exactly as the prior sprint's tests A/B do.

### 5. Persistence trap — "Test Non Default Customer" in Douala
- **Expected:** `paymentTermsDays: 53`, `creditLimit: 9876543`, `defaultDiscount: "11"`, plus phone/whatsapp/email, all persisted as the exact submitted values — never silently falling back to the app's defaults (30 days / 0 credit limit / 0% discount).
- **Actual:** Matches exactly; explicit "not equal to the default" guards also pass. ✅ PASS.
- **Test:** `'QA swarm 01 — command 5: persistence trap (no silent default-fallback)'`.

### Company name field (business customer)
- **Expected:** For "John ... he works at Acme Corp" (distinct company name from personal name), `Party.companyName` should be `"Acme Corp"`, not `"John"`.
- **Actual:** Matches — `companyName` is set to the distinct value, and the plan includes `setCompanyName`. ✅ PASS. (This is on top of the already-verified "no distinct company name → defaults to the customer's own name" behavior from the prior sprint's tests, re-confirmed by commands 1/2/3/4/5 above.)

### Confirmation message / navigation target
- **Expected:** `href`/`number` in the execute result reference the newly created party, and two sequential creates in the same session never collide or reuse a stale id.
- **Actual:** Matches — each create returns a distinct `party_N` id, `href` is `"/customers/{that exact id}"`, `number` is the new customer's name. ✅ PASS.

### Fields not supported by the Party model
- Checked `prisma/schema.prisma`'s `Party` model directly: every field this task asked about (name, city, phone, whatsapp, email, companyName, taxId, defaultCurrency, preferredLanguage, paymentTermsDays, creditLimit, defaultDiscount, preferredPaymentMethod, notes, **and `country`**) already exists as a column. There is **no** field genuinely unsupported by the data model among those requested — the country gap (Bug #1) is a pipeline/plumbing bug, not a missing-column problem, and the plan preview correctly never falsely claims to save it (it just silently never mentions or saves it at all, which is the bug).

---

## Commands tested
1. "Add Musa as a customer."
2. "Add Musa as a customer in Garoua."
3. "Create a new customer called Atlas Agro Trading Ltd in Bertoua, Cameroon. Phone +237 677 123 456, WhatsApp same number, email accounts@atlasagro.cm, payment terms 45 days, credit limit 8,500,000 XAF, tax ID CM-AT-2026-0187, and note \"Release goods only after signed delivery note.\""
4. "Créer un nouveau client nommé Atlas Agro Trading Ltd à Bertoua, Cameroun. Téléphone +237 677 123 456. WhatsApp même numéro. Email accounts@atlasagro.cm. Conditions de paiement 45 jours. Limite de crédit 8 500 000 XAF. Numéro fiscal CM-AT-2026-0187. Note: Ne livrer qu'après bon de livraison signé."
5. "Create Test Non Default Customer in Douala. Payment terms 53 days. Credit limit 9,876,543 XAF. Default discount 11%. Phone +237 600 111 222. WhatsApp same. Email test.nondefault@example.com."
6. (own variation) "Add John as a customer, he works at Acme Corp." — distinct company_name check.
7. (own variation) Two sequential distinct creates in one session — confirmation href/id collision check.

## Regression tests added
- `ledger/lib/bantoo/qa-swarm-01-customer-creation.test.ts` — 9 tests, run via `npm test -- lib/bantoo/qa-swarm-01-customer-creation.test.ts`. **8 passed, 1 failed** (the failure is the intentional Bug #1 pin; it should be re-run after the proposed fix lands and is expected to flip to passing at that point — the accompanying "plan never falsely claims to save country" test should keep passing unchanged).

## Pass/fail count summary (repeated for visibility)
- **Required commands 1, 2, 5:** 3/3 fully PASS.
- **Required commands 3, 4:** PASS for every field except `country` (1 confirmed bug, shared root cause across both).
- **Additional coverage (company_name, confirmation id correctness):** 2/2 PASS.
- **Bugs found:** 1 (country field silently dropped for create_customer, same root cause also affects create_supplier).
- **Test file result:** 8/9 passed (1 intentional failing regression test documenting the bug).
- **Full suite sanity check:** 705/713 passed; the 7 other failures are pre-existing, in an unrelated file (`qa-swarm-05-complex-extraction.test.ts`) owned by a different parallel swarm agent, not caused by this work.
