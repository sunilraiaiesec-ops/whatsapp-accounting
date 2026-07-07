# Ask Bantoo Reliability Swarm — Track 7: Sales Workflow Agent

QA pass over Ask Bantoo's sales-side transaction handling: sales invoices, cash sales
(`sales_receipt`), customer payments, credit notes, and refund receipts. Scope per the
swarm brief: test-only, no fixes to `lib/`, `app/`, `components/`, `messages/`, or
`prisma/schema.prisma`. No commits/pushes made.

Environment verified at HEAD `de87013` ("Fix Ask Bantoo create_customer field
persistence and duplicate-save behavior"), one commit ahead of `012175a` as expected.
No `OPENAI_API_KEY` is set in `ledger/.env`, so **every plain-text Ask Bantoo command in
this environment goes through the rule-based fallback parser
(`lib/command-parse.ts` / `lib/bantoo/fallback.ts`), never the AI extractor.** All
findings below reflect that real, current configuration — not a hypothetical
AI-enabled deployment.

---

## 0. Important correction to `launch-qa/known-issues.md`

That doc's "Unsupported transaction types" table says *"Create sales invoice (on
credit) — Not in `BANTOO_ACTION_TYPES`... Ask Bantoo supports cash `sales_receipt`
only"*. **This is stale.** As of this HEAD, `lib/ai/actions.ts` (BANTOO_ACTION_TYPES)
already includes a full **Sales Intelligence Sprint**: `sales_invoice`, `credit_note`,
`refund_receipt`, `view_sales_invoice`, and `unsupported_sales_action` — each with a
complete schema → `resolve.ts` proposal-building case → `executeBantooAction` write
path → real Prisma document creation (`createSalesInvoice`/`createCreditNote`/
`createRefundReceipt` in `lib/documents.ts`), plus rule-parser coverage in
`lib/command-parse.ts`'s `detectSalesAction`/`SALES_INVOICE`/`SALES_CREDIT_NOTE`/
`SALES_REFUND` patterns (EN+FR), and pre-existing unit test coverage in
`lib/bantoo/fallback-sales.test.ts`, `lib/bantoo/resolve-sales.test.ts`, and
`app/actions/bantoo.test.ts`'s "Sales Intelligence Sprint" block. I did **not** build
any of this — it was already there before this QA pass; I'm flagging it so the launch
doc isn't read as authoritative on this point. This is presumably the same sprint the
other swarm tracks' context refers to as still-hypothetical — it has since shipped.

---

## 1. What's actually implemented today

| Ask Bantoo action | Schema | Rule-parser (EN) | Rule-parser (FR) | `resolve.ts` | `execute()` | Real document created |
|---|---|---|---|---|---|---|
| `sales_receipt` (cash sale) | ✅ | ✅ (`RECEIPT_PATTERNS`/`CASH_SALE_PATTERNS`) | ✅ (`vente comptant`) | ✅ | ✅ | `SalesReceipt` (`createSalesReceipt`) |
| `customer_payment` | ✅ | ✅ (`RECEIPT_PATTERNS`) | ✅ (`reçu`) | ✅ | ✅ | `Receipt` (`createReceipt`) |
| `sales_invoice` (credit sale) | ✅ | ✅ (`SALES_INVOICE`) | ✅ (`facturer`/`émettre une facture`) | ✅ | ✅ | `SalesInvoice` (`createSalesInvoice`) |
| `credit_note` | ✅ | ✅ (`SALES_CREDIT_NOTE`) | ✅ (`note de crédit`) | ✅ | ✅ | `CreditNote` (`createCreditNote`) |
| `refund_receipt` | ✅ | ✅ (`SALES_REFUND`) | ✅ (`rembourser`) | ✅ | ✅ | `RefundReceipt` (`createRefundReceipt`) |
| `view_sales_invoice` (list only) | ✅ | ✅ | ✅ | ✅ | ✅ (nav-only) | n/a |
| `unsupported_sales_action` (edit/void/email/apply-payment to an existing invoice) | ✅ | ✅ | ✅ | ✅ → `notYetAvailable` warning | ✅ → `"This action is not available yet."` | n/a (correctly never writes) |

