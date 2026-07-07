# BantooBooks Tutorial Automation Framework

Playwright scripts that replay each tutorial in [`/tutorials`](../tutorials)
against the real BantooBooks app UI — slowly, with smooth mouse movement,
highlighted buttons, and deliberate pauses — so a screen recorder (e.g.
[Guidde](https://www.guidde.com)) can capture a clean walkthrough video
without a human clicking through it live.

This is a *recording tool*, not a CI test suite: it's meant to be run one
script at a time, on purpose, while you're recording. It reuses the same
tutorial content (`test_data`, `step_by_step_actions`, `demo_company`) that
the [generator](../generator) turns into docs and marketing copy, so the
video and the written tutorial never drift apart — see
[`helpers/loadTutorial.ts`](helpers/loadTutorial.ts), which parses
`tutorials/*.md` with the exact same hand-rolled frontmatter parser the
generator uses (`generator/lib/frontmatter.js`).

## ⚠️ Read this before running anything

- **The only real running instance of BantooBooks is
  `https://books.bantoobooks.com`** (production, Neon-backed). These scripts
  default to `http://localhost:3000` specifically so nobody points them at
  production by accident.
- **Every script logs into the demo organization only**
  (`central.demo@bantoobooks.com`, org "Central Distribution Cameroon
  SARL"). Never point `BANTOO_BASE_URL` at production and log in as a real
  customer's account.
- If you do point this at production on purpose (to actually record a
  video), you are creating real rows in the shared demo org. That's exactly
  what the demo org is for — just don't run a script five times in a row
  "to see what happens"; see **Idempotency** below for why that's safe but
  still not free of side effects.

## One-time setup

From the repo root:

```bash
npm install                      # installs @playwright/test etc. (see root package.json)
npx playwright install chromium  # downloads the Chromium browser Playwright drives
```

You only need to do this once per machine (or once per fresh clone/CI
runner).

## Recording a tutorial video

1. **Open Guidde (or your recorder of choice) and click Record.** Point it
   at the browser window that's about to open — Playwright launches a real,
   visible (headed) Chromium window, not a hidden headless one.
2. **Run one tutorial script.** From the repo root:

   ```bash
   npx playwright test --config=automation/playwright.config.ts automation/tutorials/create-a-customer.spec.ts
   ```

   or, using the npm script wrapper (same thing, just shorter):

   ```bash
   npm run record:tutorial -- automation/tutorials/create-a-customer.spec.ts
   ```

3. **Let it drive itself.** The script will:
   - Open BantooBooks and log in as the demo org automatically.
   - Navigate to the right page, fill in the exact fields from that
     tutorial's `test_data`, and click through every step from its
     `step_by_step_actions` — highlighting each field/button before
     interacting with it, moving the (visible, orange) cursor dot smoothly
     across the screen instead of jumping, and pausing for a couple of
     seconds after each meaningful action.
   - Finish on the tutorial's natural "completed" screen (e.g. the new
     customer's profile page, or the new invoice's detail page) and hold
     there for a few seconds — a good moment to stop the recording.
4. **Stop Guidde's recording** once the script's browser window closes (or
   once it settles on the final screen — the script pauses there for ~3
   seconds specifically so you have time to react).
5. **Repeat for each tutorial** you want a video for:

   ```text
   automation/tutorials/create-a-customer.spec.ts
   automation/tutorials/create-a-supplier.spec.ts
   automation/tutorials/create-a-sales-invoice.spec.ts
   automation/tutorials/record-customer-receipt.spec.ts
   automation/tutorials/add-inventory-item.spec.ts
   ```

You do **not** need to run all five at once, and the config forces them to
run one at a time even if you pass a whole folder (`fullyParallel: false`,
`workers: 1`) — recording two browser windows performing two tutorials at
once would just be confusing footage.

## Two other ways to run this: a guided version, and a fully-automated one

Everything above (`record:tutorial`) assumes a human has Guidde (or another
screen recorder) running alongside the script, and gives no extra guidance
beyond "here's the command." Two other npm scripts cover the same ground
differently:

- **`npm run record:guidde -- <tutorial_id>`** — the same human+Guidde
  workflow as `record:tutorial`, but guided: validates the tutorial,
  prints this tutorial's exact file paths and SOP steps, waits for you to
  confirm you clicked Record in Guidde, then runs the spec. Written for a
  non-technical operator — see
  [`../tutorial-factory/GUIDDE_RECORDING_SOP.md`](../tutorial-factory/GUIDDE_RECORDING_SOP.md).
- **`npm run record:video -- <tutorial_id>`** — skips Guidde entirely and
  lets Playwright record its own video/trace of the run, assembling the
  result into a package with the tutorial's narration script and YouTube
  metadata alongside it. See
  [`../tutorial-factory/RECORDING.md`](../tutorial-factory/RECORDING.md)
  for what that produces and, importantly, what it still can't do (add
  narration audio, add Guidde-style annotations, or publish anything —
  those remain manual).

All three run the exact same underlying spec with the exact same safety
pattern; they differ only in whether recording is your job (Guidde, via
`record:tutorial` or `record:guidde`) or Playwright's (`video`/`trace` in a
dedicated config, via `record:video`) — see
[`../tutorial-factory/RECORDING.md`](../tutorial-factory/RECORDING.md)'s
"Three recording commands, three different jobs" section for the full
comparison.

