# QA Swarm Track 9 — Language Consistency Agent

**Scope:** Every user-facing string produced by Ask Bantoo (`lib/ai/extract.ts`,
`lib/bantoo/resolve.ts`, `lib/bantoo/fallback.ts`, `app/actions/bantoo.ts`,
`components/BantooCommand.tsx`) checked against the current UI locale
(`messages/en.json` / `messages/fr.json`, next-intl `command.*` keys), across the
required test matrix (create_customer full field set, duplicate-choice block, unsupported
action, missing-contact-info, mixed input/UI language, and the AI `summary` field).

**Repo state:** HEAD `de87013` ("Fix Ask Bantoo create_customer field persistence and
duplicate-save behavior"), on top of `012175a` ("Fix create_customer silently attaching to an
unrelated existing party.") and `57589fb` ("Fix create_customer silently ignoring the 'create as
new' duplicate choice."). Confirmed via `git log --oneline -5` before testing.

**Method:** Read every file in scope end-to-end (no source edits, per isolation rules). Diffed
`messages/en.json` against `messages/fr.json` key-for-key with a small script to find missing/stale
translations. Traced the full pipeline `app/api/bantoo/extract/route.ts` →
`lib/ai/extract.ts` → `lib/bantoo/resolve.ts` → `components/BantooCommand.tsx` (proposal review) →
`app/actions/bantoo.ts` (`executeBantooAction`, confirm & save) to find every place text reaches the
user, and checked whether that text goes through next-intl's `t()` (locale-aware) or is a raw
string (locale-blind). Added three new, additive-only regression test files that exercise the real
(unmocked, except for DB/network boundaries) `resolveExtraction`, `executeBantooAction`, and
`extractBantooAction` functions to prove each finding with passing/failing assertions rather than
just static reading.

**Regression tests added (all new files, no existing test/source file touched):**
- `ledger/lib/bantoo/qa-swarm-09-language-consistency.test.ts`
- `ledger/app/actions/qa-swarm-09-language-consistency.test.ts`
- `ledger/lib/ai/qa-swarm-09-language-consistency.test.ts`

**Test run result:** `npx vitest run <the 3 files above>` → **13/13 passed** (all tests pass today;
several of them exist specifically to *document* current buggy behavior with an explicit
`expect(...).toBe("<hardcoded English literal>")`, so they will need to be updated, not just
re-passed, once the fixes below are applied). A full-suite run (`npx vitest run`) shows **713/721
passing**; the 8 pre-existing failures are all in other swarm lanes' own new test files
(`lib/bantoo/qa-swarm-01-customer-creation.test.ts`, `lib/bantoo/qa-swarm-05-complex-extraction.test.ts`)
documenting unrelated field-order/field-persistence bugs — nothing in this lane's changes caused or
touched those.

```
✓ resolveExtraction: Atlas Agro Trading Ltd plan covers every new field, all EN+FR translated
✓ resolveExtraction: Golu→Golu Transport (Ngoundéré) duplicate block is 100% code-driven, no prose
✓ resolveExtraction: Archive Musa → notYetAvailable warning === command.notYetAvailable verbatim
✓ resolveExtraction: Call Musa (no phone) → missingPhone warning fires correctly, pre-flight
✓ executeBantooAction: contact_customer/call error is a hardcoded English literal, not FR-aware
✓ executeBantooAction: edit_customer success `message` shadows command.successCustomerUpdated
✓ executeBantooAction: add_customer_note success `message` shadows command.successNoteAdded
✓ executeBantooAction: customer_balance message is fully hardcoded English prose
✓ executeBantooAction: unsupported_customer_action fallback error is hardcoded English
✓ executeBantooAction: generic validation errors (e.g. add_inventory_item) are hardcoded English
✓ extractBantooAction: ExtractInput carries no locale field at all
✓ extractBantooAction: system prompt says "in the user's language", never "UI/display locale"
✓ extractBantooAction: demonstrates English-input → English-summary regardless of UI locale
```

---

## Top-line findings

1. **Input-language-leaking-into-output-language: CONFIRMED, root cause identified.**
   `lib/ai/extract.ts`'s system prompt instructs the model to write `summary` "in the user's
   language" — i.e. the language of the *input text*, not the UI locale. Nothing in the pipeline
   (`ExtractInput`, `app/api/bantoo/extract/route.ts`) ever reads or forwards the UI locale
   (`NEXT_LOCALE` cookie) to the AI call at all. This means scenario 5 (French UI + English input)
   and scenario 6 (English UI + French input) from the task brief **both fail**: `proposal.summary`
   comes back in the input's language, not the UI's, whenever the AI path is used. See "Root cause
   #2" below.

2. **A second, independent, and arguably more severe language-leak: `app/actions/bantoo.ts`
   (`executeBantooAction`, the Confirm & Save endpoint) is 100% locale-blind.** It never imports
   next-intl, never reads locale, and every success `message` / failure `error` string it returns
   is a hardcoded English literal. Because `BantooCommand.tsx`'s `successMessage()` does
   `if (success.message) return success.message;` *before* trying any `t()` call, this hardcoded
   English text **permanently shadows** several already-correctly-translated FR catalog keys
   (`successCustomerUpdated`, `successNoteAdded`, and the `customer_balance`/`supplier_balance`/
   `customer_query`/`supplier_query` messages, which have no catalog key backing them at all — see
   Root cause #1). Failure `error` strings have no localized fallback whatsoever and are rendered
   verbatim.

3. **No missing FR translations were found for the newer credit-limit/payment-terms/tax-ID plan-step
   labels.** `command.plan.setCreditLimit`, `setPaymentTerms`, `setTaxId`, `setCompanyName`,
   `setDiscount`, and `setEmail` are all present and correctly translated in both `en.json` and
   `fr.json` today (verified with a full key-diff, see "Translation catalog audit" below). However,
   **no regression test previously covered them** — `lib/bantoo/warnings-i18n.test.ts`'s
   `PLAN_STEP_CODES` list only checks `createCustomer`/`editCustomer`/`setCity`/`setPhone`/
   `setWhatsapp`/`setNote`/`openProfile`/`unsupportedStep`/`createSupplier`/`openSupplierProfile` —
   so a future edit could silently drop one of the newer keys with nothing catching it. Closed this
   gap with a new test (see below). One unrelated, pre-existing translation gap was found:
   `settings.migrationWizard` ("Migration & Opening Balances") has no FR key at all — out of scope
   for Ask Bantoo but flagged for completeness.

---

## Translation catalog audit (`messages/en.json` vs `messages/fr.json`)

Ran a full key-diff (flattened, recursive) of both catalogs:

- **Keys present in EN but missing in FR:** only `settings.migrationWizard` — unrelated to Ask
  Bantoo, out of this lane's scope, flagged for the settings-page owner.
- **Keys present in FR but missing in EN:** none.
- **Every `command.*` key** (including all `command.plan.*`, `command.warnings.*`,
  `command.duplicateCustomer.*`, `command.fieldReasons.*`, and every `actionX`/`actionUnsupportedX`
  label) **has a translation in both locales.** This directly contradicts the a-priori assumption in
  the task background that the newer credit-limit/payment-terms/tax-ID labels might be missing FR
  coverage — they are not missing, they are simply untested (fixed, see below).
- A handful of `command.*` keys are byte-identical between EN and FR by design, not by omission
  (`command.date` = "Date" in both, `command.whatsapp` = "WhatsApp" in both, `command.plan.title` =
  "Plan" in both, `command.plan.setWhatsapp` = "WhatsApp — {value}" in both) — these are genuine
  loanwords/identical terms in French business usage, not untranslated leftovers.

---

## Scenario-by-scenario results

### 1. "Create a new customer called Atlas Agro Trading Ltd in Bertoua. Phone +237 677 123 456. Payment terms 45 days. Credit limit 8,500,000 XAF."

| Locale | Element | Result |
|---|---|---|
| EN & FR | Suggested action label (`actionCreateCustomer`) | **PASS** — both translated |
| EN & FR | Plan step: create customer | **PASS** |
| EN & FR | Plan step: city | **PASS** |
| EN & FR | Plan step: phone | **PASS** |
| EN & FR | Plan step: payment terms (45 days) | **PASS** — `setPaymentTerms` translated in both |
| EN & FR | Plan step: credit limit (8,500,000 XAF) | **PASS** — `setCreditLimit` translated in both |
| EN & FR | Confirmation/save button label | **PASS** — generic `confirm`/`confirming` keys |
| EN & FR | `proposal.summary` (AI-generated) | **CONDITIONAL FAIL** — see Root cause #2. If the user types this command in English while the UI is set to French, the AI-generated one-line summary shown just above the plan comes back in English, not French, because the prompt asks for "the user's language" (the input's), not the UI's. This is exactly scenario 5's failure mode applied to this same command. |

All the *field labels* (city/phone/payment terms/credit limit/tax ID/company name/default discount)
are proven translated end-to-end by the new
`ledger/lib/bantoo/qa-swarm-09-language-consistency.test.ts` test, which builds the exact compound
`create_customer` action this command would extract to (all fields set) and asserts every resulting
`proposal.plan[].code` has a real string in both `en.json` and `fr.json` — closing the coverage gap
in the pre-existing `warnings-i18n.test.ts`.

### 2. Duplicate-triggering command ("Golu" in Garoua existing; "Golu Transport" in Ngoundéré)

| Locale | Element | Result |
|---|---|---|
| EN & FR | Heading ("Found an existing customer named "{name}"") | **PASS** — `duplicateCustomer.title` |
| EN & FR | "On file for this customer:" | **PASS** — `duplicateCustomer.existingDetails` |
| EN & FR | Radio 1: "Use existing customer — {name}" | **PASS** — `duplicateCustomer.useExisting` |
| EN & FR | Radio 2: "Create as a new customer with the same name" | **PASS** — `duplicateCustomer.createNew` |
| EN & FR | City/Phone/WhatsApp row labels inside the block | **PASS** — plain `command.city`/`command.phone`/`command.whatsapp` keys, both translated |

`resolve.ts` never emits any prose for this block itself — it only returns the raw
`duplicateCandidate` data (`{id, name, city, phone, whatsapp}`) and the `possibleDuplicateCustomer`
warning code; 100% of the visible text is rendered client-side via `t()`. **No bug found here** —
verified end-to-end with a new test that builds the exact "Golu"/"Golu Transport"/Ngoundéré scenario
from the task brief (existing exact-name "Golu" match with a conflicting city) and asserts the
duplicate block's four catalog keys all exist and are non-empty in both locales.

### 3. Unsupported action ("Archive Musa")

`command.notYetAvailable` (top-level) and `command.warnings.notYetAvailable` (the code
`unsupported_customer_action` actually raises) were confirmed to be **byte-identical** in both
`en.json` and `fr.json` — the FR wording is exactly "Je pourrai bientôt vous aider avec cela, mais
cette action n'est pas encore disponible." in both places, matching the task's precise-wording
requirement. **PASS**, with a new regression test locking the two keys together so a future edit to
only one of them doesn't silently break this invariant.

One caveat, not a locale bug but worth flagging: `app/actions/bantoo.ts`'s
`unsupported_customer_action` execute-branch has its own **hardcoded English** fallback error
("This action is not available yet.") for the same condition. It is currently unreachable from the
UI (`BantooCommand.tsx`'s `canConfirm` hides the Confirm button entirely for
`unsupported_customer_action`/`unsupported_supplier_action`/`unsupported_sales_action`), so this is
latent/defense-in-depth risk rather than a live bug — but it means if that button-hiding logic is
ever loosened for any reason, this hardcoded string would leak into a French UI immediately with no
warning.

### 4. Missing-contact-info ("Call Musa" where Musa has no phone)

- **`resolve.ts` pre-flight check: PASS.** `contact_customer` with `method: "call"` and no phone on
  file raises the `missingPhone` warning code, which is fully translated in both locales
  ("Ce client n'a pas de numéro de téléphone enregistré. Ajoutez-en un d'abord." in FR). This is
  shown on the proposal-review screen in the correct locale.
- **`app/actions/bantoo.ts` execute()-side re-check: FAIL.** `BantooCommand.tsx`'s `canConfirm`
  logic does *not* disable the "Continue" button just because a `missingPhone` warning is present —
  the phone field isn't even shown for `contact_customer` (see `renderProposalFields`'s
  `contact_customer` case), so the user has no way to fix it inline and nothing stops them from
  clicking Continue anyway. When they do, `executeBantooAction`'s own re-check for the exact same
  condition returns the **hardcoded English literal** `"This customer has no phone number on file.
  Add one first."` — verbatim, in a French UI, with no `t()` call anywhere in the path. Confirmed
  with a new regression test that exercises `executeBantooAction` directly and asserts the returned
  `error` string is not present anywhere in the FR message catalog.

### 5. Mixed scenario: French UI, English input ("Add Musa as a customer in Garoua")

**FAIL — confirmed root cause.** All *labels* (suggested action, plan steps, warnings) come from
`resolve.ts`'s locale-agnostic codes and render correctly in French regardless of input language —
that part of the pipeline was already correctly designed to be locale-driven, not input-driven.
However, the AI-generated `proposal.summary` line is not: `lib/ai/extract.ts`'s prompt says to write
it "in the user's language," and nothing tells the model (or even lets the caller tell the model)
what the UI's actual locale is. Given an English input, a real model following this prompt would
write the summary in English even inside a French UI session — the response language tracks the
*input* language, not the UI language, which is exactly the failure mode the task's core rule warns
against. Demonstrated directly in `ledger/lib/ai/qa-swarm-09-language-consistency.test.ts`.

### 6. Reverse: English UI, French input ("Ajouter Musa comme client à Garoua")

**FAIL, same root cause, mirrored.** By the identical mechanism as scenario 5, a French input would
produce a French `summary` even inside an English UI. `command-parse.ts`'s rule-based fallback
parser is bilingual by design (its regexes match English *or* French phrasing) and is *not* affected
— but it also never sets a `summary` at all (`fallback.ts` always sets `summary: null` for every rule
branch), so this specific leak only manifests when the AI path actually runs.

### 7. AI-generated `reasonSummary`/summary text — prompt instruction check

**Quoted, from `lib/ai/extract.ts`'s `buildSystemPrompt()`:**

> "Always include "action", "confidence" (0..1), "currency" (default "XAF"), and "summary" (a short
> human sentence describing the action **in the user's language**)."

This is the entire instruction governing the summary's language. It is unambiguous, but
unambiguously wrong for the stated requirement: it explicitly ties the summary's language to the
*user's* (input) language, with **zero mention** of the UI/display locale anywhere in the ~70-line
prompt. `ExtractInput` (the only way to parameterize `extractBantooAction`) has exactly two fields —
`text`/`images`/`today` — no `locale`. `app/api/bantoo/extract/route.ts`, the only production caller,
never reads `NEXT_LOCALE` or any other locale signal before calling `extractBantooAction`. **Flagged
as the primary, confirmed root cause for scenarios 5/6.**

---

## Root causes & proposed fixes

### Root cause #1 — `app/actions/bantoo.ts` (`executeBantooAction`) is entirely locale-blind

**File:** `app/actions/bantoo.ts` (read-only for this lane; not modified).

Every `BantooExecuteResult.error` and `.message` string returned by `executeBantooAction` is a raw
English literal (e.g. `"That contact was not found."`, `"Enter the product name."`,
`"${updated.name} was updated."`, `"${found.name} owes ${formatted} ${cur}."`, `"This action is not
available yet."`). None of these go through `next-intl`; the file doesn't import it at all.

**Why it matters more than it looks:** `BantooCommand.tsx`'s `successMessage()` does:

```
if (success.message) return success.message;   // always wins when set
```

`execute()` sets `.message` for `edit_customer`, `add_customer_note`, `customer_balance`,
`add_supplier_note`... (etc.), so the already-correct FR translations for
`command.successCustomerUpdated` / `command.successNoteAdded` are permanently dead code — they can
never be reached for a normal save, in either locale, because the server-provided English string is
always preferred.

**Proposed fix:**
1. Give `executeBantooAction` access to the request locale (via `next-intl/server`'s `getLocale()` +
   `getTranslations("command")`, callable from a server action the same way `cookies()` already is
   in `app/actions/locale.ts`).
2. Replace hardcoded strings with either (a) direct server-side `t()` calls producing the final
   string, or (b) — preferred, more consistent with the rest of the codebase's code+params pattern —
   return `{ errorCode, params }` / `{ messageCode, params }` and let the client's existing
   `warningText()`-style `t(`warnings.${code}`)` machinery render it. Most needed keys
   (`missingPhone`, `missingWhatsapp`, `missingEmail`, `notYetAvailable`, `enter*`, `choose*`,
   `no*Account`, etc.) **already exist** in both catalogs; only the plumbing from `execute()` is
   missing.
3. Remove (or gate) the `if (success.message) return success.message;` shortcut in
   `BantooCommand.tsx`'s `successMessage()` so the correct `t()` fallbacks are actually reachable
   once the server stops sending prose.

### Root cause #2 — `lib/ai/extract.ts`'s prompt ties `summary`'s language to the input, not the UI locale

**File:** `lib/ai/extract.ts` (read-only for this lane; not modified).

**Proposed fix:**
1. Add a `locale: "en" | "fr"` field to `ExtractInput`.
2. In `app/api/bantoo/extract/route.ts`, resolve the locale the same way `i18n/request.ts` does
   (`NEXT_LOCALE` cookie → `Accept-Language` → `routing.defaultLocale`) and pass it through to
   `extractBantooAction()`.
3. In `buildSystemPrompt()`, replace "in the user's language" with an explicit, unambiguous
   instruction naming the resolved locale, e.g.: `Write "summary" in ${locale === "fr" ? "French" :
   "English"}, regardless of what language the user's own message is written in — the summary must
   match the app's display language, not the input language.`

---

## Regression tests added

| File | What it locks down |
|---|---|
| `ledger/lib/bantoo/qa-swarm-09-language-consistency.test.ts` | (1) Every plan-step code for a full compound `create_customer` (Atlas Agro Trading Ltd — city/phone/tax ID/payment terms/credit limit/company name/discount/note/post-action) has a real EN **and** FR translation, closing the gap `warnings-i18n.test.ts` left in `PLAN_STEP_CODES`. (2) The Golu/Golu-Transport/Ngoundéré duplicate scenario produces only codes + raw data, never prose, and the 4 duplicate-block catalog keys exist in both locales. (3) `notYetAvailable` fires for an Archive-Musa-style unsupported action and is byte-identical between `command.warnings.notYetAvailable` and `command.notYetAvailable` in both locales. (4) `missingPhone` fires correctly, pre-flight, for a Call-Musa-with-no-phone scenario. |
| `ledger/app/actions/qa-swarm-09-language-consistency.test.ts` | Proves, with exact-string assertions against the real `executeBantooAction`, that: the `contact_customer`/no-phone error, the `edit_customer`/`add_customer_note`/`customer_balance` success messages, the `unsupported_customer_action` fallback error, and a generic validation error (`add_inventory_item` with no name) are all hardcoded English literals that do not appear anywhere in the FR message catalog. |
| `ledger/lib/ai/qa-swarm-09-language-consistency.test.ts` | Proves `ExtractInput` has no `locale` field, proves the system prompt sent to the AI provider contains "in the user's language" and none of the UI-locale-aware phrasings a fix would need, and demonstrates the English-input → English-summary passthrough directly against the real `extractBantooAction`. |

**All 13 tests pass today** (they document current — buggy, in 2 of 3 files' cases — behavior with
precise assertions); once Root causes #1/#2 are fixed, the assertions that currently pin the
hardcoded-English/no-locale-field behavior will need to be updated to assert the corrected,
locale-aware behavior instead (each test's comment block explains exactly what the corrected
assertion should look like).