**Bottom line: nothing in this track is "unsupported" the way the task brief
anticipated.** All 5 sales document types the brief asked about are live, wired
end-to-end, and mostly work. The bugs found below are in the **rule-based intent
classifier's phrasing coverage**, not missing features.

---

## 2. Required test commands — results

### 1. "Received 25,000 XAF cash from Musa for rice sale."
- **Expected:** `sales_receipt` (cash sale of rice to Musa).
- **Actual:** classified as **`customer_payment`**, not `sales_receipt`.
- **Pass/Fail: FAIL** (misclassification).
- **Root cause:** `lib/command-parse.ts`, `parseCommandTextFull`'s `create_receipt`
  branch (~line 1665‑1682) only forces `receiptCategory = "sales"` when the sentence
  contains an explicit `CASH_SALE_PATTERNS` trigger ("cash sale"/"vente comptant").
  Plain "received cash from NAME for X" resolves a party name via `FROM_PATTERN`
  first, which unconditionally sets `receiptCategory = "customer"` — i.e. "money
  received from a named person" defaults to "customer paying down their balance"
  rather than "cash sale to that person," even when the sentence explicitly says
  "...for rice **sale**."
- **Accounting impact if a user actually sends this and confirms without noticing the
  mislabeled action:** `customer_payment`'s `execute()` posts `Dr Bank / Cr Accounts
  Receivable` (see `lib/documents.ts` `createReceipt`, `resolve.ts`'s `customer_payment`
  case defaulting `lineAccountId` to the receivable account) — i.e. it would reduce
  Musa's AR balance instead of recognizing sales revenue via `sales_receipt`'s `Dr
  Bank / Cr Income` posting. If Musa has no outstanding invoice, this either creates a
  negative/credit AR balance for Musa or (if he does have a balance) silently
  "pays off" real credit sales using cash that was actually a *separate* immediate
  cash sale — a real bookkeeping error, not just a UX annoyance. **This is the single
  highest-impact finding in this track** because it's a SUPPORTED path executing
  successfully with the wrong accounting effect, with no error and no warning shown
  to the user (both actions have identical required fields, so no validation catches
  it).
- Confirmed that `sales_receipt` itself works correctly once the trigger phrase is
  present (`"Cash sale of 25,000 XAF from Musa for rice."` → `sales_receipt`,
  correct amount) — the bug is purely in intent detection for this very natural
  phrasing variant, not in the sales_receipt feature itself.
- **Secondary bug found on the same input:** `extractCashSaleCustomerName` (used only
  once the "cash sale" trigger phrase IS present) does not stop at a trailing "for"
  clause the way the generic `FROM_PATTERN` does — `"Cash sale of 25,000 XAF from
  Musa for rice."` extracts `customer_name = "Musa for rice"`, not `"Musa"`. This
  would show a garbled customer name in the Ask Bantoo confirmation screen and likely
  fail to fuzzy-match the real "Musa" contact.
- Regression tests: `lib/bantoo/qa-swarm-07-sales-workflow.test.ts`, describe block
  "required test command 1" (3 tests) — **all pass** (they pin the current, buggy
  behavior as a characterization/regression guard, clearly marked `[BUG]`).

### 2. "Record a payment of 50,000 XAF from Golu Transport Ltd."
- **Expected:** `customer_payment`.
- **Actual: `unknown`.** The confirmation screen shows "I couldn't tell what to do" —
  user must rephrase; nothing is created (safe failure, but a real coverage gap for
  extremely natural business phrasing).
