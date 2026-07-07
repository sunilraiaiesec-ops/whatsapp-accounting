# Track 6 — Unsupported-Action Safety Agent

**Scope:** Ask Bantoo's handling of recognized-but-unbuilt actions (archive
customer, reactivate customer, merge duplicate customers, upload customer
document, edit/void/email/apply-payment on a sales invoice) and genuinely
out-of-vocabulary commands (delete, weather, jokes).

**Repo state:** `de87013` (HEAD), one commit past `012175a` as expected.

**Verification method:** called the real code paths directly (no source
edits) —
`lib/command-parse.ts` (`parseBantooCommandText`) → `lib/bantoo/fallback.ts`
(`ruleBasedExtract`) → `lib/bantoo/resolve.ts` (`resolveExtraction`) →
`app/actions/bantoo.ts` (`executeBantooAction`) — plus reading
`components/BantooCommand.tsx` and `messages/{en,fr}.json` for the UI/i18n
layer.

---

## Top-line result

**No FALSE SUCCESS cases found.** In every scenario tested, Ask Bantoo never
claims "saved"/"done" for an action it did not perform, never writes to the
database, and never shows an enabled Confirm & Save button for a
fundamentally unsupported action. The three defense layers (rule
classification → `resolve.ts` warning → `BantooCommand.tsx`'s `canConfirm` →
`executeBantooAction`'s own hard-coded refusal) are all correctly wired and
covered by existing tests (`resolve-customer.test.ts`,
`resolve-supplier.test.ts`, `resolve-sales.test.ts`, `bantoo.test.ts`,
`warnings-i18n.test.ts`).

**However, the rule-based parser — the code path actually used whenever AI
is not configured, the AI call fails, or AI credits are exhausted (all real,
common production states; see `app/api/bantoo/extract/route.ts`) — fails to
classify several of the swarm's own required natural-language test commands
as the designed "not available yet" action.** Instead of a confident
`notYetAvailable` message, the user gets the much vaguer generic "I
couldn't tell what to do" response. This is **not** a false-success bug (no
destructive action, no button offered), but it is a real regression against
this sprint's stated goal ("a standard 'not available yet' response... Known
unsupported actions: archive customer, reactivate customer, merge duplicate
customers, upload customer document") for exactly the phrasings a real user
is likely to type. See **Finding A** below.

A minor i18n copy-duplication (not a live bug) is noted in **Finding C**.

---

## Command-by-command results

| # | Command | Expected | Actual | Pass/Fail |
|---|---|---|---|---|
| 1 | "Merge Musa Trading and Musa Ltd." | `unsupported_customer_action` (merge) → notYetAvailable | **`unknown`** — generic "I couldn't tell what to do" | **FAIL (precision gap, not false success)** — Finding A |
| 1fr | "Fusionner Musa Trading et Musa Ltd." | same | **`unknown`** | **FAIL** — Finding A |
| 2 | "Archive Musa." | `unsupported_customer_action` (archive) → notYetAvailable | **`unknown`** | **FAIL** — Finding A |
| 2fr | "Archiver Musa." | same | **`unknown`** | **FAIL** — Finding A |
| 3 | "Delete Musa." | Not in vocabulary → `unknown`, no misroute | `unknown` | **PASS** |
| 3fr | "Supprimer Musa." | same | `unknown` | **PASS** |
| 4 | "Upload this document for Musa's profile." | `unsupported_customer_action` (upload_document) → notYetAvailable | **`unknown`** | **FAIL** — Finding A |
| 4fr | "Téléverser ce document pour Musa." | same | **`unknown`** | **FAIL** — Finding A |
| 5 | "Email the invoice to Musa." | `unsupported_sales_action` (email) → notYetAvailable | `unsupported_sales_action` (email) → notYetAvailable | **PASS** |
| 5fr | "Envoyer la facture par email à Musa." | same | same | **PASS** |
| 6 | "Void invoice INV-00042." | `unsupported_sales_action` (void) → notYetAvailable | `unsupported_sales_action` (void) → notYetAvailable | **PASS** |
| 6fr | "Annuler la facture INV-00042." | same | same | **PASS** |
| 7 | "Apply a partial payment allocation of 5000 XAF to Musa's oldest invoice." | `unsupported_sales_action` (apply_payment) → notYetAvailable, or at least a clear "not available" | **`unknown`** | **FAIL (scope gap, see Finding B — lower severity)** |
| 7fr | French equivalent | same | **`unknown`** | **FAIL** — Finding B |
| 8 | "What's the weather in Douala?" | `unknown`, no confirm button, no write | `unknown` | **PASS** |
| 8b | "Tell me a joke." | `unknown` | `unknown` | **PASS** |
| 9 | "Delete the note I added for Musa" | Not misrouted to a generic delete/archive/merge catch-all | `unknown` — correctly NOT matched by any customer/supplier/sales pattern | **PASS** |
| 10 | "Merge Nonexistent Corp and Musa." | notYetAvailable should win / never show a confusing "customer not found" first | Rule parser returns `unknown` here too (no literal "customer" keyword — same Finding A gap), so the precedence question never even arises via this exact wording. **Precedence was verified directly at the `resolveExtraction` level instead** (see below) and is correct. | **PASS (precedence verified)** |

