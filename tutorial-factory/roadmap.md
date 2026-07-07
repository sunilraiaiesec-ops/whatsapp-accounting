# Tutorial Factory — Roadmap Toward 150+ Tutorials

> **This file is hand-written and hand-maintained — it is intentionally NOT
> machine-generated.** Deciding "what tutorial should we build next" is a
> product/production decision that depends on customer demand, feature
> launch order, and business priority — things no script in this repo can
> know. Edit this file directly as priorities change; there is no
> `build-roadmap.js` and there shouldn't be one.
>
> Every idea below is grounded in a real, already-shipped feature in this
> codebase (verified against `ledger/app/(app)/*` pages and
> `ledger/app/actions/*.ts` server actions as of this session) — nothing
> here is a hypothetical/future feature. `tutorials/schema.json`'s
> `feature_area` enum currently has 12 values (Customers, Suppliers, Sales
> & Invoicing, Payments, Receipts, Inventory, Reports, Ask Bantoo,
> Settings, Migration, Approvals, Billing); a few sections below propose
> tutorials for real features that don't cleanly fit any existing enum
> value (Purchasing, Banking & Reconciliation, Fixed Assets) — adding a
> tutorial there would first need a one-line addition to that enum in
> `tutorials/schema.json`, called out explicitly where relevant.

## How to use this file

1. Pick the next tutorial(s) to produce from the tables below (or add a new
   one grounded in a real feature not yet listed).
2. Copy `tutorials/TEMPLATE.md` to `tutorials/NNN-<slug>.md` (next sequence
   number after `005-add-inventory-item.md`), fill in its frontmatter by
   walking the real feature in the app, and validate it against
   `tutorials/schema.json`.
3. Write and live-test a Playwright spec at
   `automation/tutorials/<slug>.spec.ts` (see the 5 existing specs for the
   pattern).
4. Run `npm run generate:tutorials && npm run verify:tutorials`.
5. Run `npm run build:tutorial-index && npm run build:dashboard` (or
   `npm run build:tutorial-factory` to also create that tutorial's
   checklist) to refresh the Tutorial Factory's tracking.
6. Move on to real-world production (recording, editing, publishing) using
   the new checklist in `tutorial-factory/checklists/`.

Status markers below: 🟢 ready to produce now (feature fully shipped) ·
🟡 feature exists but is partial/admin-only/still evolving — verify scope
before committing to a tutorial · — no marker means not yet assessed.

## Customers / Suppliers (existing feature area — deepen coverage)

| # | Tutorial idea | Grounded in |
|---|---|---|
| 006 | 🟢 Edit a Customer's Details | `ledger/components/PartyProfileForm.tsx`, `app/actions/parties.ts` |
| 007 | 🟢 View a Customer's Statement / Balance | `app/(app)/reports/customer-statement`, `customer-balances` |
| 008 | 🟢 Add Notes to a Customer or Supplier | `ledger/components/PartyNotesForm.tsx` |
| 009 | 🟡 Merge or Resolve a Duplicate Contact | `PartyEnrichmentSuggestions.tsx` — verify this covers manual merge, not just suggestions |

## Sales & Invoicing (existing feature area — the natural next block after Customers)

| # | Tutorial idea | Grounded in |
|---|---|---|
| 010 | 🟢 Create a Sales Order (before invoicing) | `app/(app)/sales-orders` |
| 011 | 🟢 Create a Delivery Note | `app/(app)/delivery-notes` |
| 012 | 🟢 Issue a Credit Note (customer return/refund) | `app/(app)/credit-notes`, `CreditNoteForm.tsx` |
| 013 | 🟢 Record a Cash Sale (no invoice, paid on the spot) | `app/(app)/sales-receipts`, `CashSaleForm.tsx` |
| 014 | 🟢 Void or Cancel a Sales Invoice | `app/actions/documents.ts` |

## Purchasing (real feature, not yet its own `feature_area` enum value — propose adding "Purchasing")

| # | Tutorial idea | Grounded in |
|---|---|---|
| 015 | 🟢 Create a Purchase Invoice (money you owe a supplier) | `app/(app)/purchase-invoices` |
| 016 | 🟢 Record a Goods Receipt | `app/(app)/goods-receipts`, `GoodsReceiptForm.tsx` |
| 017 | 🟢 Issue/Receive a Debit Note (purchase-side adjustment) | `app/(app)/debit-notes`, `DebitNoteForm.tsx` |
| 018 | 🟢 Record a Supplier Payment | `app/actions/parties.ts` (Suppliers → Payments) |

## Payments / Receipts (existing feature areas — deepen coverage)

| # | Tutorial idea | Grounded in |
|---|---|---|
| 019 | 🟢 Record a Supplier Payment (money out) | `app/(app)/payments` |
| 020 | 🟢 Issue a Refund Receipt | `app/(app)/refund-receipts` |
| 021 | 🟢 Void or Correct a Receipt/Payment | `app/actions/documents.ts` |

## Inventory (existing feature area — deepen coverage)

| # | Tutorial idea | Grounded in |
|---|---|---|
| 022 | 🟢 Adjust Inventory (correct a stock count mistake) | `app/(app)/inventory-adjustments`, `InventoryAdjustmentForm.tsx` |
| 023 | 🟢 Transfer Stock Between Locations | `app/(app)/inventory-transfers` |
| 024 | 🟢 Write Off Inventory (damage/loss/expiry) | `app/(app)/inventory-write-offs` |
| 025 | 🟢 Respond to a Low-Stock Reorder Suggestion | `ledger/components/LowStockReorder.tsx`, `app/actions/reorder.ts`, `lib/reorder.ts` |
| 026 | 🟢 Set a Preferred Supplier for an Item | `prisma/migrations/20260705000000_add_item_preferred_supplier` |

