# Ask Bantoo Reliability Swarm — Track 2: Supplier Creation Agent

**Repo state tested:** `de87013` ("Fix Ask Bantoo create_customer field persistence and duplicate-save
behavior"), i.e. `012175a` + the customer-field-persistence fix commit — confirmed via `git log --oneline -5`.

**AI provider:** NOT configured in this environment (`ledger/.env` only sets `RESEND_API_KEY`). All
"end-to-end" behavior below is what actually runs today via the rule-based fallback
(`lib/command-parse.ts` → `lib/bantoo/fallback.ts#ruleBasedExtract`), which is the same fallback the AI
path degrades to when no key is present — and it is the fully deterministic, reproducible thing to test
against. The zod-schema-level tests additionally prove the gap holds **even if AI were configured and
returned perfect data** (see "Schema layer" below).

## Summary — pass/fail count

| # | Command | Name/City/Phone/WhatsApp | Extended fields (email/companyName/taxId/paymentTerms/creditLimit) | Note | Label says "supplier" | Duplicate safety |
|---|---|---|---|---|---|---|
| 1 | "Add Olam as a supplier." | **FAIL** (name extraction breaks on trailing period) | N/A (blocked) | N/A | N/A | N/A |
| 2 | Nile Packaging SARL (EN, email+paymentTerms) | PASS | **FAIL** (both dropped) | PASS* | PASS | N/A (new) |
| 3 | Sahel Grain Traders (EN, +creditLimit+taxId) | PASS | **FAIL** (all 4 dropped) | PASS* | PASS | N/A (new) |
| 4 | Sahel Grain Traders (FR, same fields) | PASS | **FAIL** (all 4 dropped) | PASS* | PASS | N/A (new) |
| 5 | Test Non Default Supplier ("persistence trap") | **FAIL** (city corrupted by an unrelated new bug) | **FAIL** (paymentTerms/creditLimit dropped) | N/A | PASS | N/A (new) |

*Note persistence (`note`) only verified at the execute()/draft layer with a manually-populated draft — the
rule-based parser never extracts free-text notes for either customer or supplier (a pre-existing, symmetric
limitation, not part of this hypothesis).

**Primary hypothesis: CONFIRMED, at every single pipeline stage.** `create_supplier` never received the
`create_customer` field-persistence sprint's email/companyName/taxId/paymentTermsDays/creditLimit/
defaultDiscount/preferredLanguage/preferredPaymentMethod support — not in the AI prompt, not in the
rule-based parser, not in the zod schema, not in the plan builder, and not in `execute()`'s persistence
code. Two additional, previously-undocumented bugs were also found while building the required test
commands verbatim (see "Additional bugs found" below).

**Regression tests added:**
- `ledger/lib/bantoo/qa-swarm-02-supplier-creation.test.ts` (15 tests — parse/extract/schema/resolve stages)
- `ledger/app/actions/qa-swarm-02-supplier-persistence.test.ts` (6 tests — execute()/persistence stage)

**Actual test run (executed, not theorized):**
```
$ npx vitest run lib/bantoo/qa-swarm-02-supplier-creation.test.ts app/actions/qa-swarm-02-supplier-persistence.test.ts
 Test Files  2 passed (2)
      Tests  21 passed (21)
```
All 21 tests pass — meaning they successfully **document** the actual (buggy) behavior as the "expected"
value, exactly like the existing `create-supplier.test.ts` convention in this repo (this is a QA/reliability
suite recording ground truth, not a pre-fix TDD suite). Every failure mode below was empirically observed by
running the code, not inferred from reading it alone.

---

## 1. Primary finding: `create_supplier` never got the field-persistence fixes `create_customer` got

### Root cause chain (every layer, in order)

1. **AI prompt** — `ledger/lib/ai/extract.ts` lines 27 vs 35. `create_customer`'s field list explicitly
   includes `email`, `company_name`, `tax_id`, `payment_terms_days`, `credit_limit` with detailed extraction
   guidance. `create_supplier`'s field list (line 35) only lists `supplier_name, city, phone, whatsapp,
   country, note, post_action, unsupported_requests, currency` — the AI is never even asked to look for
   these fields on a supplier command.

2. **Rule-based parser** — `ledger/lib/command-parse.ts`, `parseCommandTextFull()`. The `create_customer`
   branch (~line 1623) calls `extractCreateCustomerEmail/TaxId/PaymentTermsDays/CreditLimit/DefaultDiscount`.
   The `create_supplier` branch (~line 1635) only calls the phone/whatsapp/postAction extractors — it never
   calls any of the five extended-field extractors, even though they're generic enough to be reused verbatim
   (they don't reference "customer" in their logic — see `extractCreateCustomerEmail` etc., none of which
   inspect the party type).

3. **Schema (the hard blocker)** — `ledger/lib/ai/actions.ts`, `createSupplierSchema` (line 375) vs
   `createCustomerSchema` (line 211). `createSupplierSchema` has NO `email`, `company_name`, `tax_id`,
   `payment_terms_days`, `credit_limit`, or `default_discount` fields at all. Because it's a plain
   `z.object()` (not `.strict()`), even a hypothetically-perfect AI response containing these fields for
   `create_supplier` gets them **silently stripped** by `parseExtractedAction()` — proven directly in
   `qa-swarm-02-supplier-creation.test.ts`. **This means fixing only the AI prompt/rule-parser would NOT be
   enough — the schema itself must gain these fields first.**

4. **Plan builder** — `ledger/lib/bantoo/resolve.ts`, `buildPartyPlan()` (line 253). The extra-fields block
   (setEmail/setCompanyName/setTaxId/setPaymentTerms/setCreditLimit/setDiscount) is hard-gated behind
   `if (action.action === "create_customer")` (line 274) — even if the schema/extraction gaps above were
   fixed, this gate would still need widening (or `action.action === "create_supplier"` added) for the
   confirmation UI to ever show these steps for a supplier.

5. **`resolve.ts`'s `create_supplier` case** (line 966) — only reads `action.supplier_name/city/phone/
   whatsapp/note/post_action` into the draft. Structurally cannot read `action.email` etc. because the
   `CreateSupplierAction` type doesn't have them (root-caused by #3).

6. **`execute()`** — `ledger/app/actions/bantoo.ts`, `case "create_supplier"` (line 657) vs
   `case "create_customer"` (line 515). `create_customer`'s branch builds a `profileFields` object from
   `draft.email/companyName/taxId/paymentTermsDays/creditLimit/defaultDiscount/preferredLanguage/
   preferredPaymentMethod` and calls `updateParty(ctx.orgId, party.id, profileFields)` right after
   `ensurePartyId`/`createParty` (lines 610-636), with `companyName` defaulting to the party's own name.
   It also has a symmetric "use existing" enrichment block (lines 533-566) that applies these same fields
   via `updateParty` when attaching to an existing customer. **`create_supplier`'s branch has NEITHER of
   these — `updateParty()` is never called at all**, even in a hypothetical world where a fixed #1-#5
   somehow got these values onto the draft anyway. Proven directly in
   `qa-swarm-02-supplier-persistence.test.ts` by feeding `executeBantooAction()` a fully-populated draft (as
   if every upstream fix already existed) and asserting `updatePartySpy` is never called.

### Concrete example (required command #3)

Input: `"Create a supplier called Sahel Grain Traders in Maroua. Phone +237 655 222 333. WhatsApp same
number. Email sourcing@sahelgrain.cm. Payment terms 60 days. Credit limit 3,000,000 XAF. Tax ID
CM-MR-2026-0099. Note: Pays via bank transfer only."`

| Field | Expected | Actual (observed via `parseBantooCommandText`) |
|---|---|---|
| `intent` | `create_supplier` | `create_supplier` ✅ |
| `partyName` | "Sahel Grain Traders" | "Sahel Grain Traders" ✅ |
| `city` | "Maroua" | "Maroua" ✅ |
| `phone` | "+237655222333" | "+237655222333" ✅ |
| `whatsapp` | "+237655222333" | "+237655222333" ✅ |
| `email` | "sourcing@sahelgrain.cm" | **`null`** ❌ |
| `taxId` | "CM-MR-2026-0099" | **`null`** ❌ |
| `paymentTermsDays` | 60 | **`null`** ❌ |
| `creditLimit` | "3000000" | **`null`** ❌ |

The identical text with every occurrence of "supplier" replaced by "customer" correctly extracts all four
extended fields (verified in the test suite as a direct control case) — proving the gap is specific to the
supplier branch, not a general parser limitation.

### Proposed fix (precise, for the reconciliation pass)

**File: `ledger/lib/ai/actions.ts`** — add to `createSupplierSchema` (mirroring `createCustomerSchema`
exactly, `customer_name` → `supplier_name` convention already established):
```ts
export const createSupplierSchema = z.object({
  action: z.literal("create_supplier"),
  supplier_name: ntext,
  city: ntext,
  phone: ntext,
  whatsapp: ntext,
  country: ntext,
  note: ntext,
  // --- ADD (mirrors createCustomerSchema field-for-field) ---
  email: ntext,
  company_name: ntext,
  tax_id: ntext,
  payment_terms_days: numberish,
  credit_limit: numberish,
  default_discount: numberish,
  preferred_language: ntext,
  preferred_payment_method: ntext,
  // --- end add ---
  post_action: postCustomerAction,
  unsupported_requests: unsupportedRequests,
  currency,
  ...base,
});
```

**File: `ledger/lib/ai/extract.ts`** — expand the `create_supplier` prompt line (~line 35) to list and
explain `email, company_name, tax_id, payment_terms_days, credit_limit, default_discount,
preferred_language, preferred_payment_method`, copying the guidance text already written for
`create_customer` (line 27) with `customer_name`/`customer` → `supplier_name`/`supplier`.

**File: `ledger/lib/command-parse.ts`** — in `parseCommandTextFull()`'s `create_supplier` branch (~line
1635), add the same five calls the `create_customer` branch makes:
```ts
} else if (intent === "create_supplier") {
  const details = extractCreateSupplierDetails(stripTrailingClauses(raw));
  partyName = details.name;
  city = details.city;
  phone = extractCreateCustomerPhone(raw);
  whatsapp = extractCreateCustomerWhatsapp(raw, phone);
  postAction = extractCreateCustomerPostAction(raw);
  // --- ADD ---
  email = extractCreateCustomerEmail(raw);
  taxId = extractCreateCustomerTaxId(raw);
  paymentTermsDays = extractCreateCustomerPaymentTermsDays(raw);
  creditLimit = extractCreateCustomerCreditLimit(raw);
  defaultDiscount = extractCreateCustomerDefaultDiscount(raw);
  // --- end add ---
}
```
(These extractor functions are already party-type-agnostic — no supplier-specific variants needed.) Also
widen `TRAILING_CLAUSE_LEAD` (or add a second strip pass) to recognize `payment terms`/`credit limit`/`tax
id` clauses before city extraction runs for `create_supplier` — see bug #2 below, which is caused by the
same gap.

