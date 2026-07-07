# Ask Bantoo — Launch QA Bugs

Bugs found during pre-launch QA (code analysis + unit test suite). Severity reflects user impact at launch.

---

## BUG-001 — Rule parser misses "Record receipt …" phrasing

| Field | Detail |
|-------|--------|
| **Severity** | **High** |
| **Related tests** | INT-003, CONF-008 |
| **Reproduction** | 1. Disable AI or exhaust text AI credits (forces rule-based path). 2. Open Ask Bantoo. 3. Enter: `Record receipt 50000 from Elhaji`. 4. Submit. |
| **Expected** | Classify as `customer_payment` with amount and customer name; no "Not sure" banner. |
| **Actual** | `parseCommandText` returns `unknown` because `RECEIPT_PATTERNS` match `receive/received/reçu` but not the noun "receipt". User sees action "Not sure" and cannot confirm. |
| **Suggested fix** | Extend `RECEIPT_PATTERNS` / `detectIntent` to include `\breceipt\b` when paired with amount or "from {party}". Add regression test in `lib/bantoo/fallback.test.ts`. |
| **Location** | `ledger/lib/command-parse.ts` (`RECEIPT_PATTERNS`, `detectIntent`) |

---

## BUG-002 — Server validation warnings not localized (French UI shows English)

| Field | Detail |
|-------|--------|
| **Severity** | **High** |
| **Related tests** | LANG-003, LANG-004, ENT-012 |
| **Reproduction** | 1. Set app locale to French. 2. Trigger any Ask Bantoo flow that produces resolve warnings (e.g. goods receipt without supplier). 3. Observe amber warning lines under the proposal. |
| **Expected** | All user-visible strings in French (matching `messages/fr.json`). |
| **Actual** | `resolveExtraction` pushes hardcoded English strings, e.g. "Choose the supplier this stock came from.", "Enter the quantity received." Pattern-learning `fieldReasons` from `command-patterns.ts` are also English. |
| **Suggested fix** | Return warning codes from resolve and map to `next-intl` keys on the client, or pass locale into resolve and use a server-side message catalog. |
| **Location** | `ledger/lib/bantoo/resolve.ts`, `ledger/lib/command-patterns.ts`, `ledger/components/BantooCommand.tsx` (warnings render raw strings) |

---

## BUG-003 — Duplicate "I'm not sure" message on low-confidence proposals

| Field | Detail |
|-------|--------|
| **Severity** | **Medium** |
| **Related tests** | LANG-002, CONF-004 |
| **Reproduction** | 1. Submit ambiguous input (or AI returns confidence below 0.5). 2. View confirmation screen. |
| **Expected** | Single localized low-confidence banner. |
| **Actual** | Client renders `t("notSure")` when `proposal.lowConfidence` **and** `resolve.ts` also `warnings.unshift("I'm not sure. Please confirm or edit these details.")` — duplicate in English UI; French UI shows French banner + English warning. |
| **Suggested fix** | Remove the English `warnings.unshift` in resolve (client already handles via `lowConfidence`), or stop rendering duplicate in UI. |
| **Location** | `ledger/lib/bantoo/resolve.ts:575-577`, `ledger/components/BantooCommand.tsx:859-867` |

---

## BUG-004 — "Goods receipt …" phrasing not recognized (rule path)

| Field | Detail |
|-------|--------|
| **Severity** | **Medium** |
| **Related tests** | INT-006 |
| **Reproduction** | 1. Rule-based path. 2. Enter: `Goods receipt 150 bags rice from Adamou`. |
| **Expected** | `receive_stock` (common accounting phrasing). |
| **Actual** | `unknown` — requires verb forms like "Received/reçu" or keyword "stock", not "goods receipt". |
| **Suggested fix** | Add `\bgoods\s+receipt\b` to `STOCK_RECEIPT_PATTERNS` or map to `create_goods_receipt` when quantity present. |
| **Location** | `ledger/lib/command-parse.ts` |

---

## BUG-005 — Standalone "Add customer / Add supplier" commands unsupported