## Pointing it at local vs. production

Everything is controlled by env vars, read once in
[`helpers/config.ts`](helpers/config.ts):

| Env var | Default | Purpose |
|---|---|---|
| `BANTOO_BASE_URL` | `http://localhost:3000` | Which BantooBooks instance to drive. |
| `BANTOO_DEMO_EMAIL` | `central.demo@bantoobooks.com` | Demo org login email. |
| `BANTOO_DEMO_PASSWORD` | `DemoBooks2025!` | Demo org login password. |

To record against a local dev server (recommended for testing a script
before you actually roll camera):

```bash
BANTOO_BASE_URL=http://localhost:3000 npm run record:tutorial -- automation/tutorials/create-a-customer.spec.ts
```

To record for real, against the production app (once you're actually ready
to make a video — see the warning at the top of this file):

```bash
BANTOO_BASE_URL=https://books.bantoobooks.com npm run record:tutorial -- automation/tutorials/create-a-customer.spec.ts
```

The literal demo credentials above are checked into
[`helpers/config.ts`](helpers/config.ts) as defaults on purpose — they're a
fictional practice account, not a real customer's, and they're already
documented openly elsewhere in this project. If that password ever rotates,
override it with `BANTOO_DEMO_PASSWORD` rather than editing the file.

## Idempotency — is it safe to re-run a script?

Yes. Every script is written so a re-run (e.g. because a take got messed up
and you want to record again) never fails on "this already exists" and
never needs any manual cleanup first:

| Spec | Strategy |
|---|---|
| `create-a-customer.spec.ts`, `create-a-supplier.spec.ts` | Submits the exact `test_data.name`. If BantooBooks' own "Possible existing contact found" panel appears (because a previous run already created that contact), the script clicks **"Use existing contact"** instead of "Create new anyway" — so re-runs never pile up duplicate demo contacts, and both the fresh-create and already-exists paths land on the same finishing screen (the contact's profile page). |
| `create-a-sales-invoice.spec.ts` | Invoices have no duplicate-detection UI. A short `HHMMSS` run-time suffix is appended to the **Reference** field only (e.g. `PO-2031-143022`) so repeated runs are visually distinguishable in the Sales Invoices list rather than looking like accidental re-submits. Every other field is exactly what the tutorial narrates. |
| `record-customer-receipt.spec.ts` | Same reasoning as invoices — a run-time suffix is appended to the **Reference no.** field only (e.g. `TRF-88214-143022`). |
| `add-inventory-item.spec.ts` | Inventory items have no duplicate-detection UI and no unique constraint on SKU, but two runs with an identical Code would look like a confusing accidental duplicate in the list. A run-time suffix is appended to the **Code** field only (e.g. `PC-NIDO900-143022`); the Name and every other field stay exactly as narrated, so repeated runs show the same product name with different SKUs — expected and harmless for a demo org used for repeated recordings. |

None of this data is ever deleted automatically — the demo org will slowly
accumulate rows from every recording session. That's expected; it's a demo
org, not production data anyone relies on. If it ever gets too cluttered,
that's a separate "reset the demo org" job, not something these scripts do
themselves.

## Helper library (`automation/helpers/`)

Each helper is small, independently reusable, and does exactly one thing:

- **`login(page, opts?)`** — logs in as the demo org and waits for the
  dashboard to load.
- **`pause(page, seconds?)`** — a deliberate pause (defaults to ~2.5s) for
  the recording to breathe.
- **`highlight(page, locator, ms?)`** / **`unhighlight(page, locator)`** —
  draws a temporary orange glow around an element so a viewer sees what's
  about to happen before it happens.
- **`slowClick(page, locator)`** — scrolls the element smoothly into view,
  highlights it, glides the (visible) cursor over to it, then clicks. Never
  an instant jump-and-click.
- **`slowSelect(page, locator, { label } | { value })`** — the same
  treatment as `slowClick`, but for `<select>` dropdowns (every tutorial
  leans heavily on these: customer, bank account, item, payment method...).
  Lives in `slowClick.ts` next to `slowClick` since it's the same
  highlight-then-interact pattern, just for a different element type.
- **`slowType(page, locator, text, opts?)`** — highlights the field, then
  types character-by-character with a small per-character delay
  (`locator.pressSequentially`), instead of an instant `.fill()`.
- **`waitForAnimation(page, bufferMs?)`** — waits for network-idle, then a
  small fixed buffer, after a navigation or client-side transition.
- **`loadTutorial(tutorialId)`** / **`loadAllTutorials()`** — reads and
  parses `tutorials/*.md` frontmatter (via `generator/lib/frontmatter.js`,
  reused rather than re-implemented) so a spec's `test_data` and
  `step_by_step_actions` always match the tutorial's source of truth.