### Precedence check (command #10), verified directly against `resolveExtraction`

Since the literal wording of command #10 doesn't trigger the merge pattern
at all (Finding A), I verified the actual precedence logic by calling
`resolveExtraction` directly with an `unsupported_customer_action`/
`unsupported_supplier_action`/`unsupported_sales_action` payload naming a
customer that does not exist in the org (`loadEntityCandidates` mocked to
return zero candidates):

- `proposal.warnings` is **exactly** `[{ code: "notYetAvailable" }]` — never
  `customerNotFound`/`supplierNotFound`.
- `loadEntityCandidates` (the party-lookup call) is **never invoked at all**
  for these three action kinds — `resolve.ts`'s `case
  "unsupported_customer_action"` (and its supplier/sales mirrors) never call
  `resolveParty()`. This is a deliberate, correct design: the "not
  available yet" message can structurally never be preceded or masked by a
  "customer not found" warning, in either order.

This is regression-tested in the new test file (see below).

---

## Findings

### Finding A — CRITICAL PRECISION GAP (not false success): rule-based parser requires the literal word "customer"/"client" for merge/archive/upload, so natural phrasing silently falls to generic "unknown"

**Root cause:** in `lib/command-parse.ts`, `CUSTOMER_UNSUPPORTED_MERGE`,
`CUSTOMER_UNSUPPORTED_ARCHIVE`, `CUSTOMER_UNSUPPORTED_REACTIVATE`, and
`CUSTOMER_UNSUPPORTED_UPLOAD` (and their supplier mirrors) all require the
literal word "customer(s)"/"client(s)" immediately after the verb:

```370:388:ledger/lib/command-parse.ts
const CUSTOMER_UNSUPPORTED_MERGE = [
  /\bmerge\s+(?:duplicate\s+)?customers?\s+(.+?)\s+(?:and|with)\s+(.+)$/i,
  /\bfusionner\s+(?:les\s+)?clients?\s+(.+?)\s+(?:et|avec)\s+(.+)$/i,
];