- **Pass/Fail: FAIL** (unrecognized).
- **Root cause:** `detectIntent()` in `lib/command-parse.ts` (~line 1196‑1211) requires
  either a `PAYMENT_PATTERNS` verb match ("paid"/"pay"/"payé" — none present; "pay" as
  a substring of "payment" does not match `\bpay\b` because there's no word boundary
  before "ment") or a `RECEIPT_PATTERNS` match, which needs "receiv-"/"receipt" as a
  literal token — "payment" as a bare noun matches neither list. This is the direct
  customer-payment-side sibling of already-documented **BUG-001** in
  `launch-qa/bugs.md` ("Record receipt ..." misses because `RECEIPT_PATTERNS`
  requires the noun "receipt" specifically) — same root defect (verb/noun-form
  coverage gaps in the two pattern lists), different noun ("payment" vs "receipt").
  Worth folding into the same fix when BUG-001 is addressed.
- Confirmed `customer_payment` works correctly once phrased with a recognized verb:
  `"Received 50,000 XAF from Golu Transport Ltd."` → `customer_payment`, correct
  name/amount.
- Regression tests: same file, "required test command 2" block (2 tests) — **pass**.

### 3. "Create a sales invoice for Musa: 25 bags of rice at 12,000 XAF each."
- **Expected:** `sales_invoice` is documented as single-line/lump-sum only (see the
  Sales Intelligence Sprint doc comment in `lib/ai/actions.ts`) — **not** itemized
  multi-line invoicing. That's an accepted MVP scope limitation, not itself a bug.
- **Actual:** classifies as `sales_invoice` (correct action), but:
  - `customer_name` comes out as **`"Musa: bags"`** — garbled (retains the colon,
    drops "25", drops "rice", keeps a stray "bags").
  - `amount` comes out **`null`** even though `12,000` is present in the sentence.
- **Pass/Fail: FAIL** (unusable proposal — wrong customer name shown, no amount to
  confirm).
- **Root cause (name):** `splitSalesTail()` in `lib/command-parse.ts` splits the tail
  on the first bare `for|pour|de|of` it finds — "25 bags **of** rice" trips that split
  before reaching the real "each"/end-of-clause boundary, so the name capture stops
  mid-phrase.
- **Root cause (amount):** `extractAmount()` only inspects the **first** numeric match
  in the raw text (`text.match(pattern)`, no global rescan across candidate numbers).
  `isQuantityNumber()` correctly identifies "25" (followed by "bags") as a quantity,
  not a price, and skips it — but the function then gives up entirely instead of
  continuing to scan for the *next* number ("12,000"), which is the actual amount.
  This means **any single-line sales_invoice/credit_note/refund_receipt/sales_receipt
  command that mentions a quantity before the amount will silently lose the amount**
  — not sales_invoice-specific, this is a shared helper.
- **Workaround confirmed:** rephrasing as a lump sum — `"Create a sales invoice for
  Musa for 300,000 XAF for rice."` — parses cleanly (`customer_name: "Musa"`,
  `amount: 300000`). A real user is just as likely to type the itemized version
  though, since that's how a shopkeeper naturally describes a sale.
- Regression tests: "required test command 3" block (2 tests) — **pass** (pin current
  buggy + working-workaround behavior).

### 4. "Issue a credit note to Musa for 5,000 XAF for damaged goods."
- **Expected/Actual:** `credit_note`, `customer_name: "Musa"`, `amount: 5000`,
  `description: "For Damaged Goods"`.
- **Pass/Fail: PASS.** Correctly classified and cleanly extracted.
- Regression test: "required test command 4" — **pass**.

### 5. "Refund Musa 10,000 XAF."
- **Expected/Actual:** `refund_receipt`, `customer_name: "Musa"`, `amount: 10000`.
- **Pass/Fail: PASS.**
- Regression test: "required test command 5" — **pass**.

