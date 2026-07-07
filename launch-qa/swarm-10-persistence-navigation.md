# Swarm Track 10 — Persistence / Navigation Agent

Scope: every Ask Bantoo action type that results in a save is checked against the
invariant **"if the UI says saved, a real record must exist with the fields shown
in the confirmation plan, and navigation must point at that real record."**

Baseline verified: `git log --oneline -5` showed `de87013` (customer field-persistence
fix) on top of `012175a`, as expected.

## 🚨 TOP-LINE CRITICAL FINDING (read this first)

**`create_supplier` silently drops every profile field (city, phone, WhatsApp) whenever
it ends up attaching to an already-existing supplier, in BOTH of the two ways that can
happen.** The confirmation screen shows "✓ Set city: Garoua", "✓ Set phone: ...", "✓ Set
WhatsApp: ..." as **ready**, the save succeeds with **no error and no warning**, and
navigation goes to a **real, correct supplier profile** — but that profile's
city/phone/WhatsApp are left completely unchanged. This is the "record exists but is
missing fields that were shown as checked/confirmed in the plan" failure pattern the
swarm was specifically asked to hunt for.

- It is **not** the "message says saved but no record exists" worst case, and it is
  **not** an ID-mismatch (`href` always points at a genuine, existing Party row).
- It **is** a genuine, reproducible **partial-persistence / plan-vs-reality drift**,
  and it is easy to miss in manual QA because the note field (if any) still saves
  correctly, so a spot-check on "did my note get added" looks fine while the phone
  number silently didn't save.
- Root cause: `app/actions/bantoo.ts`'s `create_supplier` case has **no `updateParty`
  call anywhere in it** — unlike `create_customer`'s mirror, which builds a full
  `enrichment` object and calls `updateParty` in the exact same "attached to an
  existing record" situation (`app/actions/bantoo.ts` lines ~533-566). `create_supplier`
  only ever calls `appendPartyNote`. See regression tests below (both **FAIL** against
  the current code, confirming the bug).

No case of "saved but no record exists at all" or "ID in the message doesn't match the
real record's ID" was found anywhere in the 15 save-performing action types audited.

## Action type enumeration (from `lib/ai/actions.ts`)