## Banking & Reconciliation (real feature, not yet its own `feature_area` enum value — propose adding "Banking")

| # | Tutorial idea | Grounded in |
|---|---|---|
| 027 | 🟢 Add a Bank or Cash Account | `app/(app)/bank-and-cash-accounts`, `BankAccountForm.tsx` |
| 028 | 🟢 Transfer Money Between Accounts | `app/(app)/inter-account-transfers` |
| 029 | 🟢 Reconcile a Bank Account | `app/(app)/bank-reconciliations` |

## Reports (existing feature area — one tutorial per report is a lot of easy, high-value volume)

| # | Tutorial idea | Grounded in |
|---|---|---|
| 030 | 🟢 Read Your Profit & Loss Report | `app/(app)/reports/profit-loss` |
| 031 | 🟢 Read Your Balance Sheet | `app/(app)/reports/balance-sheet` |
| 032 | 🟢 Check Who Owes You Money (AR Aging) | `app/(app)/reports/ar-aging` |
| 033 | 🟢 Check Who You Owe (AP Aging) | `app/(app)/reports/ap-aging` |
| 034 | 🟢 Review the General Ledger | `app/(app)/reports/general-ledger` |
| 035 | 🟢 Check Your Cash Summary | `app/(app)/reports/cash-summary` |
| 036 | 🟢 Value Your Inventory | `app/(app)/reports/inventory-valuation` |
| 037 | 🟢 Review the Trial Balance | `app/(app)/reports/trial-balance` |

## Migration (existing feature area — onboarding an existing business)

| # | Tutorial idea | Grounded in |
|---|---|---|
| 038 | 🟢 Import Your Existing Data with the Migration Wizard | `components/migration/MigrationWizardApp.tsx`, `lib/migration/wizard.ts` |
| 039 | 🟢 Set Opening Balances During Migration | `components/migration/StepOpeningBalances.tsx` |
| 040 | 🟢 Ask Bantoo (AI) for Help During Migration | `components/migration/AskBantooDrawer.tsx`, `lib/ai/wizard-assistant.ts` — also satisfies the "Ask Bantoo" feature area |

## Approvals (existing feature area)

| # | Tutorial idea | Grounded in |
|---|---|---|
| 041 | 🟢 Turn On Approval Workflows | `lib/approvals/config.ts`, `components/approvals/ApprovalWorkflowToggle.tsx` |
| 042 | 🟢 Approve or Reject a Pending Submission | `components/approvals/PendingApprovalsWidget.tsx`, `app/actions/approvals.ts` |
| 043 | 🟢 Track Your Own Submitted-for-Approval Documents | `components/approvals/MySubmissionNotices.tsx` |

## Billing (existing feature area — BantooBooks' own subscription, not the customer's business)

| # | Tutorial idea | Grounded in |
|---|---|---|
| 044 | 🟢 Choose a BantooBooks Plan | `lib/billing/plans.ts` |
| 045 | 🟢 Understand Your Trial Status | `components/TrialBanner.tsx`, `lib/billing/subscription.ts` |
| 046 | 🟡 Manage a Partner/Reseller Account | `app/(app)/admin/partners`, `app/actions/partners.ts` — admin-only, verify audience before producing |

## Settings (existing feature area)

| # | Tutorial idea | Grounded in |
|---|---|---|
| 047 | 🟢 Set Up Your Organization Profile | `app/(app)/settings` |
| 048 | 🟢 Switch Language (English/French) | `components/LanguageSwitcher.tsx` |
| 049 | 🟢 Understand Your Role & What You Can Do | `lib/permissions.ts` (`ROLE_LABELS`), `app/(app)/settings/page.tsx` (shows the signed-in user's role) |

## Fixed Assets & Special Accounts (real feature, not yet its own `feature_area` enum value — propose adding "Fixed Assets")

| # | Tutorial idea | Grounded in |
|---|---|---|
| 050 | 🟢 Add a Fixed Asset | `app/(app)/fixed-assets` |
| 051 | 🟢 Record a Manual Journal Entry | `app/(app)/journal`, `JournalEntryForm.tsx` |

## Beyond #051

The 45 tutorial ideas above (#006-#051, on top of today's 5) already cover
every major shipped feature area in `ledger/app/`. Reaching 150+ from here
is realistically a mix of:

- **Depth, not just breadth** — for high-traffic workflows (Sales &
  Invoicing, Customers, Inventory), add tutorials for edge cases and
  "what if" scenarios (e.g. "What if a customer's invoice is disputed?",
  "What if you need to reverse a whole month's entries?") rather than only
  one tutorial per screen.
- **Persona-specific variants** — the same underlying feature explained
  differently for a cashier vs. an accountant vs. a business owner
  (`test_data`/`audience` already supports this per-tutorial).
- **Localized variants** — French-language versions of the highest-traffic
  tutorials, once the English catalog is well underway.

None of this should be mechanically generated — keep using this file (or
its successor) as a living, hand-edited backlog, refreshed whenever a new
BantooBooks feature ships or production priorities shift.