**File: `ledger/lib/bantoo/fallback.ts`** — in `ruleBasedExtract()`'s `create_supplier` branch (~line 117),
add the five fields to the returned object, exactly mirroring the `create_customer` branch immediately
above it (lines 103-114):
```ts
if (parsed.intent === "create_supplier") {
  return {
    action: "create_supplier",
    supplier_name: parsed.partyName,
    city: parsed.city,
    phone: parsed.phone,
    whatsapp: parsed.whatsapp,
    country: null,
    note: null,
    post_action: parsed.postAction,
    unsupported_requests: null,
    currency,
    confidence,
    summary: null,
    // --- ADD ---
    email: parsed.email,
    company_name: null,
    tax_id: parsed.taxId,
    payment_terms_days: parsed.paymentTermsDays,
    credit_limit: parsed.creditLimit ? Number(parsed.creditLimit) : null,
    default_discount: parsed.defaultDiscount ? Number(parsed.defaultDiscount) : null,
    preferred_language: null,
    preferred_payment_method: null,
    // --- end add ---
  };
}
```
Also check `blendExtraction()`'s create_supplier-specific merge helper (~line 555-580 in `fallback.ts`) to
carry these fields through AI/rule reconciliation the same way the create_customer merge does.

**File: `ledger/lib/bantoo/resolve.ts`**:
- `buildPartyPlan()` (line 253): widen the gate at line 274 from `action.action === "create_customer"` to
  `action.action === "create_customer" || action.action === "create_supplier"` (both narrowed types would
  then have the same field set, so no further branching needed inside that block).