### 6. French equivalents
- **"Reçu 25 000 XAF en espèces de Musa pour vente de riz."** (FR equivalent of #1) →
  **FAIL**, same misclassification as English #1: `customer_payment` instead of
  `sales_receipt` (same root cause — no `CASH_SALE_PATTERNS` French trigger present,
  only "vente comptant"/"ventes cash" are recognized, not "vente de riz").
- **"Reçu 50 000 XAF de Golu Transport Ltd."** (simple FR customer-payment phrasing,
  "reçu" = received) → **PASS**, correctly `customer_payment`.
- **"Enregistrer un paiement de 50 000 XAF de Golu Transport Ltd."** (FR equivalent of
  #2, noun form "paiement") → **FAIL**, `unknown` — same root cause as English #2
  (noun-form "paiement" isn't in either pattern list, mirroring `RECEIPT_PATTERNS`'s
  English "receipt"-noun gap).
- Regression tests: "required test command 6" block (3 tests) — **pass**.

### 7. Ambiguous/unknown customer: "Received 15,000 XAF cash from Someone Who Doesnt Exist."
- **Behavior confirmed: safe.** The rule parser classifies this fine at the text
  level (again as `customer_payment` due to bug #1 above, but that's a separate
  issue from name resolution). At `resolve.ts`, `resolveParty()` finds zero
  candidates for an unrecognized name, so `proposal.partyId = null` and
  `proposal.createParty = true` — this only **offers** "create new customer" as an
  explicit checkbox/option in the confirmation UI; it does **not** silently create a
  phantom party. At `executeBantooAction()`, a new party is only actually created
  when the client submits `createParty: true` (i.e. the user explicitly confirmed
  creating a new contact) — verified via mocked execute-chain tests: `createParty:
  false` + no `partyId` → clean `"Choose the customer who paid."` failure, no DB
  write, no `createParty` spy call; `createParty: true` → creates *exactly* the
  named party (`"Someone Who Doesnt Exist"`), not a fuzzy-matched unrelated one
  (confirmed against the same duplicate-prevention safety net exercised elsewhere
  in `app/actions/bantoo.test.ts`).
- **Pass/Fail: PASS** for the "no phantom customer without confirmation" requirement.
  This matches the documented, intentional design in `known-issues.md`
  ("contacts created via `createParty` during a transaction").
- Regression tests: `app/actions/qa-swarm-07-sales-workflow-execute.test.ts`,
  "unknown/unresolved customer name" block (2 tests) — **pass**.

---

## 3. Amount format parsing

| Format | Rule-parser (`extractAmount`) | `parseAmount()` (money.ts) |
|---|---|---|
| `"25,000 XAF"` (comma-grouped) | ✅ → `25000` | ✅ → `25000n` |
| `"25 000 XAF"` (space-grouped) | ✅ → `25000` | ✅ → `25000n` |
| `"twenty five thousand XAF"` (spelled out) | ❌ → `null` | n/a (never reaches parseAmount) |

The word-form gap is a **real launch-time limitation in this specific deployment**
(not hypothetical): since no `OPENAI_API_KEY` is configured, there is no AI fallback
that could otherwise interpret spelled-out numbers — every text command here goes
through the regex-based `extractAmount()`, which only matches digit sequences. If AI
gets configured for launch, this becomes moot for text (the model would very likely
handle "twenty five thousand" natively); if AI stays unconfigured, users must type
digits. Worth a one-line note in user-facing help copy either way.

Regression tests: `lib/bantoo/qa-swarm-07-sales-workflow.test.ts`, "amount format
parsing" block (4 tests) — **pass**.

---

## 4. Full-chain / ledger-effect verification for supported paths

I could not safely run true end-to-end integration tests against a live database:
this repo's Postgres (`ledger/.env`'s `DATABASE_URL`) is a single **shared Neon
instance**, and per the swarm brief 10 agents are running concurrently across this
same repo — writing/deleting live org/party/document rows from an ad hoc script
risks colliding with another track's in-flight data. There is also **no existing
precedent** for DB-backed integration tests in this codebase: every one of the 700+
existing tests (`341` at last count per `known-issues.md`, now more) mocks
`@/lib/prisma` and `@/lib/documents` rather than hitting a real database. I followed
that same established convention rather than introducing a new, riskier pattern
mid-swarm.

Instead, "full chain including actual ledger effect" was verified two ways:

**(a) Mocked execute-level tests** (new coverage — see gap noted below) asserting the
exact arguments passed to the real `lib/documents.ts` write functions: correct
`partyId`, `amount` (as `bigint` minor units), `bankAccountId`/`lineAccountId`, and
resulting `href`/document number, for both `customer_payment` (`createReceipt`) and
`sales_receipt` (`createSalesReceipt`) — see
`app/actions/qa-swarm-07-sales-workflow-execute.test.ts`. `sales_invoice`/
`credit_note`/`refund_receipt` already had equivalent coverage in the pre-existing
`app/actions/bantoo.test.ts` "Sales Intelligence Sprint" block, which I did not
duplicate.

**Gap found and closed:** the existing `app/actions/bantoo.test.ts` mocks
`@/lib/documents` but only re-exports `createPayment`/`createSalesInvoice`/
`createCreditNote`/`createRefundReceipt` as spies — **`createReceipt` (customer_payment)
and `createSalesReceipt` (sales_receipt) were never mocked there**, meaning there was
**zero existing execute-level test coverage** for either of the task's two primary
required commands (1 and 2) before this pass. Closed via the new file above.

**(b) Code-level verification that a created document is actually queryable/visible**
per party, by tracing `lib/party-ledger.ts`, `lib/party-documents.ts`, and
`lib/party-insights.ts` against exactly what `lib/documents.ts` writes:

| Document | Shows in customer's AR "Transactions" tab / statement? | Shows on customer profile at all? | Shows org-wide with customer name? |
|---|---|---|---|
| `customer_payment` → `Receipt` | **Yes** — `createReceipt` tags the `JournalLine` on the receivable control account with `partyId` (`lib/documents.ts` `createReceipt`, ~line 139); `getPartyLedger`/`getPartyBalance` (`lib/party-ledger.ts`) query exactly that `journalLine` + `accountId` (receivable) + `partyId` combination. **Verified correct and consistent.** | Yes (Transactions + Payments tabs) | Yes (`/receipts`) |
| `sales_invoice` → `SalesInvoice` | Yes (AR-affecting by design) | Yes (Invoices tab) | Yes (`/sales-invoices`) |
| `credit_note` → `CreditNote` | Yes (AR-affecting by design) | Yes (via ledger + Documents tab) | Yes (`/credit-notes`) |
| `sales_receipt` → `SalesReceipt` | **No** — by design: a cash sale posts `Dr Bank / Cr Income`, never touching the receivable account, so it correctly never appears in the AR ledger or customer statement (`lib/documents.ts` `createSalesReceipt` comment, ~line 592). | **Partial** — appears on the customer's **Documents** tab (`lib/party-documents.ts`'s `listPartyOtherDocuments`, which explicitly queries `salesReceipt`) and rolls into **Overview** stats + **Products/AI Memory** line history (`lib/party-insights.ts`) — but is absent from Transactions/Invoices/Payments tabs (correctly, per its AR-free posting). | Yes (`/sales-receipts`, with customer name column + search) |
| `refund_receipt` → `RefundReceipt` | No (AR-free by design, same reasoning as sales_receipt) | **No — not surfaced anywhere on the customer profile.** Not queried by `party-ledger.ts`, `party-documents.ts`, or `party-insights.ts` at all. | Yes (`/refund-receipts`, with customer name column + search) |

