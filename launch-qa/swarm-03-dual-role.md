# QA Swarm — Track 3: Customer + Supplier Dual-Role Agent

**HEAD at time of testing:** `de87013` (on top of `012175a`), branch `main`.

## Top-line summary

**Dual-role does not work today.** Ask Bantoo has no mechanism to add a
second role (customer or supplier) to an existing Party. Worse, it fails
*silently*: the confirmation preview shown to the user promises a clean
"create new supplier" (or "create new customer"), but at save time the
system quietly reuses the pre-existing Party from the *other* role, reports
success, and drops the new role's phone number on the floor — the Party's
`type` is never upgraded and it never becomes visible in the other role's
list/lookups. The user is told "supplier created" (with a `/suppliers/...`
link) while nothing supplier-related was actually persisted.

This is not a rare edge case — it will trigger for **any** business that is
both a customer and a supplier and is added to the system in two separate
Ask Bantoo commands, which is exactly how real users will do it (per the
task brief, a single message can only carry one role at a time anyway — see
Data model section).

## Data model finding (from `prisma/schema.prisma`)

```224:230:ledger/prisma/schema.prisma
model Party {
  id        String   @id @default(cuid())
  orgId     String
  name      String
  type      String   @default("both") // customer | supplier | both
  phone     String?
  createdAt DateTime @default(now())
```

- Customer and supplier are **the same `Party` row**, distinguished by a
  single `type: String` column with three legal values: `"customer"`,
  `"supplier"`, `"both"`. There is **no** pair of independent
  `isCustomer`/`isSupplier` booleans and no role-scoped enum array — just one
  scalar field.
- There is exactly **one** `phone` column (and one `whatsapp`, `city`,
  `email`, etc.) shared by both roles. There is no `customerPhone` /
  `supplierPhone` split.
- `lib/parties.ts`'s `listParties(orgId, type)` is how every "customer list"
  / "supplier list" page and Ask Bantoo's own entity matcher (`resolveParty`
  → `loadEntityCandidates`) scope by role:

```1:12:ledger/lib/parties.ts
export function listParties(orgId: string, type?: "customer" | "supplier") {
  return prisma.party.findMany({
    where: {
      orgId,
      ...(type ? { type: { in: [type, "both"] } } : {}),
    },
    orderBy: { name: "asc" },
  });
}
```

