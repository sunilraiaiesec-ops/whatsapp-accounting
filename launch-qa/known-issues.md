# Ask Bantoo — Known Issues & Launch Limitations

Pre-existing design constraints and edge cases tracked for launch. These are not necessarily defects but affect QA expectations and support documentation.

---

## Architecture (for reference)

Ask Bantoo transaction flow:

```
User (text / photo / voice)
  → BantooCommand.tsx
  → POST /api/bantoo/extract  (AI or ruleBasedExtract)
  → resolveExtraction()       (entity match + pattern learning)
  → User confirms
  → executeBantooAction()     (validated write)
```

Separate product surface: **Migration wizard "Ask Bantoo" drawer** (`AskBantooDrawer.tsx`) is Q&A only (`wizard-assistant.ts`), not transaction extraction.

---

## Unsupported transaction types (by design)

| User intent | Status | Workaround |
|-------------|--------|------------|
| Create **sales invoice** (on credit) | Not in `BANTOO_ACTION_TYPES` | Use Sales Invoices UI; Ask Bantoo supports **cash** `sales_receipt` only |
| **Inventory adjustment** / stock take | Not supported | Use inventory adjustment screens |
| **Journal entry** | Not supported | Use manual journal entry UI |
| **Add customer** / **add supplier** standalone | Not supported | Customers/Suppliers forms; contacts created via `createParty` during a transaction |
| Record **supplier payment** against a specific bill | No invoice linkage in schema | Record as `expense` or use Payments UI |
| **Multi-line** invoices or receipts | Single-line simplification in execute | Edit document after creation |

---

## AI vs rule-based behavior

| Condition | Behavior |
|-----------|----------|
| No `OPENAI_API_KEY` | Text → `ruleBasedExtract`; photo/voice → 503 |
| AI credits exhausted (text) | Silent fallback to rule parser (`aiFallback: true`) |
| AI credits exhausted (photo/voice) | 402 with upgrade message; no fallback |
| AI hard error (text) | Fallback to rule parser |
| AI hard error (photo/voice) | 502; no fallback |
| Malformed AI JSON | `unknown`, confidence 0 |

Rule parser coverage is **narrower** than AI (receipt/payment/goods-receipt phrasing in EN/FR/Hindi fragments only).

---

## Language & localization gaps

- **Localized:** Modal chrome, field labels, primary banners (`notSure`, `unknownAction`, success messages) via `next-intl` EN/FR.
- **Not localized:** Server `warnings[]`, pattern `fieldReasons`, most API/execute errors, AI `summary` (prompt asks for user language but not enforced server-side).
- **Voice:** Transcription language hint from `document.documentElement.lang` (`en` or `fr` only).

---

## Entity matching & duplicates

- Auto-select party/item only at **≥90** match score (`MATCH_HIGH`).
- Medium matches (60–89) shown in dropdown; user must confirm.
- Duplicate party prevention on save: reuses existing contact only at **≥90** name/phone match; medium matches do not block explicit "create new".
- Product duplicate on **add_inventory_item**: warns but does not block; **receive_stock** may create new item if user confirms.
- Units are free-text aggregated from inventory items (no Unit master table).

---

## Pattern learning limitations

- Data sources: `GoodsReceiptLine`, `PurchaseInvoice`, `Payment` — org-scoped, 6–12 month lookback.
- Applies to: `receive_stock`, `add_inventory_item` (opening stock), `supplier_purchase` (due date only).
- Does **not** learn: customer payments, expenses, sales receipts, customer-specific buying quantities.
- Payment terms fallback uses **approximate** gap between invoice date and next supplier payment (no invoice–payment link in schema); reason string labels this approximate.
- Low-confidence patterns surfaced as options/hints but do not auto-fill values when bucket is `low`.

---

## Confidence & "Not sure"

- Threshold: confidence below **0.5** → `lowConfidence` + confirmation emphasis.
- Rule-based successful parses use fixed **0.75** confidence (never triggers "Not sure" unless action is `unknown`).
- `unknown` action disables Confirm button; user must go back and rephrase.

---

## Billing & rate limits

- AI features metered per org plan (`consumeAiCredit`).
- Rate limits on extract and transcribe endpoints (per org+user, in-memory — resets on server restart; not distributed).

---

## Security & trust boundaries (verified)

- Entity search and execute validate org ownership of party/item/account IDs (unit tests pass).
- Client-supplied IDs never trusted without `orgId` check.

---

## Test coverage notes

- **341** automated tests pass in `ledger/` including Bantoo match, fallback, extract route resilience, pattern learning, duplicate prevention, execute trust boundary.
- **No** dedicated E2E Playwright spec for `BantooCommand` modal.
- **No** live OpenAI integration tests in CI (mocked provider).

---

## Launch recommendation flags

| Area | Launch readiness |
|------|------------------|
| Core receipt/payment/goods receipt (AI + rule EN/FR examples) | Ready with documented phrasing |
| French UI parity | **Gap** — fix BUG-002/003/006 before marketing FR launch |
| Standalone CRM commands (add customer/supplier) | Document as out of scope |
| Sales invoice / adjustments / journals via Ask Bantoo | Document as out of scope |
| Photo/voice | Ready when AI configured + credits available |

---

## Related files (key logic)

| Area | Path |
|------|------|
| UI modal | `ledger/components/BantooCommand.tsx` |
| Extract API | `ledger/app/api/bantoo/extract/route.ts` |
| Transcribe API | `ledger/app/api/bantoo/transcribe/route.ts` |
| AI extraction | `ledger/lib/ai/extract.ts`, `ledger/lib/ai/actions.ts` |
| Rule fallback | `ledger/lib/bantoo/fallback.ts`, `ledger/lib/command-parse.ts` |
| Resolution | `ledger/lib/bantoo/resolve.ts` |
| Fuzzy match | `ledger/lib/bantoo/match.ts` |
| Entities | `ledger/lib/bantoo/entities.ts` |
| Pattern learning | `ledger/lib/command-patterns.ts` |
| Execute | `ledger/app/actions/bantoo.ts` |
| Duplicate detection | `ledger/lib/parties.ts` (`findPossiblePartyDuplicates`) |
| i18n | `ledger/messages/en.json`, `ledger/messages/fr.json` (`command.*`) |