**Finding:** `RefundReceipt` is completely invisible when viewing a specific
customer's profile (no tab shows it), even though `SalesReceipt` gets partial
visibility via the Documents tab. A user who issues "Refund Musa 10,000 XAF" and then
opens Musa's customer profile to check will see **no trace of that refund anywhere on
the page** — they'd have to know to go to the separate, org-wide `/refund-receipts`
list and search for "Musa" instead. This is plausibly intentional scope (refunds are
rarer / the Documents tab's comment only names "sales receipts / credit notes"), but
it's inconsistent with sales_receipt's partial treatment and worth a product decision
before launch, not a code fix from this track.

---

## 5. Regression tests added

| File | Scope | Result |
|---|---|---|
| `ledger/lib/bantoo/qa-swarm-07-sales-workflow.test.ts` | Rule-parser (`ruleBasedExtract`) classification for all 7 required commands (as typed, plus corrected/working phrasing variants for comparison), amount-format parsing (comma/space/word-form + `parseAmount()`), and non-confusion checks | **20/20 pass** |
| `ledger/app/actions/qa-swarm-07-sales-workflow-execute.test.ts` | Full `executeBantooAction` chain (mocked prisma/documents, same convention as existing `bantoo.test.ts`) for `customer_payment` and `sales_receipt` — closes a real pre-existing coverage gap (see §4) — plus the "no phantom customer without confirmation" checks for required command 7 | **8/8 pass** |

Full suite after adding these (`npx vitest run` in `ledger/`): **63 test files, 769
passed, 24 skipped, 11 failed** — all 11 failures are in **other tracks'**
`qa-swarm-0{1,5,8,10}-*.test.ts` files (pre-existing before this session, intentionally
failing characterization tests documenting their own bugs), **none in this track's
two new files**, and I did not modify any of them.

Tests marked `[BUG]`/`[GAP]` in my files intentionally **assert the current (buggy)
behavior** as a regression/characterization guard — per this track's isolation rules
I did not modify `lib/command-parse.ts`, `lib/bantoo/fallback.ts`, `lib/bantoo/resolve.ts`,
or `lib/documents.ts` to fix any of them.

---

## 6. Top-line summary: launch readiness

| Workflow | Launch-ready? | Notes |
|---|---|---|
| `sales_invoice` (credit sale), simple lump-sum phrasing | **Ready** | Clean single-line invoicing works correctly EN+FR; itemized/quantity-first phrasing has the shared `extractAmount` bug (§2.3) — document as "phrase the total, not per-unit math" in user help copy, or prioritize a fix. |
| `credit_note` | **Ready** | Both required phrasings tested clean. |
| `refund_receipt` | **Ready for the transaction itself; NOT ready for after-the-fact visibility** | Posts correctly, but is invisible on the customer's own profile (§4) — needs a product decision, not necessarily a blocker. |
| `sales_receipt` (cash sale) | **NOT ready as currently phrased-detected** | The feature itself is solid (execute chain, ledger posting, partial profile visibility all verified correct) — but the #1 required test command from this brief, and its French equivalent, get silently misclassified as `customer_payment` instead, which is a real accounting-impact bug (§2.1), not just a UX gap. This is the single item I'd block launch marketing copy on ("Ask Bantoo can record a cash sale by texting...") until fixed, or until the classifier is tightened to require an explicit trigger phrase is dropped from onboarding examples. |
| `customer_payment` | **Mostly ready** | Execute chain fully verified correct and now has real test coverage (previously had none). The natural "Record a payment of X from Y" / "Enregistrer un paiement de X de Y" noun-form phrasings are unrecognized (§2.2) — same root defect class as already-documented BUG-001, low risk (fails safely to "unknown," never a false success) but worth fixing alongside BUG-001. |
| Ambiguous/unknown customer name handling | **Ready** | Verified safe: no phantom customer creation without explicit user confirmation, across both the rule-parser and execute layers. |
| Amount format parsing | **Ready for digit formats; document the word-form gap** | Comma- and space-grouped digits both work; spelled-out numbers don't (no AI configured in this env to compensate). |

**If I had to name ONE launch blocker from this track:** the `sales_receipt` vs
`customer_payment` misclassification (§2.1) for the exact "received cash from
NAMED-PERSON for X sale" phrasing pattern — it's the most natural way to describe a
cash sale in this product's own target phrasing, it's also required test command #1
in this brief, it fails silently with a real (wrong-account) accounting effect rather
than an error, and it affects both English and French.