- `case "create_supplier"` (line 966): add the same six `draft.x = action.x ?? ""` assignments the
  `create_customer` case has (email/companyName/taxId/paymentTermsDays/creditLimit/defaultDiscount/
  preferredLanguage/preferredPaymentMethod).

**File: `ledger/app/actions/bantoo.ts`** — `case "create_supplier"` (line 657): add the exact same
`profileFields` construction + `updateParty()` call that `case "create_customer"` has (lines 610-636),
substituting only the "use existing" enrichment block's error messages ("supplier" vs "customer") and
`companyName` default source (`draft.companyName.trim() || party.name`, same logic). Also add the
"use existing supplier" enrichment block mirroring lines 533-566 (currently `create_supplier`'s "found"
branch at line 661-676 only appends the note — no field enrichment at all when attaching to an existing
supplier).

**File: `ledger/lib/bantoo/types.ts`** — `BantooPlanStepCode`/warning types already support this: the
`setEmail`/`setCompanyName`/`setTaxId`/`setPaymentTerms`/`setCreditLimit` plan-step codes and their i18n
labels in `messages/en.json`/`messages/fr.json` are generic (not customer-specific wording) and can be
reused as-is for `create_supplier` — **no i18n changes needed**, confirmed by reading `messages/en.json`
lines 358-366.

