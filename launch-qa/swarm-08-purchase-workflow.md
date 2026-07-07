# Ask Bantoo Reliability Swarm — Track 8: Purchase Workflow Agent

QA pass over Ask Bantoo's purchase-side transaction handling: supplier purchases,
supplier payments, receive stock / goods receipt, and inventory item creation. Scope
per the swarm brief: test-only, no fixes to `lib/`, `app/`, `components/`, `messages/`,
or `prisma/schema.prisma`, and **no modification of any accounting/ledger/inventory
logic under any circumstances**. No commits/pushes made.

Environment verified at HEAD `de87013` ("Fix Ask Bantoo create_customer field
persistence and duplicate-save behavior"), one commit ahead of `012175a` as expected.
No `OPENAI_API_KEY` is set in `ledger/.env`, so **every plain-text Ask Bantoo command in
this environment goes through the rule-based fallback parser
(`lib/command-parse.ts` / `lib/bantoo/fallback.ts`), never the AI extractor** — this is
a live, reachable production code path (see `app/api/bantoo/extract/route.ts`'s
fallback branches: AI-unconfigured, AI-down, rate-limited, or out-of-credits all land
here), not a sandbox-only corner case. All Part A findings below reflect that real
configuration.

---

## 0. What's actually implemented today (per `lib/ai/actions.ts` / `lib/ai/extract.ts`)

| Requested concept | Actual Ask Bantoo action | Exists? |
|---|---|---|
| Receive stock / goods receipt | `receive_stock` | ✅ |
| Add a new inventory item | `add_inventory_item` | ✅ |
| Supplier purchase (bill on credit) | `supplier_purchase` | ✅ |
| Supplier payment | **No dedicated action.** Only `expense` (generic cash-out, optionally tagged with a `supplier_name`) exists. There is no `supplier_payment` action type, and `expense` was never designed to touch Accounts Payable — it always posts to an EXPENSE-type account, never the payable control account (see §3). | ⚠️ (mapped, not a real fit) |

This matches the prior audit's finding and `launch-qa/bugs.md` BUG-009. **Correction to
`launch-qa/known-issues.md` line 32:** that doc currently says a supplier-bill payment
can be worked around by "Record as `expense`". As of this HEAD, **that workaround is
completely non-functional on a fresh organization** — see §3, this is not a minor UX
gap, it's a hard failure (`"Choose an expense account."`) for every attempt.

---

## 1. Required test commands — results

### 1. "Received 150 bags of rice from Adamou at 12,000 XAF each." (`receive_stock`)
- **Rule-parser (Part A) — FAIL.** The literal currency word "XAF" disables
  `detectIntent()`'s `create_goods_receipt` branch entirely
  (`lib/command-parse.ts` requires `isStockReceipt && hasQuantity && !hasCurrency`).
  The command silently misfires as `create_receipt` → `ruleBasedExtract` returns
  `customer_payment` with `amount: null` and a mangled party name ("Adamou at each").
  **It is never offered to the user as a goods receipt at all.** Confirmed the exact
  same sentence *without* the currency word ("...at 12,000 each.") correctly
  classifies as `receive_stock` — proving the currency word is the trigger. Also found:
  even in the successfully-classified case, `cost_price` is **always** `null` —
  `ruleBasedExtract`'s goods-receipt branch never attempts to parse a unit cost, so a
  user must always manually type it into the confirmation form.
- **Full chain (Part B, action supplied directly as a correctly-shaped
  `ExtractedAction`, bypassing the Part A parsing bug on purpose) — PASS.** Creates the
  item + goods receipt, `qtyOnHand`/`valueOnHand` increase correctly, weighted-average
  cost is computed correctly across a second receipt with a different quantity/unit
  ("tons"), the supplier's payable balance increases by exactly the receipt total, and
  the receipt shows up in `getPartyPurchaseHistoryInRange` for that supplier.
- **Verdict: execute-layer PASS, text-classification-layer FAIL** (product decision
  needed on the currency-word rule; not something this track should patch).

### 2. "Add a new inventory item: 50kg cement bags, cost 4,500 XAF each." (`add_inventory_item`)
- **Rule-parser (Part A) — FAIL.** `add_inventory_item` has **zero rule-based
  recognition** — there is no branch in `ruleBasedExtract`/`detectIntent`
  (`lib/command-parse.ts`, `lib/bantoo/fallback.ts`) that ever returns this action.
  Every phrasing degrades to `unknown`/confidence `0`, regardless of wording. Any org
  without a working AI extractor can **never** register a new product via typed text.
- **Full chain (Part B) — PASS.** Creates the catalog item with correct `salePrice`,
  `costPrice`, `unit`; correctly leaves `qtyOnHand` at 0 with no supplier/ledger touch
  when no opening quantity is given; correctly posts a dual effect (item creation +
  opening-stock goods receipt against a new supplier, moving inventory and payable
  together) when an opening quantity + supplier are both given.
- **Verdict: execute-layer PASS, text-classification-layer FAIL (total gap, not a
  parsing bug — the feature was simply never wired into the rule parser).**

### 3. "Paid Nile Packaging SARL 200,000 XAF." (supplier payment via `expense`)
- **Rule-parser (Part A) — PARTIAL FAIL.** Correctly classifies as `expense` and
  extracts `amount: 200000`, but **drops the supplier name entirely** —
  `extractPartyName(text, "create_payment")` only recognizes a supplier via
  `TO_PARTY_PATTERN`, which requires the literal word "to"/"à"/"au"/"supplier"/
  "fournisseur"/"vendor" immediately before the name. The brief's own natural "Paid
  &lt;name&gt; &lt;amount&gt;" phrasing (no "to") never matches, so `supplier_name` is
  `null`. Confirmed the narrow phrasing the parser actually requires works: "Paid
  200,000 XAF **to** Nile Packaging SARL." correctly captures both fields.
- **Full chain (Part B) — CRITICAL BLOCKER, not just "AP unaffected."** See §3 below —
  this goes well past what the brief anticipated. It's not that the payment succeeds
  but doesn't clear AP; **the payment cannot be saved at all**, for this or any other
  `expense` command, on a fresh organization.
- **Verdict: FAIL at both layers, and the execute-layer failure is the more severe of
  the two — full write-up in §3.**

### 4. "Bought office supplies for 15,000 XAF from Douala Stationery." (`supplier_purchase` / `expense`)
- **Rule-parser (Part A) — FAIL.** "Bought ... from ..." is not recognized at all.
  `PAYMENT_PATTERNS`/`RECEIPT_PATTERNS`/`STOCK_RECEIPT_PATTERNS`
  (`lib/command-parse.ts`) only recognize "paid/pay/payé/décaissé/sent"-family verbs —
  "bought"/"buy"/"purchased" are absent from every trigger-word list for both
  `supplier_purchase` and `expense`. Always `unknown`.
- **Full chain (Part B, modeled directly as `supplier_purchase`) — PASS, with a
  secondary miscategorization bug.** The purchase invoice posts correctly and the
  supplier's payable balance increases by the invoice total — **but** the "line
  account" it silently picks is **"5000 — Cost of goods sold"**, not "6000 — General
  expenses," for a purchase that is obviously not inventory (office supplies). Root
  cause is the same underlying bug documented in full in §3
  (`paymentCounterpartAccounts()` in `lib/accounts.ts` silently drops every default
  EXPENSE account except COGS because they have `subtype: null`, and `resolve.ts`'s
  `supplier_purchase` branch falls back to whatever's left, which is only COGS). Every
  `supplier_purchase` on a fresh org — regardless of what was actually bought — gets
  booked to Cost of Goods Sold.
- **Verdict: text-classification FAIL (missing verb); execute-layer "PASS" only in the
  sense that it doesn't hard-fail — the accounting categorization is wrong for any
  non-inventory purchase.**

### 5. French equivalents
- **"Reçu 150 sacs de riz de Adamou à 12 000 XAF chacun."** (FR #1) — same
  currency-word bug reproduces: misclassifies as `customer_payment`, not
  `receive_stock`. Confirmed the currency-free French phrasing works correctly
  (`quantity: 150`, `unit: "sacs"`).
- **"Payé Nile Packaging SARL 200 000 XAF."** (FR #3) — same missing-supplier-name bug
  reproduces: `expense`, `amount: 200000`, `supplier_name: null`.
- **Verdict: both French bugs are the exact same root causes as their English
  counterparts — no separate i18n-specific defect found in this track's scope
  (contrast with other tracks' `messages/fr.json` warning-string gaps, which are a
  different class of French-support bug and out of scope here).**

### 6. Goods receipt referencing a supplier that doesn't exist yet
- "Received 100 bags of sugar from Brand New Supplier XYZ at 10,000 XAF each." —
  **compounding rule-parser bug found**: `CREATE_SUPPLIER_PATTERNS` includes
  `/\b(?:add|create|new|save|register)\s+(?:a\s+)?suppliers?\b/i`, which matches the
  substring **"New Supplier"** inside the counterpart's own name, hijacking
  classification into `create_supplier` instead of `receive_stock` — a name collision
  the `detectIntent()` ordering (create_* checks run first) can't protect against.
  With a non-colliding name ("Zanzibar Trading Co"), the same currency-word bug from
  case #1 applies instead.
- **Execute-layer behavior (the brief's real question) — PASS, and correctly safe on
  all three counts.** Given the action directly (bypassing the two parsing bugs
  above): resolve.ts sets `partyId: null` and `createParty: true` — it **offers** to
  create the new supplier as part of the same confirm-and-save action; it never
  silently creates a malformed/unlinked transaction; and if no supplier name is
  present at all, `executeBantooAction` **fails clearly** ("Choose the supplier this
  stock came from." — error message matches `/supplier/i`) rather than posting an
  orphaned goods receipt. Verified: no inventory item is created either, on that clean
  failure path.
- **Verdict: text-classification FAIL (2 compounding bugs); execute-layer PASS
  (exactly the safe behavior the brief was checking for).**

### 7. Quantity/unit variations
- **"Received 2 tons of maize from Adamou at 500,000 XAF per ton."** — same
  currency-word bug as #1 (misclassifies as `customer_payment`). With the currency word
  removed, "tons" as a unit **is** correctly supported by `QUANTITY_PATTERN`
  (`quantity: 2`, `unit: "tons"`).
- **"Received a dozen crates of soap from Adamou."** — **separate bug**:
  `QUANTITY_PATTERN` requires a **leading digit**
  (`/(\d[\d\s,.'']*(?:\.\d+)?)\s*(bags?|...)\b/i`). Word-form quantities like "a dozen"
  are never recognized, even though "crates" is itself a perfectly recognized unit —
  `parsed.quantityText` is `null`, and the command misclassifies as `customer_payment`
  (same downstream effect as the currency-word bug, different root cause). Confirmed
  the digit form of the identical request ("Received 12 crates of soap from Adamou.")
  works correctly.
- **Verdict: FAIL — two independent rule-parser gaps (currency words, word-form
  quantities), neither touches the execute layer since these never reach it as a
  correctly-shaped action without AI.**

---

## 2. Unsupported actions

No dedicated "unsupported_purchase_action" (mirroring `unsupported_customer_action` /
`unsupported_supplier_action` / `unsupported_sales_action` in `lib/ai/actions.ts`)
exists for purchase documents — e.g. "void that purchase invoice" or "apply this
payment to bill #123" has no recognized-but-not-yet-buildable action type. Confirmed by
reading `lib/ai/actions.ts`'s full `BANTOO_ACTION_TYPES` list: there is no
`unsupported_purchase_action`. A command like that falls straight to generic
`unknown` — which is a **safe** outcome (the standard "I couldn't tell what to do" /
"not sure" message, never a false success or a crash), just a less specific
one than the sales/customer/supplier tracks get. Not a blocker, but worth noting as a
scope gap consistent with `bugs.md` BUG-005's framing.

---

## 3. CRITICAL ACCOUNTING BLOCKER — the `expense` action is dead on arrival for every fresh organization, not just for supplier payments

This is the headline finding of this track and is **much broader** than the brief's
"does `expense` clear Accounts Payable?" question anticipated. It doesn't just fail to
clear AP — **it cannot be saved at all**, for *any* expense, supplier-related or not.

**Root cause.** `resolve.ts`'s `expense` branch does:
```ts
const accounts = await paymentCounterpartAccounts(ctx.orgId);
const expenses = accounts.filter((a) => a.type === "EXPENSE" && a.subtype !== "cogs");
```
`paymentCounterpartAccounts(orgId)` (`lib/accounts.ts`) runs:
```ts
prisma.account.findMany({
  where: {
    orgId,
    subtype: { notIn: ["bank", "cash"] },
    OR: [{ type: "EXPENSE" }, { subtype: "payable", isControl: true }],
  },
})
```
Under standard SQL three-valued logic, `<col> NOT IN (...)` evaluates to **UNKNOWN**
(not `TRUE`) whenever `<col> IS NULL` — Postgres (via Prisma's `notIn`) silently
**excludes every row whose `subtype` is `NULL`**, regardless of what the `OR` clause
says, because it's a separate top-level `AND` condition. `DEFAULT_CHART_OF_ACCOUNTS`
(`lib/chart-of-accounts.ts`) gives **every default EXPENSE account except "5000 Cost of
goods sold"** (which has `subtype: "cogs"`) no `subtype` at all (`undefined` →
`NULL` in Postgres): "6000 General expenses", "6100 Salaries & wages", "6200 Rent",
"6300 Transport & fuel", "6900 Bank charges" are **all** silently dropped by this
query, on every single organization, not just a test fixture.

Confirmed directly against a live copy of this query (probe script, run and discarded,
not committed):
```
all accounts: 1000 cash, 1010 bank, 1100 receivable, 1200 inventory, 1300 tax_recoverable,
  1500 fixed_asset, 2000 payable, 2100 tax, 3000 equity, 3900 retained, 4000 sales,
  4900 (null), 5000 EXPENSE/cogs, 6000 EXPENSE/null, 6100 EXPENSE/null, 6200 EXPENSE/null,
  6300 EXPENSE/null, 6900 EXPENSE/null
filtered (paymentCounterpartAccounts logic): [ '2000', '5000' ]   // only these 2 survive
```
That leaves exactly **one** EXPENSE-type row surviving the query — "5000 Cost of goods
sold" — which the `expense` branch (uniquely among all `resolve.ts` branches, precisely
so cash expenses never get miscategorized as COGS) then explicitly filters back **out**
with `a.subtype !== "cogs"`. Net result: `expenses` is an **empty array**,
`lineAccountId` is always `null`, the `noExpenseAccount` warning always fires, and
`app/actions/bantoo.ts`'s `case "expense"` hard-fails:
```ts
if (!input.lineAccountId) return { ok: false, error: "Choose an expense account." };
```
**for literally any plain-language expense** — rent, salaries, fuel, bank charges, a
supplier payment, "bought office supplies," anything — on any organization still using
the seeded default chart of accounts, i.e. **every brand-new org at launch.**

**Verified full chain (regression test, both scenarios):**
1. Plain, non-supplier expense ("Bought office supplies for 15,000 XAF", no supplier
   attached): `resolveExtraction` returns `lineAccountOptions: []`,
   `lineAccountId: null`, warning `noExpenseAccount`. `executeBantooAction` returns
   `{ ok: false, error: "Choose an expense account." }`. **Nothing is ever saved.**
2. The brief's actual required scenario — bill a supplier 200,000 XAF via
   `supplier_purchase` (confirmed AP balance = 200,000), then attempt "Paid Nile
   Packaging SARL 200,000 XAF." via `expense`: the supplier **does** resolve correctly
   (`partyId` matches), but the same `noExpenseAccount` blocker fires before any
   payment can be confirmed. `executeBantooAction` again returns `ok: false`. The
   supplier's payable balance is untouched afterward (200,000 XAF) — **not** because
   AP-clearing logic is missing from `expense` (which is also true — `resolve.ts` never
   offers the AP control account as a line-account option even when it *does* find
   candidates), but because the transaction can't be saved in the first place. Verified
   at the ledger level too: exactly one journal line ever references
   `(orgId, partyId: nile, accountId: payableAccount)` — the original bill's credit —
   because execute() never got far enough to write a second one.

**Impact:** this is not a narrow "supplier payment" gap. **Every single "record an
expense" Ask Bantoo command fails outright on every new organization**, independent of
whether AI is configured (the AI path calls the exact same `resolve.ts` code after
extraction). This is the single most severe finding across everything tested in this
track and should be treated as a hard launch blocker for the `expense` action
specifically — not a "document as a limitation" item.

**Suggested fix (described, not applied per isolation rules):** `paymentCounterpartAccounts`
/ `receiptCounterpartAccounts` in `lib/accounts.ts` need to stop relying on Prisma's
`notIn` against a nullable `subtype` column — e.g.
`OR: [{ subtype: null }, { subtype: { notIn: [...] } }]`, or filter in application code
after the query, or (more robustly) give every row in `DEFAULT_CHART_OF_ACCOUNTS` an
explicit non-null `subtype` so no account is ever silently invisible to any
subtype-based query in the codebase. This single fix would also resolve the secondary
"office supplies gets booked to COGS" miscategorization documented under required test
command #4, since a real "General expenses" option would then actually appear.

---

## 4. Bonus finding — organization deletion is broken for any org with purchase history (data-integrity gap, not fixed)

While building this track's isolated-organization test cleanup (same
`createOrganizationWithOwner` + `prisma.organization.delete()` pattern used by
`scripts/verify-purchases.ts`), a plain `prisma.organization.delete({ where: { id: orgId } })`
**failed** for any org that had ever posted a purchase invoice or goods receipt:
```
update or delete on table "accounts" violates RESTRICT setting of foreign key
constraint "purchase_invoice_lines_accountId_fkey" on table "purchase_invoice_lines"
```
and, separately:
```
update or delete on table "inventory_items" violates RESTRICT setting of foreign key
constraint "goods_receipt_lines_itemId_fkey" on table "goods_receipt_lines"
```
**Root cause:** in `prisma/schema.prisma`, `PurchaseInvoiceLine.account` and
`GoodsReceiptLine.item` are declared with **no `onDelete: Cascade`** (unlike almost
every other `*Line -> resource` relation in the schema), so `Organization -> Account` /
`Organization -> InventoryItem`'s cascade races against
`PurchaseInvoice/GoodsReceipt -> *Line`'s own cascade, and Postgres refuses the whole
transaction. This is **not** hypothetical or test-only — any real "delete organization"
admin/support action, or a future self-serve account-deletion feature, would hit the
exact same hard failure for any org that has ever recorded a single purchase invoice or
goods receipt (i.e., realistically, most real orgs). I worked around it in this suite's
own cleanup by deleting `purchaseInvoiceLine`/`goodsReceiptLine` rows first (and used
the same workaround to clean up a handful of orphaned test orgs left behind from
earlier debugging runs before I'd found the workaround — confirmed zero `"QA Swarm 08"`
organizations remain in the shared dev DB after this session). **Not fixed** — this
touches `prisma/schema.prisma`, which is out of scope for this track's edits — but
flagged here since it's a real, launch-relevant bug discovered as a side effect of
following the required E2E testing pattern.

---

## 5. Regression tests added

| File | Scope | Result |
|---|---|---|
| `ledger/lib/bantoo/qa-swarm-08-purchase-workflow.test.ts` | **Part A** (no DB): rule-based (`ruleBasedExtract`/`parseBantooCommandText`) classification for all 7 required commands + French equivalents + edge cases, pinning every bug above as a characterization/regression guard. **Part B** (real DB, single throwaway org `QA Swarm 08 Purchase <timestamp>`, cascade-cleaned in `afterAll` with the FK workaround from §4): full `resolveExtraction` → `executeBantooAction` → Postgres chain for `receive_stock` (incl. weighted-average restock, unknown-supplier auto-offer, missing-supplier clean failure), `add_inventory_item` (catalog-only and dual-effect-with-opening-stock), `supplier_purchase` (incl. COGS miscategorization assertion), and the `expense`/supplier-payment blocker (both the plain-expense case and the full bill-then-attempt-to-pay scenario, with ledger-level journal-line verification). | **24/24 pass** (all intentionally pin *actual*, including buggy, behavior — no source file was modified to make these pass) |

Full suite after adding this file (`npx vitest run` in `ledger/`): **67 test files, 792
passed, 12 failed.** All 12 failures are in **other tracks'**
`qa-swarm-0{1,5,10}-*.test.ts` files (pre-existing before this session's changes to this
file, characterization tests documenting those tracks' own bugs) — **none in this
track's file**, and I did not modify any of them.

---

## 6. Top-line summary: launch readiness

| Workflow | Launch-ready? | Notes |
|---|---|---|
| `receive_stock` (goods receipt) — **the underlying feature** | **Ready** | Full chain verified: inventory quantities, weighted-average cost, payable balance, purchase history all correct. New-supplier and missing-supplier edge cases both behave safely. |
| `receive_stock` — **text/voice command recognition** | **NOT ready** | Any currency word in the sentence (a near-certainty for a real purchase message) misclassifies the whole command as a customer payment. Word-form quantities ("a dozen") also fail. Both are required-test-command failures, both silent (no error shown, wrong action type entirely). |
| `add_inventory_item` — **the underlying feature** | **Ready** | Both catalog-only and dual-effect (opening stock + new supplier) paths verified correct. |
| `add_inventory_item` — **text/voice command recognition** | **NOT ready at all** | Zero rule-based coverage; every phrasing is `unknown` without a working AI extractor. |
| `supplier_purchase` | **Ready with a real accounting-quality caveat** | Transaction posts correctly and updates AP, but silently books to "Cost of Goods Sold" for ANY purchase type (same root cause as the `expense` blocker) — a real, if less severe, mislabeling bug worth fixing before launch marketing calls this feature accurate. |
| Supplier payment (`expense` with a supplier attached) | **HARD BLOCKER — completely non-functional** | Cannot be saved at all on a fresh org: `noExpenseAccount` fires unconditionally (§3). This is worse than the originally-suspected "doesn't clear AP" gap — it's a total feature outage for the #1 requested scenario in this brief. |
| Any generic `expense` (rent, salaries, fuel, etc., no supplier) | **HARD BLOCKER — same root cause, same total outage** | Confirms this is not supplier-payment-specific: it is the single most severe, highest-blast-radius bug found in this entire track. |
| Unknown/nonexistent supplier handling (`receive_stock`) | **Ready** | Verified safe: offers to create the new supplier inline, never silently orphans a transaction, fails clearly with no supplier name at all. |
| Amount/quantity parsing robustness | **Mixed** | Digit quantities + comma/space currency formats work; currency words falsely gate goods-receipt detection; word-form quantities ("dozen") aren't recognized; unit cost is never parsed for goods receipts even when everything else succeeds. |

**If I had to name ONE launch blocker from this track:** the `expense` action's
`noExpenseAccount` failure (§3) — it is not a corner case, not French-specific, not
AI-vs-rule-parser-specific, and not limited to supplier payments. It makes the single
most everyday Ask Bantoo purchase-side action ("I paid for X") **completely unusable on
every new organization**, with a hard, immediate failure message rather than a silent
wrong-account posting. This should block launch until `lib/accounts.ts`'s
`paymentCounterpartAccounts`/`receiptCounterpartAccounts` NULL-`subtype` exclusion bug
is fixed (or every default chart-of-accounts row is given a non-null `subtype`) —
either fix, applied once, resolves both this blocker and the `supplier_purchase`
COGS-miscategorization bug simultaneously.
