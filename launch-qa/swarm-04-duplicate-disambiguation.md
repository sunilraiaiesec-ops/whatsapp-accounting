# QA Swarm Track 4 — Duplicate-Disambiguation Agent

**Scope:** `create_customer`'s `possibleDuplicateCustomer` / `duplicateCandidate` safety mechanism
(`lib/bantoo/resolve.ts`, `components/BantooCommand.tsx`, `app/actions/bantoo.ts`'s
`duplicateResolution`/`forceCreate` plumbing) and `create_supplier`'s parity (or lack thereof).

**Repo state:** HEAD `de87013` ("Fix Ask Bantoo create_customer field persistence and
duplicate-save behavior"), on top of `012175a` ("Fix create_customer silently attaching to an
unrelated existing party.") and `57589fb` ("Fix create_customer silently ignoring the 'create as
new' duplicate choice."). Confirmed via `git log --oneline -5` before testing.

**Method:** All scenarios were verified via real, end-to-end code execution — extraction (hand-built
`ExtractedAction`, per each scenario's stated command) → `resolveExtraction` → `executeBantooAction`
→ persisted-record read-back via `listParties`/`findParty` — against a shared, in-memory fake for
`@/lib/prisma`, using the REAL (unmocked) `lib/parties.ts`, `lib/bantoo/resolve.ts`,
`lib/bantoo/entities.ts`, `lib/bantoo/match.ts`, and `app/actions/bantoo.ts`. This follows the exact
pattern of the existing `app/actions/bantoo-create-customer.e2e.test.ts`, which was read first as
the template.

**Regression tests added:** `ledger/lib/bantoo/qa-swarm-04-duplicate.test.ts` (new file, additive
only — no existing source or test file was modified).

**Test run result:** `npx vitest run lib/bantoo/qa-swarm-04-duplicate.test.ts` → **10/10 passed**.
A broader regression pass (`lib/bantoo/` + the two existing `bantoo*.e2e/.test.ts` files in
`app/actions/`) → **301/301 passed**, confirming no interference with other in-flight swarm test
files or the pre-existing suite.

```
✓ Scenario 1: exact duplicate, no conflict > auto-associates silently with no duplicate prompt
✓ Scenario 2: similar (fuzzy, non-exact) name match > triggers the duplicate-choice prompt
✓ Scenario 3(a): same city, non-exact name — never a silent blind auto-merge
✓ Scenario 3(b): different city, non-exact name — must prompt
✓ Scenario 3 GAP: same phone number but a dissimilar name is NOT detected as a possible duplicate
✓ Scenario 4: individual person record vs. an unrelated company name — requires explicit choice
✓ Scenario 5: 'create as new' choice — new party id, all fields persisted, old record untouched
✓ Scenario 6: 'use existing' choice — only submitted fields updated, unmentioned email survives
✓ Scenario 7: create_supplier — CONFIRMED GAP, silent misattachment, no prompt
✓ Scenario 7: create_customer parity baseline (same command pattern) — correctly prompts
```

---

## Scenario-by-scenario results

### 1. Exact duplicate, no conflict
**Command:** "Add Musa as a customer." Existing customer "Musa" (no other fields).

- **Expected:** exact name match + no conflicting new field data ⇒ safe to auto-associate silently
  (per the fix design in `resolve.ts`'s `isExactCustomerNameMatch`/`customerConflictsWithExisting`).
- **Actual:** `proposal.partyId` = the existing party id, `createParty=false`,
  `duplicateCandidate=null`, no `possibleDuplicateCustomer` warning. Execute reuses the party; no
  new row created.
- **Result: PASS.** Still correct, no regression.

### 2. Similar name (fuzzy, not exact)
**Command:** "Create Golu Transport Ltd as a new customer in Ngoundéré with phone
+237699123456." Existing customer "Golu" (Garoua, no other fields).

- **Expected:** must trigger the duplicate-choice prompt (fuzzy, not exact).
- **Actual:** the substring-containment matcher (`lib/bantoo/match.ts`) scores "Golu" vs "Golu
  Transport Ltd" as 90 (≥ `MATCH_HIGH`), so `resolveParty` auto-selects the existing "Golu" record;
  `resolve.ts`'s `create_customer` case then checks `isExactCustomerNameMatch("Golu", "Golu
  Transport Ltd")` → false → `duplicateCandidate` is set, `partyId` reset to `null`,
  `possibleDuplicateCustomer` warning raised. Attempting to execute with no explicit choice
  (`duplicateResolution: null`) correctly fails and writes nothing.
- **Result: PASS.**

### 3. Same phone/near-identical name, different cities
**Command pattern:** "Create Sunrise Foods SARL in Douala. If Sunrise Foods already exists in
Douala, update it. If it exists only in another city, create a new customer. If uncertain, ask
before saving." Existing "Sunrise Foods" (Douala, phone +237611112222).

> Note: the conditional "if X then Y, if uncertain ask" phrasing is an AI-extraction-layer concern
> (`lib/ai/extract.ts`'s prompt) that cannot be exercised in this offline suite — see the same
> caveat documented in `bantoo-create-customer.e2e.test.ts`'s test B. This report tests the
> **downstream resolve/execute behavior** for both underlying city scenarios directly, which is
> deterministic regardless of how the natural-language conditional gets extracted.

- **(a) existing is in the SAME city (Douala) as the request:**
  - **Expected:** either an associate/update path, or at most a confirm — never a forced blind
    auto-merge.
  - **Actual:** `resolve.ts`'s guard is `!isExactCustomerNameMatch(...) || customerConflictsWithExisting(...)`
    — the two conditions are OR'd, so **any non-exact name match always surfaces the duplicate
    prompt, regardless of whether city/phone/whatsapp actually conflict.** "Sunrise Foods" vs
    "Sunrise Foods SARL" is not an exact match (case/accent/whitespace-normalized), so the prompt
    fires even though nothing conflicts and the city is identical. This is **stricter** than
    "silently associate/update," which technically satisfies "not a forced blind auto-merge" — the
    existing record is never touched without an explicit choice.
  - **Result: PASS** (safety-wise), but flagged as a **UX finding**: same-city, phone-identical,
    substring-name matches always require a manual click even when there is no real ambiguity.
    Not a correctness bug, but a possible friction/over-prompting issue worth a product decision
    (see Proposed Fix below).

- **(b) existing is in a DIFFERENT city (Yaoundé) than the request (Douala):**
  - **Expected:** duplicate-choice prompt.
  - **Actual:** same code path, `duplicateCandidate` set, prompt raised.
  - **Result: PASS.**

- **GAP found (not in the original 7 scenarios, but directly relevant to "same phone, different
  name spelling"):** `resolve.ts`'s `create_customer` duplicate check is **name-text-match-only**.
  `resolveParty()` → `loadEntityCandidates(ctx, "customer")` loads only `{id, name}` from
  `listParties` (see `lib/bantoo/entities.ts`) and ranks purely on name text
  (`lib/bantoo/match.ts`'s `similarity`). It **never** cross-checks phone/whatsapp/email. Separately,
  `lib/parties.ts`'s `findPossiblePartyDuplicates` *does* support exact phone/whatsapp matching
  (score 100) — but it is only called from `ensurePartyId`'s create-time safety net in
  `app/actions/bantoo.ts`, and even there it is invoked with **only `{ name: input.partyName }`** —
  phone/whatsapp are never passed in, so that capability is effectively dead code for
  `create_customer`'s flow today.
  - **Test:** existing "Sunrise Foods" (Douala, phone +237611112222); new command names a
    genuinely different-looking business, "Boulangerie Etoile," in Douala, with the **exact same
    phone number**.
  - **Actual:** no name-based match at all (score too low) ⇒ `duplicateCandidate=null`,
    `createParty=true` ⇒ execute creates a **second, brand-new party with the identical phone
    number**, with zero warning to the user.
  - **Result: CONFIRMED GAP.** Two customer records with the same phone number can silently coexist
    whenever their names don't textually resemble each other, even though the system already has a
    phone-matching primitive (`findPossiblePartyDuplicates`) that is simply never wired up for this
    path.
  - **Proposed fix:** in `resolve.ts`'s `create_customer` case, after the existing name-based
    `resolveParty` call, also call `findPossiblePartyDuplicates(ctx.orgId, { name: draft.partyName,
    phone: draft.phone, whatsapp: draft.whatsapp })` (already imported/available via
    `lib/parties.ts`) and treat a phone/whatsapp-matched-but-name-mismatched result the same way as
    the existing `duplicateCandidate` path (surface the prompt). This closes the gap without
    touching the existing name-based logic.

### 4. Person vs company
**Command:** "Create Golu Transport Ltd as a new customer in Ngoundéré" against an existing
**individual person** "Golu" (Garoua, no company name, no other fields).

- **Expected:** the system should not confuse the individual with the unrelated company — either it
  keeps them separate, or (per the existing fix) correctly treats it as a conflicting fuzzy match
  requiring a choice.
- **Actual:** identical mechanism to Scenario 2 — the substring match auto-selects "Golu," the
  non-exact-name check overrides it, `duplicateCandidate` is set to the individual's record, and
  the prompt is shown. Confirming with no choice fails; the individual's record is left completely
  untouched (verified via `findParty` read-back); no new party silently created either.
- **Result: PASS.** Note: the system has **no structural "person vs. company" distinction at all**
  (no `partyKind`/`isCompany` field on `Party` — only `companyName` being null/non-null as a proxy,
  which is not used anywhere in the matching or conflict logic). The correct outcome here is
  achieved only as a side effect of the generic non-exact-name-always-prompts rule from
  `012175a`/Scenario 2's fix, not because of any person/company-aware logic. This is fine
  behaviorally, but worth knowing: a person named e.g. "Transport Golu" that fuzzy-matches a
  genuinely-unrelated *company* "Transport Golu Ltd" gets the exact same safe treatment only because
  the fix is name-match-driven, not because the system understands entity kind.

### 5. "Create as new" choice
**Command:** duplicate scenario from #2, user explicitly picks "create new."

- **Expected:** a NEW party id is created (never reused); ALL submitted fields persist.
- **Actual:** `executeBantooAction` with `duplicateResolution: "create_new"` → `forceCreate: true`
  in `ensurePartyId`, which skips the `findPossiblePartyDuplicates` safety net and always creates.
  Verified: new party id ≠ existing "Golu" id; `name`, `city`, `phone`, `whatsapp`, `email`,
  `companyName` (defaulted to the customer's own name), `paymentTermsDays`, `creditLimit`, and
  `notes` all persisted correctly on the NEW record; the pre-existing "Golu"/Garoua record is
  byte-for-byte untouched (`name`, `city`, `phone: null`, `whatsapp: null`, `email: null`); 2 total
  customers exist afterward.
- **Result: PASS.** Confirms the immediately-prior sprint's fix (`57589fb`) still holds — no
  regression from `de87013`'s field-persistence changes.

### 6. "Use existing" choice
**Command:** duplicate scenario, user explicitly picks "use existing," this request omits email but
supplies a new city/phone; existing record already has an email on file.

- **Expected:** the EXISTING party id is reused/updated; only fields present in THIS request are
  updated; no silent overwrite of unrelated existing fields (e.g. existing email survives).
- **Actual:** `executeBantooAction`'s `create_customer` branch with `input.partyId` set builds an
  `enrichment` object containing only the non-empty draft fields (city, phone in this test) and
  calls `updateParty` with just those keys — `email` is never included in the payload when the
  draft's email field is empty, and `updateParty`'s Prisma-style semantics treat `undefined` as
  "leave untouched." Verified: `city` and `phone` updated to the new values; pre-existing
  `email: "old-contact@golu.example"` survives completely unchanged; `name` is not renamed (the
  "use existing" flow never renames); exactly 1 customer record exists afterward (no new row).
- **Result: PASS.**

### 7. Supplier side — `create_supplier` gap
**Command pattern (mirroring #2 for suppliers):** "Create Nile Packaging SARL as a new supplier in
Douala with phone +237677889900." Existing supplier "Nile" (Douala, no other fields).

- **Expected/documented-as-likely-gap per task brief:** confirm whether ANY disambiguation occurs,
  or whether it silently auto-associates/misattaches like the customer bug did pre-fix.
- **Actual:** `resolve.ts`'s `case "create_supplier"` (its own doc comment explicitly says: *"mirrors
  create_customer's case exactly (field-for-field), minus the possible-duplicate safety fix... A
  HIGH-confidence name match still auto-selects the existing supplier... only the extra
  conflicting-details disambiguation prompt is not yet offered here"*). Verified with test evidence:
  - `proposal.partyId` = the existing "Nile" supplier id, `createParty=false`.
  - `proposal.duplicateCandidate` — **the field doesn't even get populated; it stays `null`** (no
    `BantooProposal.duplicateCandidate` is ever set anywhere in the `create_supplier` case).
  - No warning code containing "duplicate" is ever raised.
  - Confirming & saving with the default (no-choice) execute input **succeeds** (`ok: true`) and
    silently returns `href: "/suppliers/party_nile"`, `number: "Nile"` — i.e. it silently
    re-attaches to the pre-existing, unrelated "Nile" supplier. "Nile Packaging SARL" is **never
    created and never appears anywhere**; its phone number (`+237677889900`) is **silently
    discarded** (there is also no enrichment/`updateParty` call at all for the "use existing" /
    reused-party path of `create_supplier` in `app/actions/bantoo.ts`, unlike `create_customer`'s
    enrichment block — a second, related gap: even if a supplier duplicate check existed, the
    execute-time reuse path has no field-enrichment logic yet either).
  - Only 1 supplier exists after the operation (`listParties("org_A", "supplier")` → 1 row,
    unchanged from before).
  - **Parity baseline confirmed:** the exact same command pattern run against `create_customer`
    (same names/city/phone, just customer instead of supplier) correctly sets
    `duplicateCandidate` and requires a choice — proving this is specifically a `create_supplier`
    gap, not a shared-infrastructure limitation.
- **Result: CONFIRMED CRITICAL GAP — needs Track-4-style fix ported to `create_supplier`.** This is
  materially worse than the original customer bug this sprint fixed: it doesn't just fail to warn,
  it silently discards the new supplier's submitted contact details entirely by reusing the wrong
  record with zero write of the new data.
- **Proposed fix (precise, for the follow-up task — not applied here per isolation rules):**
  1. In `lib/bantoo/resolve.ts`'s `case "create_supplier"`, add the supplier-side mirror of the
     `create_customer` safety block (lines ~774–804): fetch `getPartyContact(ctx.orgId, party.id)`
     when `party.id` is set, define a `supplierConflictsWithExisting`/`isExactSupplierNameMatch`
     pair identical in shape to the existing customer helpers, and — on any non-exact name match OR
     a conflicting city/phone/whatsapp — set `proposal.partyId = null`, `proposal.createParty =
     false`, populate a new `duplicateCandidate` (the type already exists and is generic enough to
     reuse), and raise a new `possibleDuplicateSupplier` warning code (mirroring
     `possibleDuplicateCustomer`; needs an entry in `messages/en.json`/`messages/fr.json` and
     `lib/bantoo/types.ts`'s `BantooWarningCode` union).
  2. In `app/actions/bantoo.ts`'s `case "create_supplier"`, add the customer-side's `enrichment`
     block (mirroring lines ~526–566) for the `input.partyId` "use existing" path, and thread a
     `forceCreate: input.duplicateResolution === "create_new"` flag into `ensurePartyId` for the
     brand-new-party path (mirroring line 591), exactly as `create_customer` already does.
  3. In `components/BantooCommand.tsx`, the existing `duplicateChoiceBlock`/`needsDuplicateChoice`
     logic already keys only off `proposal?.duplicateCandidate` being truthy — once (1) populates
     `duplicateCandidate` for suppliers too, the same UI block and `canConfirm` gating should work
     for `create_supplier` with no separate supplier-specific UI code needed, provided
     `duplicateResolution` is not narrowed to a customer-only wire type (already generic:
     `z.enum(["use_existing", "create_new"])` in `app/actions/bantoo.ts`'s `inputSchema`).

---

## Summary table

| # | Scenario | Expected | Actual | Result |
|---|---|---|---|---|
| 1 | Exact duplicate, no conflict | Silent auto-associate | Silent auto-associate | **PASS** |
| 2 | Fuzzy name match | Must prompt | Prompts | **PASS** |
| 3a | Fuzzy name, same city, phone match | Assoc/update or confirm, not blind merge | Always prompts (stricter) | **PASS** (UX finding: over-prompts even when nothing conflicts) |
| 3b | Fuzzy name, different city | Must prompt | Prompts | **PASS** |
| 3-gap | Same phone, dissimilar name | (not asked, but implied by spec intent) | **Not detected at all** — silent true duplicate created | **GAP** (see proposed fix above) |
| 4 | Person vs. company fuzzy match | Correct disambiguation, no confusion | Prompts correctly (via generic non-exact-match rule, not person/company-aware) | **PASS** |
| 5 | "Create as new" | New id, all fields, old untouched | Confirmed | **PASS** |
| 6 | "Use existing" | Only submitted fields change, no silent overwrite | Confirmed | **PASS** |
| 7 | Supplier-side parity | Gap suspected | **Confirmed**: silent misattachment, submitted fields discarded, zero warning | **CONFIRMED CRITICAL GAP — needs fix** |

## Overall verdict

The `create_customer` duplicate-disambiguation mechanism from the prior two sprints (`012175a`,
`57589fb`, `de87013`) is **still correct and shows no regressions** across all 6 required customer
scenarios (1–6), including the newly-added field-persistence sprint on top of it. One genuine
**name-vs-phone cross-check gap** was found and documented (not one of the original 7 scenarios,
but directly adjacent to #3's intent) with a precise proposed fix.

`create_supplier` has **confirmed, critical, and worse-than-the-original-bug** duplicate-safety gap:
it silently misattaches new supplier submissions to unrelated existing suppliers with zero user
warning and silently discards the new data. This is **not** "already has equivalent protection" —
it is a real, reproducible gap requiring the Track-4-style fix described above, ported to the
supplier code paths.