---

## 2. Duplicate-disambiguation gap — CONFIRMED, matches the known/documented gap

`create_supplier` has no equivalent of `create_customer`'s `possibleDuplicateCustomer` safety check
(`isExactCustomerNameMatch` + `customerConflictsWithExisting` in `resolve.ts`, lines 189-235). This is
already flagged in the codebase's own comments (`resolve.ts` line 967-974: "Mirrors create_customer's case
exactly ... minus the possible-duplicate safety fix ... hasn't been ported to create_supplier yet") and in
`create-supplier.test.ts`'s existing tests. **Confirmed via a new test**
(`qa-swarm-02-supplier-creation.test.ts`, "KNOWN GAP" test): a HIGH-confidence name match against an
existing supplier whose phone conflicts with the new request's phone silently auto-attaches (`partyId` set,
`createParty: false`, no warning, `duplicateCandidate: null`) instead of prompting the user, unlike the
customer path. `BantooWarningCode` (`lib/bantoo/types.ts`) has no `possibleDuplicateSupplier` code at all.

Per the swarm brief, this is **Track 4's job to build**, not fixed here — documented and regression-tested
only.

---

## 3. Additional bugs found (incidental, discovered while running the required commands verbatim)

These are NOT part of the primary field-persistence hypothesis, but they directly affect the literal
required test commands, so they're reported here for completeness.

### 3a. Trailing period breaks name extraction — blocks required command #1 exactly as written

`"Add Olam as a supplier."` (with the trailing period, exactly as specified in the swarm brief) fails to
extract **any** supplier name via the rule-based fallback: `parseBantooCommandText("Add Olam as a
supplier.").partyName` is `null`, not `"Olam"`. Root cause: `extractCreateSupplierDetails`'s `asRole` regex
(`lib/command-parse.ts` ~line 1558) is anchored with `$` immediately after the "as a supplier" phrase, with
no allowance for trailing punctuation. Without the period ("Add Olam as a supplier", no ".") it works fine.

**This is symmetric with `create_customer`** — `"Add Musa as a customer."` has the exact same failure,
confirmed by a direct control-case test — so it's a **shared parser bug**, not specific to Track 2's
supplier-vs-customer hypothesis. Downstream impact: `resolveExtraction` would warn `enterSupplierName` and
`executeBantooAction` would return `{ ok: false, error: "Enter the supplier name." }` — the command fails
end-to-end via the rule-based fallback (this only matters when no AI is configured, or when the AI's own
answer is itself blended with a null-name rule-parse result at low confidence).

**Proposed fix:** `lib/command-parse.ts`, `stripSupplierNameLead`/`stripCustomerNameLead` and/or the
`asRole` regex in `extractCreateSupplierDetails`/`extractCreateCustomerDetails` — strip trailing
`.`/`!`/`?` from the input before matching (or relax the `$` anchor to `[.!?]?$`). One shared fix covers
both customer and supplier since the regexes are structurally identical.

### 3b. Unrecognized "payment terms"/"credit limit" clauses corrupt the extracted city — surfaced by required command #5

`"Create a supplier called Test Non Default Supplier in Yaoundé. Payment terms 53 days. Credit limit
9,876,543 XAF. Phone +237 600 222 333."` extracts `city` as `"Yaoundé. terms days. Credit limit"` instead
of `"Yaoundé"`.

Root cause: `stripTrailingClauses()` (`lib/command-parse.ts` ~line 1439) only knows to cut the raw text
before a recognized trailing clause keyword (`phone|téléphone|tel|whatsapp|note|then|puis|ensuite`, see
`TRAILING_CLAUSE_LEAD` ~line 1436). Because `create_supplier` never extracts payment-terms/credit-limit
clauses at all (bug #1, root cause chain step 2), those clauses aren't in this keyword list, so the "Payment
terms 53 days. Credit limit 9,876,543 XAF." text isn't cut before city extraction runs — the city-capture
group's lazy match ends up swallowing everything up to the next recognized keyword ("Phone"), and
`cleanLabel()`'s stopword-stripping then partially (not fully) cleans the resulting garbage, leaving "Yaoundé.
terms days. Credit limit" behind.

This is a direct, visible **symptom** of the same root gap as the primary finding, not an independent bug —
**fixing the primary finding's step 2 (adding the five extractor calls to the `create_supplier` branch in
`parseCommandTextFull`, and widening `TRAILING_CLAUSE_LEAD` to also match `payment terms|credit limit|tax
id`) fixes this too.** No separate fix is needed beyond what's already proposed in section 1.