**What "correct" means here, given this model:** a true dual-role business
must end up as a **single** Party row with `type: "both"`. Since there is
only one `phone` field, the product has not actually decided what happens
when the customer-side phone and the supplier-side phone differ (see "Data
model ambiguity" below) — that is a real, unresolved product question, not
something this report can fix.

## Command tests

### Test 1 — "Create Horizon Logistics Ltd as a customer. Phone +237 677 111 222."

- **Expected:** new Party created, `type = "customer"`, `phone = "+237 677 111 222"`.
- **Actual:** works exactly as expected.
- **Result:** ✅ PASS.

### Test 2 (THE CRITICAL TEST) — "Create Horizon Logistics Ltd as a supplier. Phone +237 699 333 444." (run immediately after Test 1, same org)

- **Expected (any of):** (a) the system recognizes this is the same business and upgrades the existing Party's `type` to `"both"`, ideally asking the user how to reconcile the differing phone numbers; or (b) at minimum, it clearly tells the user "a customer named Horizon Logistics Ltd already exists — do you want to add the supplier role to it, or create a separate contact?"
- **Actual:**
  1. At **resolve/preview time**, `resolveParty(name, "supplier")` calls `loadEntityCandidates(ctx, "supplier")` → `listParties(orgId, "supplier")`, which filters `type IN ["supplier","both"]`. The existing Party has `type = "customer"`, so it **is invisible to the supplier-scoped matcher**. The proposal shows zero party options and `createParty: true` — i.e. the user is shown a totally clean "create new supplier" preview, with no hint that "Horizon Logistics Ltd" already exists in the system at all.
  2. At **execute time**, `app/actions/bantoo.ts`'s `ensurePartyId()` runs a *second*, **untyped** duplicate check via `findPossiblePartyDuplicates()` (`lib/parties.ts`), which queries **all** parties in the org regardless of `type` and does a pure name/phone/whatsapp fuzzy match. "Horizon Logistics Ltd" vs "Horizon Logistics Ltd" is an exact string match → score 100 → clears `MATCH_HIGH` (90) → `ensurePartyId` **silently returns the existing customer-only Party's id** instead of creating anything.
  3. Because an existing id was returned, `createParty()`/`updateParty()` are **never called** for this request. The result is `{ ok: true, href: "/suppliers/party_horizon" }` — looks like total success.
  4. Net effect: the supplier phone `+237 699 333 444` is **never persisted anywhere** (silently lost). The Party's `type` is **still `"customer"`** — never upgraded to `"both"`. No second Party row is created either.
- **Result:** ❌ FAIL. Root cause: (1) resolve.ts's `resolveParty`/`loadEntityCandidates` scope duplicate/candidate matching by role-filtered `type`, so an existing party under the *other* role is invisible at preview time; (2) `ensurePartyy Id`'s execute-time safety net (`findPossiblePartyDuplicates`) is role-*unaware* and silently reuses that same party without ever adding the new role or its fields. These two facts combine to produce a "confirms one thing, silently does something completely different" bug — the exact anti-pattern the recent `012175a`/`de87013` commits fixed for the *same-role* duplicate case, but never ported to the *cross-role* case.
- **Proposed fix (requires product decision on the phone-conflict question first — see below):** `ensurePartyId`'s duplicate-reuse branch needs to know it's being called for a specific target role. When it silently reuses an existing party whose `type` doesn't already include that role, it must **upgrade** `type` to `"both"` (or to the new role, if it's currently the *other* single role) as part of that reuse — mirroring the `type: { in: ["supplier","both"] }` pattern already used a few lines above it for the "explicit existing partyId" branch in the same file. Ideally, this role-upgrade case should also surface a duplicate-confirmation prompt (like `create_customer`'s `possibleDuplicateCustomer`/`duplicateCandidate` flow) rather than happening silently, since it is changing the meaning of an existing record, not just enriching empty fields.

### Test 3 — Query: single Party (dual-role) vs two separate Parties vs role-stomping?

- **Actual:** Neither of the "expected" outcomes happens. There is exactly **one** Party row (no duplicate row was created — that part of the duplicate-prevention logic worked), but it never gained the supplier role (`type` stayed `"customer"`), and the supplier's phone was discarded rather than either being stored or overwriting the customer's phone. So it's not "role B stomps role A's fields" — it's "role B's fields go to `/dev/null` while pretending to have saved successfully."
- **Result:** ❌ FAIL, same root cause as Test 2.

### Symmetric reverse-order test — create as supplier first, then as customer

- Tested `ensurePartyId`/`resolveExtraction` with a pre-existing `type: "supplier"` Party and a subsequent `create_customer` request with a different phone.
- **Actual:** Exactly the same bug, symmetrically: the customer-scoped resolver never sees the supplier-only Party, `ensurePartyId`'s untyped fuzzy-duplicate check silently reuses it, `type` stays `"supplier"`, and the customer phone is dropped.
- **Result:** ❌ FAIL (regression test added, passes as documentation of current — broken — behavior).

### Single-message compound command — "Create Horizon Logistics Ltd as both a customer and a supplier... Customer phone ... Supplier phone ... Do not merge the roles."

- **Investigation:** `lib/ai/actions.ts`'s `extractedActionSchema` is `z.discriminatedUnion("action", [...])`, with `createCustomerSchema` and `createSupplierSchema` as separate, mutually-exclusive union members (`action: z.literal("create_customer")` vs `action: z.literal("create_supplier")`). A single `ExtractedAction` object is **structurally incapable** of representing "do both" — there is no field for a second role's name/phone, and no execute() branch that processes two roles from one action object.
- **Actual:** This command can only ever be classified as **one** of `create_customer` OR `create_supplier` (whichever the AI/rule layer's tie-break picks — see `create-supplier.test.ts`'s already-existing "last explicit mention wins" tests for that separate, already-tested behavior). Whichever role loses is **entirely dropped**: its phone number is captured nowhere, and it is not even routed to `unsupported_requests` (the parser has no concept of "a second, different-typed contact"), so the user gets no feedback that half their request was ignored.
- **Result:** ❌ Not a bug per se, but a hard product-level limitation worth calling out explicitly: **Ask Bantoo cannot create a dual-role party in a single command today, and gives no feedback when a compound dual-role request is only half-fulfilled.** This is a natural consequence of Ask Bantoo's one-action-per-message design and is much lower priority than Test 2's silent-failure bug, since real users will most likely issue two separate commands anyway (as the task brief itself notes) — but Test 2 shows that path is *also* broken.
- **Flag:** requires product decision (see below) more than it requires a code fix — the schema would need either a new compound action or a documented "one role per message" limitation communicated to the user.

## Other findings

### `findPossiblePartyDuplicates`'s duplicate-matching logic does get confused, but not the way the brief speculated

The brief asked: does `create_customer`'s duplicate-matching logic get
confused by a supplier with the same name and offer a nonsensical prompt?
In practice it's worse than "a nonsensical prompt" — **no prompt is shown at
all**. `create_supplier`'s resolve.ts case is explicitly documented (see its
own comment) as *not yet* having the `possibleDuplicateCustomer`-style
conflict-prompt safety net that `create_customer` got in a separate, later
sprint (commits `012175a`/`de87013`). So for `create_supplier` specifically,
even a *same-role* fuzzy duplicate is auto-reused without confirmation
today — the cross-role case in Test 2 simply inherits that same gap, made
worse by the type-filtering blind spot described above.

