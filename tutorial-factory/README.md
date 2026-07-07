# Tutorial Factory

A small production-management dashboard for scaling BantooBooks' tutorial
content system from today's 20 tutorials up to a planned 150+.

This is **not** the content generator (that's `generator/` — see
`generator/README.md`). The Tutorial Factory doesn't create any tutorial
copy, images, video, or scripts. It only *tracks* what already exists on
disk and helps a human decide what to produce next and whether anything is
missing. Nothing in this folder ever writes into `tutorials/`, `generator/`,
or `generated/tutorials/` — it only reads them.

## Why this exists

At 5 tutorials, you can just look at the `generated/tutorials/` folder and
eyeball what's there. At 150+ tutorials, across content-generation
completeness, Playwright verification, and multi-stage real-world
production (recording → editing → uploading → publishing on 3+ channels),
nobody can hold that in their head. The Tutorial Factory answers three
questions at a glance, at any scale:

1. **What tutorials exist, and what state is each one in?** →
   `tutorial-index.json`
2. **What's the overall picture — how much is done, how much is left?** →
   `dashboard.md`
3. **For one specific tutorial, exactly what's left to do?** →
   `missing-assets.md` and `checklists/<tutorial_id>.md`

## How the pieces fit together

```
tutorials/*.md              (source of truth: what tutorials exist)
generated/tutorials/*/*     (source of truth: what content has been generated)
automation/tutorials/*.spec.ts  (source of truth: what's been Playwright-verified)
checklists/<id>.md (existing ones)  (source of truth: has "Guidde recorded" really been ticked)
        │
        │  read by
        ▼
build-index.js  ──────────▶  tutorial-index.json   (the master list — one JSON
                                                       entry per tutorial, every
                                                       field derived from a real
                                                       file, never hand-typed)
        │
        │  read by
        ▼
build-dashboard.js  ──────▶  dashboard.md           (production statistics +
                              missing-assets.md        one status row per tutorial)
                                                      (per-tutorial "what's missing")

build-checklists.js  ─────▶  checklists/<id>.md     (9-item publishing checklist
                                                       per tutorial — created once,
                                                       then hand-maintained)

build-recording-queue.js ─▶  recording-queue.md     (per-tutorial recording status
                                                       for the human+Guidde workflow —
                                                       see RECORDING.md/SOP)

roadmap.md                                          (hand-written backlog of
                                                       tutorials #006+ toward 150+ —
                                                       never machine-generated)
```

`tutorial-index.json` is the single source of truth for everything
downstream. `dashboard.md`, `missing-assets.md`, `recording-queue.md`, and
each `checklists/*.md` file (on its first creation) are pure renderings of
that index — if a number in `dashboard.md` looks wrong, the fix is always
in `build-index.js` or `build-dashboard.js`, never a hand-edit to the `.md`
output.

## How to regenerate

```bash
npm run build:tutorial-index    # rescans the filesystem -> tutorial-index.json
npm run build:dashboard         # tutorial-index.json -> dashboard.md + missing-assets.md
npm run build:checklists        # tutorial-index.json -> checklists/<id>.md (only creates NEW ones)
npm run build:recording-queue   # tutorial-index.json -> recording-queue.md

# or all four in one go:
npm run build:tutorial-factory
```

Run these after adding a new tutorial to `tutorials/`, after regenerating
`generated/tutorials/` (`npm run generate:tutorials`), or after adding a
new Playwright spec — anytime the real filesystem state changes in a way
that should be reflected in the dashboard.

**`build:checklists` is safe to re-run at any time** — it only *creates* a
checklist file for a tutorial that doesn't have one yet. It never
overwrites an existing checklist, so any boxes a production team member has
already ticked by hand are never lost or reset.

## What this tracks vs. what it does NOT track

This is the single most important thing to understand about the Tutorial
Factory, so it's worth saying plainly:

- **Content-generation completeness** (help article, FAQ, YouTube package,
  LinkedIn/Facebook/Shorts/Email copy, SEO package, the recording checklist
  and narration script, and a live-tested Playwright spec) is tracked
  **accurately and automatically**, straight from the filesystem. All 20
  tutorials today have complete generator content assets; 5 of them
  (`create-a-customer`, `create-a-supplier`, `create-a-sales-invoice`,
  `record-customer-receipt`, `add-inventory-item`) also have a Playwright
  spec and are therefore fully "Content Complete" — the other 15 are
  "Drafted" until a Playwright spec is written for each (see
  `recording-queue.md`).
- **Real-world video production** (an actual video has been recorded,
  edited, uploaded to YouTube, published on the website, and published in
  the Help Center) has almost no file-based signal in this repo — no video
  has ever actually been produced for any tutorial here. The one exception:
  `recording_status` now reads the real, hand-ticked "Guidde recorded"
  checkbox in that tutorial's `checklists/<tutorial_id>.md` (tick it after a
  real recording happens, then re-run `npm run build:tutorial-index`).
  `editing_status`, `youtube_status`, `website_status`, and
  `help_center_status` are still always written as `"Not started"` until a
  real human production process updates them (their checklist boxes exist
  too, but only `recording_status` is wired back into the index today).
  **Do not read "Content Complete" in the dashboard as "this tutorial is
  published" — it specifically means "the marketing/docs copy is drafted
  and ready for a human to record
  against."**