- **`config.ts`** — `BANTOO_BASE_URL`, demo credentials, and the shared
  timing/motion constants (`PACE`) everything above reads from.
- **`cursor.ts`** *(internal, not re-exported from `index.ts`)* — see the
  "Why a fake cursor?" section below.
- **`index.ts`** — barrel file; specs `import { ... } from "../helpers"`
  rather than reaching into individual files.

### Why a fake cursor?

A subtle but important detail: Playwright's `page.mouse.move()` dispatches
synthetic input events straight to the browser's renderer over CDP — it
does **not** move an OS-level mouse cursor. That means even if you animate
`mouse.move` across many steps, a screen recorder (which only ever sees
actual pixels) sees nothing move at all. To make the "smooth mouse
movement" requirement actually visible on camera, `helpers/cursor.ts`
injects a small fake cursor `<div>` into the page and animates its CSS
`left`/`top` in lockstep with the real (invisible) synthetic mouse moves.
The real moves still matter functionally (they trigger `:hover` styles,
etc.); the dot is purely cosmetic for the recording.

## Setup details (`playwright.config.ts` / `tsconfig.json`)

- `automation/playwright.config.ts` is a separate config from anything
  under `ledger/` — headed (not headless, since headless can't be
  screen-recorded), one worker, no parallelism, no auto-retries, a
  generous 5-minute per-test timeout (these are slow on purpose), and
  `baseURL` wired to `BANTOO_BASE_URL`.
- `automation/tsconfig.json` is isolated from `ledger/tsconfig.json` (a
  completely separate Next.js project) and from the repo root. It enables
  `allowJs` specifically so `helpers/loadTutorial.ts` can import
  `generator/lib/frontmatter.js` (plain CommonJS, untyped) without a second
  parser or a hand-written `.d.ts`.
- `@playwright/test`, `@types/node`, and `typescript` are dev dependencies
  of the **root** `package.json` (the same one that runs the tutorial
  generator) — `automation/`, like `tutorials/` and `generator/`, is a
  root-level concern, not part of the `ledger/` Next.js app.

## Lessons from live runs

`npx playwright test --list` and `tsc --noEmit` catch syntax and type errors,
but not locator ambiguity — that only shows up against the real, fully
server-rendered app. Live runs against production have found and fixed one
real bug so far:

- **`add-inventory-item.spec.ts`'s dashboard navigation.** The sidebar
  (`components/Sidebar.tsx`) has a nav item whose accessible name is
  "▦ Inventory" (icon + label) pointing at the same `/inventory-items`
  route as the dashboard's "Inventory" category pill. Playwright's
  `getByRole` name matching is substring-by-default, so
  `getByRole("link", { name: "Inventory" })` matched *both* and threw a
  strict-mode violation. Fixed by adding `exact: true`, which only matches
  the pill's exact accessible name. Worth keeping in mind for any future
  spec that clicks a dashboard link by a short, generic label — check
  whether the sidebar has a same-named (or same-name-as-substring) item
  first.

- **`slowType()` and native `<input type="date">` fields.** Typing an ISO
  date string like `"2026-08-05"` character-by-character (Playwright's
  `pressSequentially`) into a native date picker sends the literal `-`
  characters as keystrokes into a segmented year/month/day widget, which
  doesn't accept them as separators — the value ends up incomplete, and the
  browser's own validation blocks form submission with "Please enter a
  valid value. The field is incomplete or has an invalid date." (found via
  a live `create-a-sales-invoice` run, on the "Due date" field). Fixed
  generically in `helpers/slowType.ts`: it now detects `type="date"` (and
  `time`/`month`/`week`) inputs and uses `.fill()` for those instead of
  typing — there's no meaningful "smooth typing" simulation for a
  segmented widget anyway. Every other input type is unaffected and still
  types char-by-char.

- **`record-customer-receipt.spec.ts`'s finishing assertion.** The receipt
  detail page legitimately shows the customer's name in three separate
  places (the header paragraph, the "Accounts receivable — &lt;customer&gt;"
  category-details line, and again in the Transaction Journal row), so a
  plain `page.getByText(data.receivedFrom)` hit a strict-mode violation —
  the receipt itself had saved correctly, only the final check was
  ambiguous. Fixed by scoping to `.first()` (the header occurrence, found
  via a live run). A reminder that a page showing the same value in
  multiple places is common on detail/receipt-style screens — prefer role-
  or region-scoped locators (as the customer/supplier/invoice specs
  already do with `getByRole("heading", ...)`) wherever the page structure
  allows it, and fall back to `.first()`/`.nth()` when it doesn't.

## Verifying without actually running a browser

```bash
npx playwright test --config=automation/playwright.config.ts --list   # enumerates all 5 specs, no browser launched
npm run typecheck:automation                                           # tsc --noEmit over automation/
```

Both are safe to run anywhere, any time — no network access, no login, no
data created.