### Accounting-side separation (receivables vs payables)

Not tested/changed per the task scope (ledger/accounting logic is out of
scope here) — but worth noting for context: `salesInvoices`/`purchaseInvoices`
etc. are separate relations on `Party` regardless of `type`, so once a Party
*does* correctly reach `type: "both"`, the receivables/payables split is
structurally sound (different relation tables, not a shared ledger). The
bug documented above is purely about the Party record's `type`/contact-field
handling never reaching that state in the first place — it never gets a
chance to test the accounting split because the supplier role is never
actually added.

### Data-model ambiguity requiring a product decision (not a code bug)

Because `Party.phone` is a single shared column, **the product has never
decided** what should happen when a business's customer-side phone and
supplier-side phone genuinely differ (a very plausible real scenario — e.g.
sales calls go to one line, logistics/dispatch calls go to another). Once
the type-upgrade bug above is fixed, whoever fixes it will immediately hit
this fork:
- Option A: keep one shared `phone`, and require the second `create_*`
  role-add request to explicitly overwrite it (with a confirmation prompt
  showing the conflict, similar to `create_customer`'s existing
  `possibleDuplicateCustomer` conflict UI).
  - Option B: add the schema fields needed for two independent
  role-scoped phone numbers (a real schema migration, bigger scope).
  - Option C: keep single phone but store the "other" number in `notes` or a
  new dedicated field.

  This report deliberately does **not** guess which of these the product
  wants — it is flagged here as a blocking decision for whoever fixes the
  type-upgrade bug.

## Regression tests added

`ledger/app/actions/qa-swarm-03-dual-role.test.ts` — 7 tests, **all passing**
(i.e., they currently pass by asserting the *actual*, buggy behavior
documented above, so they'll immediately flag a regression — or a fix — the
moment `ensurePartyId`/`resolveParty` change):

1. Data-model sanity check: `listParties("customer")`/`listParties("supplier")` both key off the single shared `type` column.
2. Baseline: `create_customer` for a brand-new name works correctly.
3. **BUG reproduction (resolve-time):** `create_supplier` for an existing customer-only Party shows a clean "create new" preview with zero party options — the pre-existing Party is invisible to the supplier-scoped matcher.
4. **BUG reproduction (execute-time):** running that same `create_supplier` command all the way through `executeBantooAction` proves: no second Party is created, the Party's `type` stays `"customer"` (never becomes `"both"`), the supplier phone is never persisted, and the party remains completely invisible to `listParties(orgId, "supplier")` despite `execute()` returning `ok: true` with a `/suppliers/...` href.
5. **Root-cause isolation:** calls `findPossiblePartyDuplicates` directly to show it returns the customer-only Party as a `score: 100` / `matchedOn: "name"` hit for a supplier-creation request, with no type-awareness at all.
6. **Symmetric reverse-order case:** create-as-supplier-first then create-as-customer-second exhibits the identical bug in the other direction.
7. **Schema-level documentation:** proves `create_customer`/`create_supplier` are mutually exclusive members of a discriminated union, so a single compound "both roles in one message" command can never be represented as one `ExtractedAction`.

Run with:
```
cd ledger && npx vitest run app/actions/qa-swarm-03-dual-role.test.ts
```
Result: **7/7 passed** (confirming the documented behavior is exactly what production code does today).

## Files read (not modified, per isolation rules)

- `prisma/schema.prisma` (`Party` model)
- `lib/parties.ts`
- `lib/bantoo/resolve.ts`
- `lib/bantoo/entities.ts`
- `lib/bantoo/match.ts`
- `lib/ai/actions.ts`
- `app/actions/bantoo.ts`
- `app/actions/bantoo-create-customer.e2e.test.ts` (existing test-harness pattern reused for the new regression file)
