# Ask Bantoo Reliability Swarm — Track 5: Complex Command Extraction

**Agent:** QA Swarm Agent 05 / 10 (independent, read-only on shared source files)
**Scope:** breadth of field coverage under linguistic complexity (long, compound, multi-clause commands) for `create_customer` / `create_supplier`, exercised end-to-end through `parseBantooCommandText → ruleBasedExtract → blendExtraction → resolveExtraction`.
**Repo state tested:** `de87013` ("Fix Ask Bantoo create_customer field persistence and duplicate-save behavior"), on top of `012175a`.
**Regression tests added:** `ledger/lib/bantoo/qa-swarm-05-complex-extraction.test.ts` (33 tests)
**Test run result:** `24 passed | 9 failed` (`npx vitest run lib/bantoo/qa-swarm-05-complex-extraction.test.ts`)

No existing source or test file was modified. All 9 failures are **intentional** — each asserts the *correct* expected extraction per the product's own documented rules (see `lib/ai/extract.ts`'s system prompt and `lib/command-parse.ts`'s doc comments), and fails against the current implementation to concretely demonstrate a real gap.

---

## Top-line summary

**Overall extraction robustness under linguistic complexity: ~6/10.** The AI-quality path (simulated via hand-built "ideal" JSON fed through `blendExtraction`/`resolveExtraction`) is robust — every Dimension 3, 7, and 8 test simulating a correct AI extraction survived blending and produced a complete, correctly-ordered plan. The **rule-based fallback** (`ruleBasedExtract`, the path actually exercised when no AI provider is configured, per `lib/bantoo/fallback.ts`'s module doc comment) is where nearly all real gaps live, and they are **structural**, not edge-case: a single shared regex idiom used by both `extractCreateCustomerDetails` and `extractCreateSupplierDetails` breaks under extremely common, realistic phrasing.

### The 3 most impactful gaps found

1. **"as a `<adjective>` customer/supplier" (e.g. "as a **new** customer") silently discards the real name.** `new` is itself one of the literal alternatives in the shared create-verb group (`add|create|new|save|register`) used by every name-extraction regex. In a phrase like "Register Maroua Grain Traders SARL as a **new** customer", the regex engine matches starting at the word "new" (treating it as the create verb) instead of "Register" — the actual name, which appears *before* "new", is discarded entirely, and garbage (an empty string, or a stray trailing word) is captured instead. This is the single highest-impact bug: it silently corrupts the party name on an otherwise perfectly well-formed, common request, with no warning to the user beyond an empty/wrong name field on the confirmation screen. Affects Dimension 2 and Dimension 8.

2. **Any word (or a bare comma) between the role noun and the trailing "in `<CITY>`" clause breaks name AND city extraction entirely.** `"...as a customer in Garoua"` works; `"...as a customer, in Garoua"` and `"...as a customer based in Garoua"` both silently return `customer_name: null, city: null` — not a partial extraction, a **total** failure of that field group, because the optional trailing-city capture group requires bare whitespace immediately after the role noun and the overall regex is anchored to end-of-string. "based in `<city>`" is an extremely natural, common way to state a location and is not a contrived edge case. Affects Dimensions 1, 2, 6, and 8.

3. **`stripTrailingClauses` is direction-blind and can wipe out the entire command when a phone/whatsapp/note clause is stated *before* the create-clause instead of after (field-order scrambling).** The helper is documented as stripping "trailing" clauses, but it actually just slices the string at the *first* occurrence of a phone/whatsapp/note/then keyword anywhere in the text, keeping only what's before it. If that keyword is the first word of the message (e.g. "Phone 690112233, save Bafia Timber Exports as a supplier."), the string handed to `extractCreateCustomerDetails`/`extractCreateSupplierDetails` becomes **empty**, and name/city extraction fails completely — even though the create-clause is present and grammatically valid later in the same sentence. Affects Dimension 1 directly, and compounds gap #2 in Dimension 8's realistic 8+-field stress test.

None of these three gaps affect **intent classification** (`create_customer` vs `create_supplier` vs anything else) — that layer is comparatively solid, including under real complexity (see Dimension 6). They affect **field extraction only**, but for the *name* field specifically, which is the one field every single one of these actions absolutely requires.

A secondary, lower-severity, **by-design** limitation confirmed across Dimensions 3/5/7: the rule-only fallback never extracts `note` or `unsupported_requests` at all (both are hardcoded to `null` in `ruleBasedExtract`'s `create_customer`/`create_supplier` branches) — richer free-text fields are intentionally AI-only. This means that with **no AI provider configured**, notes and "then also do X" trailing clauses vanish completely and silently, with no "unavailable" plan step to signal it happened (unlike the AI path, which correctly surfaces them — verified in Dimension 7).

---

## Dimension-by-dimension results

### 1. Field order scrambling

| # | Command (abridged) | Expected | Actual | Pass/Fail | Root cause |
|---|---|---|---|---|---|
| 1.1 | `Payment terms 45 days, credit limit 2,000,000 XAF, create a customer called Kribi Fisheries Co-op in Kribi, phone +237644556677.` | name/city/phone/terms/limit all land | All correct | **PASS** | `extractCreateCustomer{TaxId,PaymentTermsDays,CreditLimit,DefaultDiscount}` and `extractCreateCustomerPhone/Whatsapp` all regex-scan the **full raw text** regardless of position — genuinely position-independent, works well. |
| 1.2 | `Credit limit 2 million XAF, payment terms 45 days, create a customer called Kribi Fisheries Co-op in Kribi.` | `credit_limit: 2000000` | `credit_limit: 2` | **FAIL** | `extractCreateCustomerCreditLimit`'s regex (`/\bcredit\s+limit\b...([\d\s,.'']+)/i`) only captures digit/comma/space/dot characters — it has **no "million"/"mio" modifier handling** at all, unlike the general-purpose `extractAmount()` used for transaction amounts elsewhere in the same file. Silently truncates to the bare leading digit. |
| 1.3 | `Tax ID CM-DLA-44521, default discount 5%, add Ebolowa Cocoa Traders as a customer in Ebolowa.` | tax_id/discount/name/city all land | All correct | **PASS** | Same as 1.1 — independent regexes. |
| 1.4 | `Phone 690112233, WhatsApp same number, save Bafia Timber Exports as a supplier in Bafia.` | supplier_name: "Bafia Timber Exports", city: "Bafia" | `supplier_name: null, city: null` (phone/whatsapp still correct) | **FAIL** | `stripTrailingClauses` matches "Phone" as the very first word and slices the string down to **empty** before `extractCreateSupplierDetails` ever sees it (gap #3 above). |

**Fix direction:** (a) route `extractCreateCustomerCreditLimit`/`extractCreateCustomerDefaultDiscount` through the same million/mio-modifier logic already implemented in `extractAmount()` (extract a shared helper). (b) Make `stripTrailingClauses` only strip a clause that is genuinely *trailing* the detected name/role match (e.g. search from the end of the `CREATE_*_PATTERNS` match position onward), not the first keyword occurrence anywhere in the raw string.

### 2. Conditional / conversational phrasing

| # | Command (abridged) | Expected | Actual | Pass/Fail | Root cause |
|---|---|---|---|---|---|
| 2.1 | `If this doesn't already exist, please add Bafia Timber Exports as a new supplier based in Bafia, and note that...` | intent: create_supplier | create_supplier | **PASS** | `CREATE_SUPPLIER_PATTERNS`' first alternative (`add\|create\|new\|save\|register + (a )?suppliers?`) is loose enough to still fire. |
| 2.1 (fields) | (same) | `supplier_name: "Bafia Timber Exports"`, `city: "Bafia"` | `supplier_name: "based"`, `city: null` | **FAIL** | Compound of gap #1 ("new" hijacks the verb-group match, discarding the real name before it) and gap #2 ("based" breaks the trailing city clause). |
| 2.2 | `If Musa Traders is not already a customer, please register them as a customer, phone 690112233.` | `customer_name: "Musa Traders"` | `customer_name: "them"` | **FAIL** | No coreference resolution in the rule parser — it correctly finds "register **them** as a customer" and captures the literal pronoun. Not a "drop", a **silently wrong** value — would create a customer literally named "Them" if not caught on the confirmation screen. |
| 2.3 | `If this doesn't already exist, please add Bafia Timber Exports as a supplier based in Bafia.` (same as 2.1, "new" removed) | `supplier_name: "Bafia Timber Exports"`, `city: "Bafia"` | both `null` | **FAIL** | Isolates gap #2 alone — "based" is sufficient on its own to break extraction, independent of the "new" bug. |
| 2.4 | `Add Bafia Timber Exports as a supplier, in Bafia.` (comma variant of gap #2) | `supplier_name: "Bafia Timber Exports"`, `city: "Bafia"` | both `null` | **FAIL** | Same gap #2, comma phrasing instead of "based". |

**Fix direction:** for gap #2, loosen the trailing-city capture to tolerate a comma and/or a small set of common linking words ("based", "located") before "in/à/a/en `<CITY>`", e.g. `(?:,?\s*(?:based|located)?\s*(?:in|à|a|en)\s+(.+?))?$`. Pronoun coreference (2.2) is a much harder, AI-only problem — the practical mitigation is ensuring the confirmation UI makes an obviously-wrong single-word name like "them"/"him"/"her" easy to spot and correct before saving (out of scope for a regex fix).

### 3. Multiple notes/comments in one command

| # | Command (abridged) | Expected | Actual | Pass/Fail | Root cause |
|---|---|---|---|---|---|
| 3.1 | `Add Yaoundé Steel Works as a customer. Note: prefers email over phone. Also note: always confirm delivery date before shipping. Payment terms 30 days.` (rule-only) | name lands; payment terms lands; notes are a known AI-only gap | name="Yaoundé Steel Works", terms=30, `note: null` (both notes dropped) | **PASS** (documents by-design limitation) | `ruleBasedExtract`'s `create_customer` branch hardcodes `note: null` — there is no rule-based note extraction at all. Not a regression, but a real UX gap for orgs without AI configured: two notes vanish with **zero** signal to the user. |
| 3.2 | Same text, simulated ideal AI extraction with both notes pre-combined into one string, through `blendExtraction` → `resolveExtraction` | exactly one `setNote` plan step, note text intact | Confirmed | **PASS** | `blendExtraction`'s `mergeCreateCustomer` correctly prefers the AI's populated `note` over the rule's `null`; `buildPartyPlan` builds exactly one `setNote` step (schema only has one `note` field — by design, multiple notes must be pre-combined by the extraction layer, not multiple plan steps). |
| 3.3 | Third note-like clause ("Remember that...") merged by AI, verified not nulled out by blend | note text intact | Confirmed | **PASS** | Same mechanism as 3.2; confirms the blend layer never overwrites a populated AI note with the rule parser's `null`. |

**Fix direction:** none required for the AI path (works as designed). If rule-only support for a single explicit `Note: ...` clause is desired for no-AI-configured orgs, `parseCommandTextFull`'s `create_customer`/`create_supplier` branches would need a dedicated `extractCreateCustomerNote` regex (there is currently none) — today `note` is the *only* create_customer/create_supplier field with zero rule-based coverage (email, tax ID, payment terms, credit limit, discount all have dedicated extractors; note does not).

### 4. Numbers written differently

| # | Format | Expected | Actual | Pass/Fail |
|---|---|---|---|---|
| 4.1 | `credit limit 12,345,678 XAF` (commas) | `12345678` | `12345678` | **PASS** |
| 4.2 | `credit limit 12.345.678 XAF` (French dot-separators) | `12345678` | `12345678` | **PASS** |
| 4.3 | `credit limit 12 345 678 XAF` (space-separators) | `12345678` | `12345678` | **PASS** |
| 4.4 | `default discount 7` (no `%`) | `7` | `7` | **PASS** |
| 4.5 | `default discount 7%` (with `%`) | `7` | `7` | **PASS** |
| 4.6 | `phone +237-644-556-677` (dashes + country code) | `+237644556677` | `+237644556677` | **PASS** |
| 4.7 | `credit limit twelve thousand XAF` (spelled out) | some numeric value (AI could parse this) | `null` | **PASS** (documents real, expected rule-only gap) |

All digit-character-based number formats the org is realistically likely to type (commas, dots, spaces, with/without `%`, with/without country code and dashes) are handled correctly and consistently by the existing regexes' shared `[\s,.'']` stripping convention. The only genuine gap is fully spelled-out numbers ("twelve thousand"), which is an inherent limitation of a digit-matching regex and is correctly AI-only — not something worth rule-based investment given XAF amounts are near-universally typed as digits in this product's actual usage pattern (see 4.1–4.3 already covering every realistic separator style).

### 5. Mixed English/French in one message

| # | Command | Expected | Actual | Pass/Fail |
|---|---|---|---|---|
| 5.1 | `Add Golu comme client in Ngoundéré, phone +237699123456, note: paie chaque vendredi.` | name/city/phone land; note is the known AI-only gap | All correct (note null as expected) | **PASS** |
| 5.2 | `Enregistrez Kousseri Traders as a supplier à Kousséri, phone 690445566.` (French verb + English role phrase) | name/city/phone land | All correct | **PASS** |
| 5.3 | `Add Ngoumou Farms as a customer in Ngoumou, son téléphone est 690778899, son whatsapp est le même numéro.` | name/phone/whatsapp land | All correct | **PASS** |

Mixed-language commands are handled well **as long as they don't also trip gaps #1/#2 above** — the `as|comme` and `customer|client|supplier|fournisseur` alternations are already bilingual by design (see `CREATE_CUSTOMER_PATTERNS`/`CREATE_SUPPLIER_PATTERNS`), and field extractors like phone/whatsapp/email are language-agnostic regexes. This dimension did not surface any NEW gap beyond the two already found; it confirms EN/FR mixing itself is not, on its own, a weak point.

### 6. Ambiguous / ambiguous-adjacent entity language

| # | Command | Expected | Actual | Pass/Fail | Root cause |
|---|---|---|---|---|---|
| 6.1 | `Add Golu, who is our regular fournisseur for cement, but register him as a customer in this case, phone 690123456.` | intent: create_customer (incidental "fournisseur" noun doesn't hijack) | create_customer | **PASS** | `CREATE_SUPPLIER_PATTERNS` correctly requires "comme fournisseur"/explicit supplier-creation phrasing immediately, not just the bare noun anywhere in the sentence. |
| 6.2 | `Add Moussa as a client in Maroua, but on reflection register him as a supplier instead, phone +237677889900.` | intent: create_supplier (last explicit mention wins); `partyName: "Moussa"` | intent correct; `partyName: null` | **PARTIAL — intent PASS, name FAIL** | The precedence rule itself (`lastMatchEndIndex`) scales correctly to longer sentences — that part of Track 1/2's fix holds up under more complexity. But the trailing word "instead" (no city clause to absorb it) triggers the SAME `$`-anchor failure as gap #2, this time with no "in `<CITY>`" at all to even partially rescue it — total name-extraction failure. |
| 6.3 | Same sentence, customer/supplier swapped | intent flips to create_customer | Confirmed flips correctly | **PASS** | Proves the precedence logic is genuinely positional, not a hardcoded bias — consistent with the existing Track 1/2 regression tests. |
| 6.4 | `Compare our customer and supplier lists for Douala.` (generic nouns, no create phrasing at all) | intent is neither create_customer nor create_supplier | Neither | **PASS** | No false positive from incidental "customer"/"supplier" nouns. |

**Conclusion for Dimension 6:** the specific thing this dimension was tasked to re-verify — the "last explicit mention wins" **precedence rule** — holds up correctly under added sentence complexity (6.2, 6.3) and doesn't over-fire on generic language (6.1, 6.4). The failure in 6.2 is real but is an instance of gap #2 (trailing-word city-clause fragility), not a regression in the precedence logic itself.

### 7. Extra unsupported trailing clauses

| # | Command | Expected | Actual | Pass/Fail | Root cause |
|---|---|---|---|---|---|
| 7.1 | `Add Douala Metals as a customer, phone +237655443322, then send them a welcome WhatsApp message and schedule a follow-up call for next week.` (rule-only) | name/phone land; trailing clauses are a known AI-only gap | Confirmed: name/phone correct, `unsupported_requests: null`, plan has **zero** unavailable steps, `createParty: true` | **PASS** (documents by-design limitation) | `ruleBasedExtract`'s create_customer branch hardcodes `unsupported_requests: null` — there is no rule-based extraction of trailing unsupported clauses at all. With no AI configured, this is a **silent, total** drop: not even an "unavailable" plan step signals anything was requested and skipped, unlike the AI path. |
| 7.2 | Same command, simulated ideal AI extraction with `unsupported_requests` populated, through `resolveExtraction` | plan: `[createCustomer(ready), unsupportedStep×2(unavailable)]`, `createParty: true` | Confirmed exactly | **PASS** | `buildPartyPlan` correctly appends one `unsupportedStep` per entry and never blocks/corrupts the ready step — matches the existing Track 3/4 regression coverage, holds up for two simultaneous unsupported clauses. |
| 7.3 | Supplier-side equivalent (`...then email them our standard catalog request form.`), rule-only | `unsupported_requests: null` (same known gap) | Confirmed | **PASS** | Mirrors 7.1 for `create_supplier`. |

**Fix direction:** if the product wants trailing "then also do X" clauses to be surfaced (not silently dropped) even without AI configured, `parseCommandTextFull`'s `create_customer`/`create_supplier` branches would need a lightweight rule-based `unsupported_requests` extractor (e.g. capture whatever `stripTrailingClauses` currently just discards after a "then"/"puis" keyword, when it isn't itself a recognized phone/whatsapp/note clause) — today the AI path is the *only* way this ever surfaces.

### 8. Very long single command with 8+ fields at once

| # | Command variant | Fields | Pass/Fail | Root cause |
|---|---|---|---|---|
| 8.1 | `Register Maroua Grain Traders SARL as a new customer, based in Maroua, phone ..., whatsapp same number, email ..., payment terms 60 days, credit limit 5,000,000 XAF, default discount 3%, tax ID ..., note: ..., then open their profile.` | intent | **PASS** (by coincidence) | `CREATE_CUSTOMER_PATTERNS`' first alternative matches the bare bigram "new customer" directly (since "new" is itself a create-verb alternative) — intent survives, but not because the "as a new customer" phrasing pattern actually matched. |
| 8.1 (name/city) | same | `customer_name`, `city` | **FAIL** | Compound of gap #1 (name-extraction regex also hijacked by "new") and gap #2 ("based in Maroua"). Both come back `null` — the two headline structural bugs stack on the single most realistic, fully-specified test case in this whole dimension. |
| 8.2 | Same command, "new" removed (`as a customer, based in Maroua, ...`) | `customer_name`, `city` | **FAIL** | Isolates gap #2 alone — "based in Maroua" is by itself sufficient to break this 8+-field command's name/city, even with the "new" bug fixed. Every OTHER field (phone, whatsapp, payment terms, credit limit, discount, tax ID, post-action) still lands correctly, since those extractors scan the full raw text independent of the name/city regex. |
| 8.3 | Minimal isolated check that `extractCreateCustomerEmail` really is rule-covered (not AI-only, contrary to a nearby code comment's framing) | `email` | **PASS** | Confirms email *is* extracted by the rule-based fallback once name/city extraction itself isn't blocked — narrows exactly which fields are truly AI-only (`note`, `unsupported_requests`, `company_name`, `preferred_language`, `preferred_payment_method`) vs which already have rule coverage (`email`, `tax_id`, `payment_terms_days`, `credit_limit`, `default_discount`, `phone`, `whatsapp`, `post_action`). |
| 8.4 | Same 8+ field command, "based in" → plain "in Maroua" (positive control) | full plan: 9 steps (`createCustomer, setCity, setPhone, setWhatsapp, setTaxId, setPaymentTerms, setCreditLimit, setDiscount, openProfile`) | **PASS** | Proves the multi-step planner's field-carrying **capacity** itself is not the bottleneck — 8 real fields (name, city, phone, whatsapp, tax ID, payment terms, credit limit, discount) plus a post-action all correctly flow end-to-end through `ruleBasedExtract → resolveExtraction` into a complete, correctly-ordered plan, once the name/city phrasing avoids the two known regex traps. |
| 8.5 | Full 12-field command (adds `email`, `company_name`) as simulated ideal AI JSON, through `blendExtraction → resolveExtraction` | full plan: 12 steps in the documented order | **PASS** | Confirms the AI-quality path has no field-count ceiling either — every field on `createCustomerSchema` flows through blend and resolve correctly for a maximally-loaded single command. |

**Conclusion for Dimension 8:** the multi-step planner itself (`buildPartyPlan`/`resolveExtraction`) has **no capacity problem** — 8.4 and 8.5 prove it handles the maximum realistic field count cleanly on both the rule and AI paths. The dimension's real finding is that the rule-only path's **name/city extraction is the single point of failure** for realistic long-form phrasing, and it's fragile precisely at the two structural regex gaps (#1 and #2) already identified in Dimensions 1/2/6 — this is the same root cause recurring, not a distinct 8-field-specific bug, but it's the dimension where the *combined* real-world cost (an entire fully-specified compound request silently failing to save under the right name) is most visible.

---

## Regression tests added

**File:** `ledger/lib/bantoo/qa-swarm-05-complex-extraction.test.ts` (new, 33 tests across 8 `describe` blocks matching the 8 dimensions above)

Run with:
```
cd ledger && npx vitest run lib/bantoo/qa-swarm-05-complex-extraction.test.ts
```

**Result:** `24 passed | 9 failed` — every failure is annotated in-line with the confirmed root cause (verified via isolated debugging, not guessed) and corresponds 1:1 to a row marked **FAIL** in the tables above. No existing test file, source file, or shared fixture was modified; the suite uses the same mocking pattern as `lib/bantoo/create-supplier.test.ts` (`vi.mock` on `@/lib/inventory`, `@/lib/bantoo/entities`, `@/lib/accounts`, `@/lib/command-patterns`, `@/lib/parties`) so it composes safely alongside the other 9 swarm agents' test files and the pre-existing suite.

Verified no interference with the rest of the suite: `npx vitest run lib/bantoo/ lib/ai/ lib/command-parse` shows this file's 9 intentional failures plus a small number of pre-existing failures in **other swarm agents'** already-present `qa-swarm-06-*`/`qa-swarm-10-*` files (not touched or caused by this agent) — `lib/bantoo/fallback.test.ts`, `lib/bantoo/create-supplier.test.ts`, `lib/bantoo/resolve-customer.test.ts`, `lib/bantoo/resolve-blend.test.ts`, and all other pre-existing tests remain fully green.

---

## Proposed fixes (for whoever owns `lib/command-parse.ts` — not applied here per isolation rules)

1. **Extract a shared `parseMoneyWithModifier(text)` helper** (reusing `extractAmount`'s existing million/mio logic) and use it in `extractCreateCustomerCreditLimit` (and any future money field) instead of the current bare-digit regex.
2. **Loosen the trailing-city capture** in `extractCreateCustomerDetails`/`extractCreateSupplierDetails`'s `asRole`/`namedRole`/`prefixed` patterns to tolerate an optional comma and a small linking-word set (`based`, `located`) before `in|à|a|en <CITY>`, e.g. replace `(?:\s+(?:in|à|a|en)\s+(.+?))?$` with `(?:,?\s*(?:based|located)?\s*(?:in|à|a|en)\s+(.+?))?$`.
3. **Make `stripTrailingClauses` position-aware**: only strip a phone/whatsapp/note/then clause that appears *after* the matched create-role phrase's end index, not the first occurrence anywhere in the raw string — otherwise a leading field-order-scrambled clause silently destroys the entire extraction.
4. **Reconsider "new" in the shared create-verb alternation** (`add|create|new|save|register`) — it was added for "create **new** customer X" phrasing but actively hijacks "as a **new** customer/supplier" phrasing, which is arguably more common. Consider requiring "new" to be immediately followed by the customer/supplier noun (i.e. keep it only in the `prefixed` pattern, drop it from `asRole`'s verb group) so "X **as a new** customer" doesn't get parsed as if "new" were the sentence's leading verb.
5. **(Lower priority, matches existing product intent)** if rule-only support for a single explicit note/trailing-unsupported-clause is ever desired for no-AI-configured orgs, add dedicated extractors mirroring the existing `extractCreateCustomerEmail`-style pattern — today `note` and `unsupported_requests` are the only create_customer/create_supplier fields with zero rule-based coverage.