| Field | Detail |
|-------|--------|
| **Severity** | **Medium** |
| **Related tests** | INT-001, INT-002 |
| **Reproduction** | Enter `Add customer John Doe` or `Add supplier Adamou Trading` in Ask Bantoo. |
| **Expected** | Either create contact flow or clear guidance to use Customers/Suppliers screens. |
| **Actual** | `unknown` action; user sees "Not sure" / "I couldn't tell what to do." Contacts can only be created incidentally when confirming a transaction with `createParty`. |
| **Suggested fix** | Add `create_customer` / `create_supplier` action types to AI schema + execute path, **or** detect phrases and show a deep-link message ("Open Customers to add…"). |
| **Location** | `ledger/lib/ai/actions.ts`, `ledger/lib/bantoo/fallback.ts`, `ledger/app/actions/bantoo.ts` |

---

## BUG-006 — Execute / API error messages ignore UI locale

| Field | Detail |
|-------|--------|
| **Severity** | **Medium** |
| **Related tests** | LANG-007, LANG-009, ERR-008 |
| **Reproduction** | 1. French UI. 2. Confirm an invalid proposal (e.g. missing amount on customer payment). |
| **Expected** | French error string. |
| **Actual** | `executeBantooAction` and `/api/bantoo/extract` return English-only messages displayed via `setError(result.error)` / `data.error`. |
| **Suggested fix** | Return error codes; map on client with `useTranslations`. For 400 responses on extract, prefer client-side validation messages. |
| **Location** | `ledger/app/actions/bantoo.ts`, `ledger/app/api/bantoo/extract/route.ts`, `ledger/app/api/bantoo/transcribe/route.ts` |

---

## BUG-007 — "Cash sale …" not recognized on rule-based path

| Field | Detail |
|-------|--------|
| **Severity** | **Medium** |
| **Related tests** | INT-010 |
| **Reproduction** | Rule path: `Cash sale 15000`. |
| **Expected** | `sales_receipt` with amount. |
| **Actual** | `unknown`. |
| **Suggested fix** | Add sales patterns (`cash sale`, `vente comptant`, etc.) to `command-parse.ts` mapping to `sales_receipt` in fallback. |
| **Location** | `ledger/lib/command-parse.ts`, `ledger/lib/bantoo/fallback.ts` |

---

## BUG-008 — AI path may mark clear commands low-confidence (model-dependent)

| Field | Detail |
|-------|--------|
| **Severity** | **Low** |
| **Related tests** | CONF-007 |
| **Reproduction** | With AI enabled, submit an unambiguous command; model returns valid action with confidence below 0.5. |
| **Expected** | Obvious structured commands should not show "Not sure." |
| **Actual** | System trusts model confidence verbatim; no floor for high-signal parses (amount + party + intent keywords). |
| **Suggested fix** | Post-process: if action is not unknown and required fields present, clamp confidence to at least 0.5; or hide "Not sure" when rule-parser would have scored 0.75. |
| **Location** | `ledger/lib/ai/extract.ts`, `ledger/lib/bantoo/resolve.ts` |

---

## BUG-009 — `create_payment` with supplier always maps to `expense`, never `supplier_purchase`

| Field | Detail |
|-------|--------|
| **Severity** | **Low** |
| **Related tests** | INT-004 |
| **Reproduction** | Rule path: `Paid 100000 to Adamou for invoice INV-12` (on-credit bill payment intent). |
| **Expected** | Possibly `supplier_purchase` or payment linked to AP — product decision. |
| **Actual** | Always `expense` (cash out) via fallback; no supplier invoice recording. |
| **Suggested fix** | Document as limitation or extend parser/AI for bill vs expense disambiguation. |
| **Location** | `ledger/lib/bantoo/fallback.ts` |

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 2 |
| Medium | 5 |
| Low | 2 |
| **Total** | **9** |

### Top 3 (Critical/High)

1. **BUG-001** — "Record receipt …" returns unknown + "Not sure" on rule path
2. **BUG-002** — Resolve warnings and pattern hints English-only on French UI
3. **BUG-003** — Duplicate low-confidence messaging (medium severity, but visible on every ambiguous parse)