const CUSTOMER_UNSUPPORTED_ARCHIVE = [
  /\barchive\s+customer\s+(.+)$/i,
  /\barchiver\s+(?:le\s+)?client\s+(.+)$/i,
];
```

A natural "Archive Musa." / "Merge Musa Trading and Musa Ltd." / "Upload
this document for Musa's profile." — exactly the swarm's own required test
phrasings, and plausible real user input — contains no such keyword, so
`detectCustomerAction()` returns `null` for every pattern, `detectIntent()`
falls through every other branch (`RECEIPT_PATTERNS`, `PAYMENT_PATTERNS`,
etc. all also miss), and the final classification is `"unknown"`.

**Why this matters even though it's not a false success:** this sprint's
entire deliverable was a confident, well-worded "not available yet" message
for exactly these five actions, specifically so users get useful feedback
instead of a generic "I'm not sure" response. The regex being this brittle
means the feature silently doesn't fire for the most natural phrasing of
the very commands it was built for — and this is the **only** path
exercised when AI is not configured (a supported, documented mode — see
`aiDisabled`/`aiFallbackNote` in `BantooCommand.tsx`) or when the AI call
fails/is rate-limited (`app/api/bantoo/extract/route.ts` degrades to
`ruleBasedExtract` in both cases).

**Secondary bug found while investigating:** the FR merge pattern is
inconsistent with its own archive/reactivate siblings. Archive/reactivate
accept an optional singular article: `archiver\s+(?:le\s+)?client`. Merge
only accepts the plural: `fusionner\s+(?:les\s+)?clients?` — it does **not**
accept `(?:le\s+)?client` singular. So "Archiver le client Musa." correctly
resolves to `unsupported_customer_action`, but the parallel "Fusionner le
client Musa Trading et Musa Ltd." does not — it falls to `unknown`. This
looks like an unintentional oversight rather than a deliberate design
choice, since every other pair in this file is a deliberate mirror of each
other.

**Proposed fix** (for the owner of `lib/command-parse.ts` — not applied
here per the swarm's isolation rules):
1. Broaden `CUSTOMER_UNSUPPORTED_MERGE`/`ARCHIVE`/`REACTIVATE`/`UPLOAD` (and
   their supplier mirrors) to make the "customer(s)"/"client(s)" keyword
   **optional**, the same way the AI prompt already treats it as implicit
   context rather than a required literal token — e.g.
   `/\bmerge\s+(?:duplicate\s+)?(?:customers?\s+)?(.+?)\s+(?:and|with)\s+(.+)$/i`.
   This needs care to avoid over-matching (e.g. "merge" appearing in an
   unrelated sentence) — a reasonable middle ground is requiring the
   keyword OR requiring both captured names to look like the org's actual
   party names (checked downstream in `resolve.ts`, which already handles
   an unmatched name gracefully).
2. At minimum, make the FR merge pattern consistent with archive/reactivate
   by accepting `(?:le\s+)?clients?` the same way they do.
3. Consider extending the blend logic in `lib/bantoo/fallback.ts`'s
   `blendExtraction()` so a rule-parser "unknown" for text containing
   "merge"/"archive"/"upload"/"fusionner"/"archiver"/"téléverser" plus a
   name-like token gets a second, looser pass before giving up — mirroring
   how `create_customer`/`create_supplier` already get a similar rescue via
   `LOW_CONFIDENCE_THRESHOLD` promotion.

**Regression tests added:** `ledger/lib/bantoo/qa-swarm-06-unsupported-safety.test.ts`
— `"KNOWN GAP: naturally-phrased merge/archive/upload commands..."`,
`"...FR equivalents..."`, and `"...FR merge pattern is inconsistent..."`
(3 tests). **Result: all 3 PASS** — they assert the *current* (buggy)
`"unknown"` behavior as a characterization test, so they will need to be
flipped to assert the correct `unsupported_customer_action` classification
once the regex fix above lands (at which point they'll fail and prompt an
update — that's intentional, it's the signal the fix worked).

---

### Finding B — Lower severity, by-design scope limit: "apply payment" unsupported pattern only matches an explicit invoice number

**Command:** "Apply a partial payment allocation of 5000 XAF to Musa's
oldest invoice." / French equivalent.

**Actual:** `unknown` (rule-based path).

**Root cause:** `SALES_UNSUPPORTED_APPLY_PAYMENT` requires literally
`apply payment to invoice <TOKEN>` — see the doc comment above
`SalesActionKind` in `lib/command-parse.ts`: *"applying a payment to one
specific invoice **number**"* is explicitly the documented scope, not a
free-text reference like "Musa's oldest invoice." This is arguably a
deliberate scope boundary rather than a bug, but it's worth flagging
because it's one of the swarm's required test phrasings and a realistic
thing a small-shop owner might actually type. Recommend either: (a)
document this limitation more prominently, or (b) broaden the pattern to
also catch "apply...payment...to...invoice" without a strict number,
routing it to the same `unsupported_apply_payment` / notYetAvailable
response (safe either way, since it's still just a warning, never a write).

**Regression test added:** same file, `"KNOWN GAP: 'apply payment'..."` —
**PASS** (documents current `unknown` behavior).

---

### Finding C — Minor: duplicated `notYetAvailable` i18n key, one copy is dead code (copy-drift risk, not currently manifesting)

`messages/en.json` and `messages/fr.json` both define **two** separate keys
with the same text:

- `command.notYetAvailable` (top-level, line ~243/243) — **not referenced
  anywhere** in `.ts`/`.tsx` (verified via repo-wide search of
  `components/` and `app/`).
- `command.warnings.notYetAvailable` (nested, line ~326/326) — the one
  actually read by `BantooCommand.tsx`'s `warningText()` via
  `t(\`warnings.${code}\`)`.

Both currently read identically in EN and FR, so there is **no live user-
facing bug today**. But because they're two independently-editable strings
with no shared source, a future copy edit to one (e.g. a translator fixing
a typo in the nested key) could silently diverge from the other, leaving
dead — but confusing — duplicate copy in the catalog. Recommend deleting
the unused top-level `command.notYetAvailable` key, or if it's meant to be
reused elsewhere, make `BantooCommand.tsx` read from a single canonical key.

**Regression test added:** same file, `"notYetAvailable i18n copy-drift
guard"` — asserts byte-equality between the two keys in both locales.
**Result: PASS** (they are currently identical; this test will fail loudly
if a future edit only touches one of them, catching the drift before it
ships).

---

### Finding D — Informational: `executeBantooAction`'s server-side refusal message is hard-coded English, not localized

`app/actions/bantoo.ts`'s `unsupported_customer_action` /
`unsupported_supplier_action` / `unsupported_sales_action` cases all return:

```
return { ok: false, error: "This action is not available yet." };
```

This string is **not** run through next-intl and is always English,
regardless of the user's locale. In the normal flow this is unreachable —
`BantooCommand.tsx`'s `canConfirm` correctly excludes all three unsupported
actions from ever showing a Confirm & Save button, so a French user never
actually sees this string in practice (verified by reading the `canConfirm`
computation and the confirm-button render block). This is flagged purely as
a defense-in-depth/robustness note: if the client-side gating were ever
weakened (e.g., a future refactor), a French user hitting this path would
briefly see English text. Low priority; no fix proposed since it's not
reachable today and the existing `bantoo.test.ts` already regression-tests
the English string verbatim (`"unsupported_customer_action: never silently
succeeds, always reports not-available"`, line 977) — changing it would
need to be coordinated with that existing test.

No new test added for this (informational only, not independently
actionable without touching the shared file).

---

## Safety invariants verified (all PASS)

Verified directly against `resolveExtraction` and `executeBantooAction`
(not just by reading the source):

1. **No database write ever happens for a genuinely unsupported action**,
   even under an adversarial payload (`createParty: true` with a full
   name/phone/city, an attached `partyId`, an attached `bankAccountId` +
   `lineAccountId` + `amount`). Verified by spying on every write function
   used anywhere in `app/actions/bantoo.ts` (`createParty`, `updateParty`,
   `updatePartyNotes`, `receiveGoods`, `createInventoryItem`,
   `createPayment`, `createSalesInvoice`, `createCreditNote`,
   `createRefundReceipt`, `createReceipt`, `createSalesReceipt`,
   `createPurchaseInvoice`) and confirming zero calls across all three
   unsupported action kinds.
2. **`executeBantooAction` always returns `ok: false`** for the three
   unsupported action kinds — there is no code path that returns a truthy
   `href`/`number` a client could mistake for a saved-record confirmation.
3. **`resolveExtraction` never resolves a party (and therefore never
   surfaces `customerNotFound`/`supplierNotFound`) for an unsupported
   action** — `loadEntityCandidates` is never even called — so the
   precedence question in swarm command #10 structurally cannot occur: the
   "not available yet" warning can never be preceded or masked by an
   entity-resolution warning, in either direction.
4. **The UI never offers a Confirm & Save button** for `unknown` or any of
   the three `unsupported_*_action` kinds (`BantooCommand.tsx`'s
   `canConfirm`, verified by reading the render logic — `renderProposalFields()`
   also explicitly returns `null` for all three unsupported cases, so no
   stray editable fields are shown either).
5. **Genuinely out-of-vocabulary commands ("Delete Musa.", "What's the
   weather in Douala?", "Tell me a joke.", "Delete the note I added for
   Musa") are never misrouted** to any recognized action, confirmed by
   calling the real parser and asserting `action === "unknown"` with no
   partial `customerAction`/`salesAction` payload attached.
6. **All three unsupported action kinds are classified at high confidence**
   (never flagged `lowConfidence`), matching the module's stated design
   intent that these are "recognized confidently... not 'not sure'".

---

## Regression tests added

**File:** `ledger/lib/bantoo/qa-swarm-06-unsupported-safety.test.ts` (new
file, does not modify any existing test).

**Run command:** `npx vitest run lib/bantoo/qa-swarm-06-unsupported-safety.test.ts`

**Result: 17/17 PASS.**

| Test | Result |
|---|---|
| `unsupported_customer_action` (merge) w/ nonexistent customer → notYetAvailable only, never customerNotFound | PASS |
| `unsupported_supplier_action` (archive) w/ nonexistent supplier → notYetAvailable only, never supplierNotFound | PASS |
| `unsupported_sales_action` (void) never resolves a party even when a name is present | PASS |
| all three unsupported kinds classify at high confidence (never `lowConfidence`) | PASS |
| `executeBantooAction` refuses `unsupported_customer_action` even with `createParty:true` + full profile | PASS |
| `executeBantooAction` refuses `unsupported_supplier_action` even with an attached `partyId` | PASS |
| `executeBantooAction` refuses `unsupported_sales_action` even with amount + line account attached | PASS |
| `result.ok` is always `false` for all three unsupported kinds | PASS |
| control group: commands WITH the literal customer/client/invoice keyword classify correctly | PASS |
| out-of-vocabulary commands (#3, #8, #9) never misrouted | PASS |
| **KNOWN GAP:** EN merge/archive/upload without literal keyword → `unknown` (Finding A) | PASS (documents bug) |
| **KNOWN GAP:** FR equivalents → `unknown` (Finding A) | PASS (documents bug) |
| **KNOWN GAP:** FR merge/archive article inconsistency (Finding A) | PASS (documents bug) |
| **KNOWN GAP:** "apply payment" natural phrasing → `unknown` (Finding B) | PASS (documents bug) |
| `ruleBasedExtract("unknown")` never carries a stray action-specific payload | PASS |
| `parseBantooCommandText` confirms true `unknown` fallthrough (not a partial match) for gap commands | PASS |
| `notYetAvailable` i18n copy-drift guard (Finding C) | PASS |

No existing test files were modified. No source files under
`lib/ai/`, `lib/bantoo/`, `lib/command-parse.ts`, `app/actions/bantoo.ts`,
`components/BantooCommand.tsx`, `messages/*.json`, or
`prisma/schema.prisma` were changed.