28 action types total; 15 perform a save, 8 are pure navigation/answer (never claim to
save), and 5 are `unsupported_*_action`/`unknown` no-ops (UI hides the confirm button,
per `BantooCommand.tsx`'s `canConfirm`).

## Results table — save-performing actions

| Action | Test command | Success message observed | Nav target (`href`) | Actual queried record | Pass/Fail | Root cause | Proposed fix |
|---|---|---|---|---|---|---|---|
| `create_supplier` (brand new) | "Save Alhaji Ibrahim as a supplier in Garoua, phone 690123456" | generic `successSaved` | `/suppliers/party_N` | Party row with name/city/phone/whatsapp all persisted | **PASS** | — | — |
| `create_supplier` (attaches to existing via resolve.ts auto-select) | Same command, existing "Alhaji Ibrahim" supplier already on file with blank city/phone | generic `successSaved`, **no warning at all** | `/suppliers/party_olam` (real, correct id) | Party row's `city`/`phone`/`whatsapp` remain `null` — plan promised `setCity`/`setPhone`/`setWhatsapp` as ready | **FAIL** (critical) | `execute()`'s `create_supplier` "found existing" branch (`app/actions/bantoo.ts` ~L661-676) only calls `appendPartyNote`; no `updateParty` call exists in the whole `create_supplier` case | Add the same `enrichment` object + `updateParty` call `create_customer` already has, applied identically in both the `input.partyId` branch and after `ensurePartyId` resolves to an existing id |
| `create_supplier` (attaches to existing via `ensurePartyId`'s own fuzzy safety-net, resolve.ts saw no match) | Same command; a same-named supplier appears between resolve and confirm (race / stale client cache) | generic `successSaved`, no warning | `/suppliers/party_race` (real, correct id) | Same as above — city/phone/whatsapp dropped | **FAIL** (critical) | Same root cause, second entry point into the identical missing-`updateParty` gap | Same fix, applied once (both paths funnel through the same missing enrichment step) |
| `create_customer` (identical scenario, control) | "Save Aisha Musa as a customer in Garoua, phone 690123456", existing "Aisha Musa" on file | generic `successSaved` | `/customers/party_musa` | city/phone/whatsapp **correctly** applied via `updateParty`'s `enrichment` object | **PASS** | — (proves the bug is `create_supplier`-specific, not a general limitation) | — |
| `create_customer` duplicate "use existing" | Fuzzy match ("Golu Transport" vs existing "golu"), user picks "use existing" | `successSaved` | `/customers/party_golu` | Same id; only submitted fields updated, pre-existing fields not blanked | **PASS** | — | — |
| `create_customer` duplicate "create new" | Same fuzzy match, user picks "create as new" | `successSaved` | `/customers/party_<new>`, distinct from the matched id | New, distinct Party row created; old row untouched | **PASS** | — | — |
| `edit_customer` | "Update Musa Adamou's phone to 690111111 and city to Maroua" | `successCustomerUpdated` | `/customers/<same-id>` | Same row updated in place; no second row created | **PASS** | — | — |
| `edit_supplier` | "Update Olam's phone to 690222222 and city to Maroua" | `successCustomerUpdated`-style message | `/suppliers/<same-id>` | Same row updated in place; no second row created | **PASS** | — | — |
| `add_customer_note` | "Add a note to Halima Souleymane: pays every Friday" | `successNoteAdded` | `/customers/<id>?tab=notes` | Note appended to the real row's `notes` field | **PASS** | — | — |
| `add_supplier_note` | "Add a note to Elhaji Adamou: delivers on Tuesdays" | `successNoteAdded`-style | `/suppliers/<id>?tab=notes` | Note appended to the real row's `notes` field | **PASS** | — | — |
| `receive_stock` | "Received 10 bags rice at 500 from Olam" | generic | `/goods-receipts/<id>` | `href`/`number` are literally the returned `GoodsReceipt` object's own id/number (single write, no re-fetch) | **PASS** | — | — |
| `supplier_purchase` | "Bought cement 120,000 from Olam" | generic | `/purchase-invoices/<id>` | Same single-write guarantee | **PASS** | — | — |
| `customer_payment` | "Received 50,000 from Aisha Musa" | generic | `/receipts/<id>` | Same single-write guarantee | **PASS** | — | — |
| `expense` | "Paid 7,500 for fuel" | generic | `/payments/<id>` | Same single-write guarantee | **PASS** | — | — |
| `sales_receipt` | "Cash sale 15,000" | generic | `/sales-receipts/<id>` | Same single-write guarantee | **PASS** | — | — |
| `sales_invoice` | "Invoice Golu Transport 200,000, due in 30 days" | generic | `/sales-invoices/<id>` | Same single-write guarantee; `dueDate` forwarded correctly | **PASS** | — | — |
| `credit_note` | "Credit note 9,000 for Aisha Musa" | generic | `/credit-notes/<id>` | Same single-write guarantee | **PASS** | — | — |
| `refund_receipt` | "Refund 3,000" (no customer) | generic | `/refund-receipts/<id>` | Same single-write guarantee; nullable party handled | **PASS** | — | — |
| `add_inventory_item` | "New item Sugar 1kg, sale price 1000" | generic | `/inventory-items` | Item created with the returned code as `number` | **PASS** | — | — |
| `add_inventory_item` + opening stock | Same + "20 units at 700 from Olam" | generic | `/inventory-items` | The opening-stock `receiveGoods` call uses the **exact same `item.id`** just created — no drift between the new item and its own opening-stock receipt | **PASS** | — | — |

## Navigation-only / read-only actions (never claim "saved", audited for target-ID correctness only)

`view_customer`, `view_supplier`, `contact_customer`, `contact_supplier`,
`customer_balance`, `supplier_balance`, `customer_query`, `supplier_query`,
`view_sales_invoice` — all resolve a party first (or skip resolution for the `list`
view), then build `href` directly from that resolved party's own `id`/fields. Verified
`view_customer` (`profile`) and `view_supplier` (`ledger`) end-to-end against a real
Party row: **PASS**, `href` always contains the actually-resolved id. No stale/generic
placeholder route was found.

## Multi-step planner `postAction` ("open profile") check

`create_customer`/`create_supplier`/`edit_customer` support a `post_action:
"open_profile"` field, rendered as a `setNote`-style plan step. Traced through:
`draft.postAction` is set by `resolve.ts` but **`executeBantooAction` never reads it** —
however this is **not a bug**, because `href` for these three actions is *already
always* the party's profile route (`/customers/:id` / `/suppliers/:id`) regardless of
whether "open profile" was requested. The "post-action" is structurally satisfied by
construction; there is no separate navigation path that could diverge from it.

## Duplicate-resolution ID consistency (customer)

Both `duplicateResolution: "use_existing"` and `"create_new"` were tested end-to-end
against a real fuzzy-match scenario ("Golu Transport" vs. existing "golu"): the
"existing" branch's `href` id matches the pre-existing row exactly; the "create new"
branch's `href` id is a **distinct, brand-new** row, and the original row is left
byte-for-byte untouched. **PASS** for both branches.

Note: **`create_supplier` has no equivalent duplicate-choice UI/flow at all** (this is
a known, already-documented gap per the code comment above `createSupplierSchema` in
`lib/ai/actions.ts` — "minus the possible-duplicate safety fix... hasn't been ported to
create_supplier yet"). Combined with today's finding, this means a supplier-side fuzzy
match is not just unconfirmed, it also silently loses data on the "confirm" side. This
compounds the two known gaps into one higher-severity issue than either alone.

## Regression tests added

1. **`ledger/lib/bantoo/qa-swarm-10-persistence-nav.test.ts`** — true end-to-end tests
   against a real in-memory Party store (same pattern as
   `app/actions/bantoo-create-customer.e2e.test.ts`): runs the actual
   `resolveExtraction` + `executeBantooAction` + `listParties`, and asserts on the
   **persisted record**, never just the returned proposal/result object.
   - **13 tests, 11 passed, 2 failed.**
   - The 2 failures are the critical `create_supplier` bug (Section 2 in the file:
     "resolve.ts auto-selects an EXACT-name-match existing supplier" and "execute-time-
     only match via ensurePartyId's own safety net") — both failures are the intended
     regression signal, encoding the *correct* expected behavior.
   - All other sections (brand-new create_supplier, create_customer control,
     edit_customer/edit_supplier in-place updates, add_customer_note/add_supplier_note,
     view_customer/view_supplier navigation, duplicate-resolution use_existing/create_new)
     **passed**, confirming those paths are solid.
2. **`ledger/app/actions/qa-swarm-10-document-nav.test.ts`** — structural ID-consistency
   tests (mocking `lib/documents.ts`/`lib/inventory.ts`, matching this repo's existing
   test convention for money-document actions) for `receive_stock`,
   `supplier_purchase`, `customer_payment`, `expense`, `sales_receipt`,
   `sales_invoice`, `credit_note`, `refund_receipt`, and `add_inventory_item`
   (with and without opening stock).
   - **10 tests, all passed.** Confirms every money/document action's `href` is built
     directly from the single write's own returned id/number — no double-lookup, no
     drift opportunity by construction.

Actual run output (`npx vitest run` on both new files):

```
lib/bantoo/qa-swarm-10-persistence-nav.test.ts (13 tests | 2 failed)
app/actions/qa-swarm-10-document-nav.test.ts   (10 tests | 0 failed)

Test Files  1 failed | 1 passed (2)
     Tests  2 failed | 21 passed (23)
```

A full-suite run (`npx vitest run`) afterward showed no new breakage from these two new
files beyond the 2 intentional failures above; the other pre-existing failures visible
in the full run belong to other swarm tracks' own `qa-swarm-01/05/07-*.test.ts` files
(different, already-documented bugs in extraction/field-parsing, out of scope for this
track) and were not touched or caused by this work.

## Proposed fix (for the critical finding)

In `app/actions/bantoo.ts`'s `create_supplier` case, mirror `create_customer`'s
`enrichment` object + `updateParty` call exactly:

- In the `if (input.partyId)` branch (existing supplier resolved by the client),
  build the same kind of `enrichment` object from `draft.city`/`draft.phone`/
  `draft.whatsapp` (create_supplier currently has no email/company/tax-id/etc. fields,
  so the object is smaller than the customer one) and call `updateParty` before/along
  with `appendPartyNote`.
- After `ensurePartyId` returns an id in the "not already resolved" branch, apply the
  same enrichment regardless of whether that id came from a genuinely new `createParty`
  call or from `ensurePartyId`'s own internal duplicate-safety-net fallback — right now
  city/phone/whatsapp are only set when `createParty()` itself runs.
- Longer-term (already flagged as a known gap in the codebase's own comments): port the
  `possibleDuplicateCustomer`-style explicit "use existing vs. create new" prompt to
  `create_supplier` as well, so a fuzzy (non-exact) name match forces a user choice
  instead of silently auto-attaching in the first place — this would prevent the
  precondition for the enrichment-drop bug from being reached silently.