---

## Commands tested

All 5 required commands, plus symmetric create_customer control-case variants (same text with
"supplier"→"customer") and a hypothetical zod-schema-level "perfect AI response" for both actions:

1. `Add Olam as a supplier.` (and without the trailing period)
2. `Create a supplier called Nile Packaging SARL in Douala. Phone +237 699 888 777, WhatsApp same, email sales@nilepackaging.cm, payment terms 21 days, note "Supplies rice bags and labels."`
3. `Create a supplier called Sahel Grain Traders in Maroua. Phone +237 655 222 333. WhatsApp same number. Email sourcing@sahelgrain.cm. Payment terms 60 days. Credit limit 3,000,000 XAF. Tax ID CM-MR-2026-0099. Note: Pays via bank transfer only.`
4. `Créer un fournisseur nommé Sahel Grain Traders à Maroua. Téléphone +237 655 222 333. WhatsApp même numéro. Email sourcing@sahelgrain.cm. Conditions de paiement 60 jours. Limite de crédit 3 000 000 XAF. Numéro fiscal CM-MR-2026-0099.`
5. `Create a supplier called Test Non Default Supplier in Yaoundé. Payment terms 53 days. Credit limit 9,876,543 XAF. Phone +237 600 222 333.`

## Regression tests added

- `ledger/lib/bantoo/qa-swarm-02-supplier-creation.test.ts` — 15 tests covering `parseBantooCommandText`,
  `ruleBasedExtract`, `blendExtraction`, `parseExtractedAction`/`createSupplierSchema` (zod-layer proof), and
  `resolveExtraction` (plan/draft + duplicate-disambiguation gap).
- `ledger/app/actions/qa-swarm-02-supplier-persistence.test.ts` — 6 tests covering `executeBantooAction`'s
  `create_supplier` case (brand-new + "use existing" paths) with `create_customer` control cases, plus
  full-chain verification for required commands #2 and #5.

**Actual run output:**
```
$ npx vitest run lib/bantoo/qa-swarm-02-supplier-creation.test.ts app/actions/qa-swarm-02-supplier-persistence.test.ts
 Test Files  2 passed (2)
      Tests  21 passed (21)
```

Full-suite run (`npx vitest run`, no filter) at the time of writing showed `63 passed / 4 failed` test
files — the 4 failing files are `qa-swarm-01-customer-creation.test.ts`, `qa-swarm-05-complex-extraction.test.ts`,
`qa-swarm-08-purchase-workflow.test.ts`, and `qa-swarm-10-persistence-nav.test.ts`, all authored by other
parallel swarm agents on their own tracks (visible by filename) with their own intentionally-failing
"expected to fail against current implementation" regression tests — none of my files are among the
failures, and nothing in this track touched those other agents' files.

## Files that would need to change (for the reconciliation pass)

1. `ledger/lib/ai/actions.ts` — add 8 fields to `createSupplierSchema`.
2. `ledger/lib/ai/extract.ts` — expand the `create_supplier` prompt field list/guidance.
3. `ledger/lib/command-parse.ts` — add 5 extractor calls to `create_supplier` branch of
   `parseCommandTextFull`; widen `TRAILING_CLAUSE_LEAD` for payment-terms/credit-limit/tax-id clauses.
4. `ledger/lib/bantoo/fallback.ts` — add 8 fields to `ruleBasedExtract`'s `create_supplier` return value;
   check the supplier merge path in `blendExtraction`.
5. `ledger/lib/bantoo/resolve.ts` — widen `buildPartyPlan`'s gate; add draft assignments in the
   `create_supplier` case.
6. `ledger/app/actions/bantoo.ts` — add `profileFields`/`updateParty()` call (both the brand-new and
   "use existing" paths) to the `create_supplier` case.
7. (Track 4, not this track) `ledger/lib/bantoo/resolve.ts` — port `possibleDuplicateCustomer`-equivalent
   safety check to `create_supplier`; `ledger/lib/bantoo/types.ts` would need a `possibleDuplicateSupplier`
   warning code and `BantooDuplicateCandidate` reuse.

No changes needed to `messages/en.json`/`messages/fr.json` (labels already generic/reusable) or
`prisma/schema.prisma` (Party model already supports every field via `type: "supplier"`).