## Recording a tutorial — two workflows

There are two different recording workflows in this project, covering the
same 20 tutorials from two different angles — see
[`recording-queue.md`](./recording-queue.md) for the real, up-to-date
per-tutorial status (which have a Playwright script yet, which don't, and
any prerequisite data each one needs):

- **Human runs Guidde, Playwright just performs the on-screen actions.**
  `npm run record:guidde -- <tutorial_id>` — a guided helper for a
  non-technical operator. See
  [`GUIDDE_RECORDING_SOP.md`](./GUIDDE_RECORDING_SOP.md) for the full,
  copy-paste-friendly procedure.
- **Playwright records its own video, no Guidde involved.**
  `npm run record:video -- <tutorial_id>` — a fully-automated pipeline that
  assembles a video package (raw screen capture, trace, narration script,
  YouTube metadata, and a manual-steps checklist) at
  `recordings/<tutorial_id>/`. See [`RECORDING.md`](./RECORDING.md) for the
  full explanation — including why neither workflow can drive Guidde
  itself, and exactly what a human still needs to do afterward to get a
  finished, publishable video either way.

Both require the tutorial to already have a live-tested Playwright spec
under `automation/tutorials/` — 5 of the 20 tutorials do today; the other
15 are tracked as blocked on that in `recording-queue.md`.

## For a non-technical production manager

You don't need to read or run any code to use this. Here's what to do:

**To check overall progress across all tutorials:**
Open `tutorial-factory/dashboard.md` in any text editor or in GitHub. The
top section gives you the headline numbers (how many tutorials, how many
have their content ready, how many have actually been recorded/published).
Below that is a table — one row per tutorial, one column per thing that
needs to happen. A green checkmark (✅) means that thing is done; a red
circle (🔴) means it isn't; a yellow circle (🟡) means it's partially done.

**To see exactly what's left for one specific tutorial:**
Open `tutorial-factory/missing-assets.md` and find that tutorial's section
— it lists in plain English exactly what's missing. For the full,
step-by-step publishing checklist for that tutorial (Playwright verified,
recorded, edited, uploaded, etc.), open its file in
`tutorial-factory/checklists/` — for example
`tutorial-factory/checklists/create-a-customer.md` — and tick boxes off as
each step actually happens.

**To see what tutorial should be made next:**
Open `tutorial-factory/roadmap.md`. It's a plain list, organized by feature
area (Customers, Inventory, Reports, etc.), of tutorial ideas that make
sense to build next, grounded in features that already exist in the app.
This file is meant to be edited directly — cross an idea off, reorder it,
add a new one — whenever priorities change.

**When a new tutorial gets fully drafted in `/tutorials`:**
Ask whoever manages the technical side to run these two commands from the
project's root folder:

```bash
npm run build:tutorial-index
npm run build:dashboard
```

That's it — `dashboard.md` and `missing-assets.md` will now include the new
tutorial automatically. Nothing needs to be typed in by hand.

## Files in this folder

| File | What it is | How it's produced |
|---|---|---|
| `build-index.js` | Script | Hand-written; scans the filesystem |
| `tutorial-index.json` | Generated data | `npm run build:tutorial-index` |
| `build-dashboard.js` | Script | Hand-written; reads `tutorial-index.json` |
| `dashboard.md` | Generated report | `npm run build:dashboard` |
| `missing-assets.md` | Generated report | `npm run build:dashboard` |
| `build-checklists.js` | Script | Hand-written; reads `tutorial-index.json` |
| `checklists/<tutorial_id>.md` | Generated once, then hand-maintained | `npm run build:checklists` (first run only; re-runs skip existing files) |
| `roadmap.md` | Hand-written backlog | Edited directly, never generated |
| `record-tutorial.js` | Script | Hand-written; runs a Playwright recording and assembles `recordings/<tutorial_id>/` |
| `record-guidde.js` | Script | Hand-written; guided helper for the human+Guidde workflow |
| `lib/tutorial-lookup.js` | Script | Hand-written; shared lookup used by both recording scripts above |
| `recording-queue.md` | Generated report | `npm run build:recording-queue` |
| `RECORDING.md` | Documentation | Hand-written; see for the recording pipeline's full design/scope |
| `GUIDDE_RECORDING_SOP.md` | Documentation | Hand-written; step-by-step procedure for a non-technical operator |
| `README.md` | This file | Hand-written |

## A note on scaling to 150+

Nothing about `build-index.js`/`build-dashboard.js`/`build-checklists.js`
is hardcoded to "5 tutorials" — they all work by scanning whatever's
actually in `tutorials/*.md` at the time they run, so they'll work
unmodified at 150+ tutorials exactly as they do at 5. The only thing that
needs to scale is the human process of authoring each new
`tutorials/NNN-slug.md` file and its Playwright spec — see
`dashboard.md`'s "Estimated remaining" note for a rough, transparent
heuristic on that front, and `roadmap.md` for what to build next.
