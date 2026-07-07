# One-Click Recording Pipeline

This document explains `tutorial-factory/record-tutorial.js` — a script that
takes a single tutorial and produces a "video package" ready for a human to
finish (narrate, annotate, edit, and publish). It complements
`tutorial-factory/README.md` (which tracks *whether content/production has
happened*) without changing anything that file already does.

## Three recording commands, three different jobs

This project ended up with three similarly-named `npm run record:*`
commands, built at different points and for different reasons. They all
replay the same underlying `automation/tutorials/*.spec.ts` script — they
differ only in **who/what is doing the actual screen recording**:

| Command | Who records the screen | Playwright config used | When to use it |
|---|---|---|---|
| `npm run record:tutorial -- automation/tutorials/<id>.spec.ts` | **A human**, running Guidde (or any recorder) manually alongside | Base (`playwright.config.ts`) — video/trace off | The original, simplest workflow: you already have Guidde open and just want the browser to drive itself while you record. No guidance printed, no prompts — just runs the spec. See `automation/README.md`. |
| `npm run record:guidde -- <tutorial_id>` | **A human**, running Guidde — same as above | Base (`playwright.config.ts`) — video/trace off | The same human+Guidde workflow, but guided: validates the tutorial, prints the exact SOP steps and file paths for *this* tutorial, waits for you to confirm you clicked Record, then runs the spec. See `GUIDDE_RECORDING_SOP.md`. This is the recommended entry point for a non-technical operator — `record:tutorial` still works and is unchanged, this is a friendlier wrapper around the same idea. |
| `npm run record:video -- <tutorial_id>` | **Playwright itself** — no Guidde involved at all | Recording (`playwright.recording.config.ts`) — video/trace **on** | The fully-automated pipeline documented in the rest of this file: no human needs to be present at all. Produces its own `raw-recording.webm` + `trace.zip` package. |

**Why `record:guidde` doesn't turn Playwright's own recording on too:**
Guidde is already capturing the screen in this workflow, so a second,
simultaneous Playwright-side video/trace recording of the exact same pixels
would be a pure waste (extra disk, extra encode time, and a second file
nobody would ever actually use — the published video will always be edited
from Guidde's draft, not from a redundant Playwright capture sitting next to
it). `record:guidde` and `record:tutorial` therefore both intentionally use
the lightweight **base** config; only `record:video` — the one workflow
where Playwright's recording *is* the deliverable — uses the **recording**
config.

## The honest starting point: Guidde can't be triggered from a script

Before building anything, this pipeline's design started with one question:
does Guidde (the screen-recording tool referenced throughout
`tutorials/README.md` and every tutorial's generated `guidde.md`) have a
public API or CLI that can start/stop a recording session programmatically?

**No — not for the capture step itself.** Guidde's own marketing and help
center material is consistent across multiple pages
([guidde.com/knowledge-hub](https://www.guidde.com/knowledge-hub/ai-guide-generator-complete-guide-2026),
[Broadcast SDK](https://www.guidde.com/landing-for-customers),
[Broadcast API help article](https://help.guidde.com/en/articles/9736604-broadcast-api)):

- Its actual capture mechanism ("Magic Capture") is a **browser extension or
  desktop app that records a human performing a task naturally** — every
  description of it says things like "no recording buttons, no retakes" and
  "activate the capture tool and perform the task," which only makes sense
  as an interactive, human-present flow.
- The **API it does document publicly (the "Broadcast API"/"Broadcast SDK")
  is scoped to managing and distributing guides that already exist** —
  embedding a guide player in another app, triggering guide *creation
  records* from other systems/events, and pulling analytics. Nowhere in any
  of Guidde's public docs is there an endpoint to start a new Magic Capture
  session on a remote/headless machine without a human clicking "record" in
  the extension.
- Guidde does have deeper Enterprise-tier API documentation that isn't
  publicly published (it's gated behind an enterprise account/support
  contact), so it's possible there's more there — but nothing in Guidde's
  own public marketing suggests that "more" includes headless capture
  triggering, and it would be dishonest to assume it does just because a
  door is closed rather than confirmed absent.

So: **this pipeline does not drive Guidde.** It doesn't fake an integration
that doesn't exist.

## What this pipeline actually automates instead

Playwright's own video/trace recording of the exact same scripted
walkthrough already used for this session's live verification runs — run
headed, at human pace, with the fake-cursor/highlight-before-click system in
`automation/helpers/` that was specifically built to look clean on camera —
**is** a real, repeatable, automatable screen capture mechanism. It's not a
Guidde recording, but it's a genuine watchable video of the tutorial being
performed against the real app. That's what this pipeline produces.

## What it does, step by step

Running `npm run record:video -- <tutorial_id>`:

1. **Validates** the tutorial exists in `tutorial-factory/tutorial-index.json`
   and that it has a live-tested Playwright spec
   (`automation/tutorials/<tutorial_id>.spec.ts`).
2. **Runs that spec** with
   [`automation/playwright.recording.config.ts`](../automation/playwright.recording.config.ts)
   — a dedicated config that extends the base `automation/playwright.config.ts`
   (same headed Chromium, same pacing, same `BANTOO_BASE_URL`/demo-login
   safety pattern) but turns `video: "on"` and `trace: "on"`, which the base
   config deliberately leaves off so quick verification runs stay
   lightweight.
3. **Assembles a package** at `recordings/<tutorial_id>/` containing:
   - `raw-recording.webm` — the video capture (no audio).
   - `trace.zip` — the Playwright trace of the same run (`npx playwright
     show-trace trace.zip` to step through it screenshot-by-screenshot;
     useful for re-editing reference or debugging a bad take).
   - `synthesia.md`, `youtube.md`, `guidde.md` — copied straight from that
     tutorial's already-generated assets (`generated/tutorials/<tutorial_id>/`),
     so the narration script, YouTube metadata, and annotation checklist
     travel with the video rather than needing to be found separately.
   - `recording-manifest.json` — machine-readable summary of the run (base
     URL, spec used, exit code, file list, remaining manual steps).
   - `README.md` — the same information, rendered for a human.
4. **Prints a summary** to the terminal: what was produced, file sizes, and
   the manual steps still needed.

Re-running the same `tutorial_id` overwrites its `recordings/<tutorial_id>/`
package — recording a new take is always safe, same as re-running any
`automation/tutorials/*.spec.ts` script is already idempotent per
`automation/README.md`.

## Running it

```bash
# Against a local dev server (recommended first, before rolling "real" camera):
BANTOO_BASE_URL=http://localhost:3000 npm run record:video -- create-a-customer

# Against the real app, for a take you actually intend to keep:
BANTOO_BASE_URL=https://books.bantoobooks.com npm run record:video -- create-a-customer
```

Same env vars as the rest of `automation/` —`BANTOO_BASE_URL`,
`BANTOO_DEMO_EMAIL`, `BANTOO_DEMO_PASSWORD` — see `automation/README.md` for
the full safety notes (production-only instance, demo-org-only login,
idempotent re-runs). This pipeline reuses that exact same safety pattern; it
doesn't introduce any new one.

A headed Chromium window will actually open on screen while this runs — that
window closing (or holding on the final screen for a few seconds) is your
cue that the capture is finished.

## What a human still has to do afterward

The raw capture is **not** a finished, publishable video. Specifically, a
human still needs to:

1. **Add voiceover narration.** `raw-recording.webm` has no audio track at
   all. Record `synthesia.md`'s script (through Synthesia, another TTS tool,
   or a real voice actor) and mix it onto the video in an editor.
2. **Optionally add call-out annotations.** The fake-cursor/highlight system
   already shows what's being clicked on screen, but if the team wants
   Guidde-style zoom/circle/box call-outs, either:
   - import `raw-recording.webm` into Guidde and annotate it there (Guidde
     can enhance/annotate an already-recorded video — it just can't have
     triggered the capture itself), or
   - add the same call-outs manually in any video editor, using `guidde.md`'s
     per-step "Highlight/zoom" notes as the annotation guide.
3. **Trim dead air.** The spec deliberately holds a few seconds on the first
   and last screen specifically to make this trim point obvious.
4. **Export and upload**, using `youtube.md`'s title/description/chapters/
   hashtags.
5. **Update production status by hand.** Check "Guidde recorded" in
   `tutorial-factory/checklists/<tutorial_id>.md` once a real recording
   exists — that's the one production field with a real file-based signal
   (`recording_status` reads it back on the next `npm run
   build:tutorial-index`). The other checklist boxes (editing, YouTube
   upload, website, Help Center) aren't wired back into the dashboard yet;
   see `tutorial-factory/README.md`.

Every package's own `README.md` restates this same list next to the actual
files it applies to, so nobody has to come back to this document mid-edit.

## Files

| File | What it is |
|---|---|
| `automation/playwright.recording.config.ts` | Dedicated Playwright config: extends the base config, turns on `video`/`trace`. |
| `tutorial-factory/record-tutorial.js` | This pipeline's script (`record:video`). |
| `tutorial-factory/record-guidde.js` | The human+Guidde guided helper script (`record:guidde`) — see `GUIDDE_RECORDING_SOP.md`. |
| `tutorial-factory/lib/tutorial-lookup.js` | Shared "find this tutorial and its Playwright spec" lookup used by both scripts above. |
| `tutorial-factory/recording-queue.md` | Generated per-tutorial recording status table for the human+Guidde workflow. |
| `recordings/<tutorial_id>/` | One output package per tutorial, produced by `record-tutorial.js` (not committed source — see `.gitignore`). |

## Scope note

This is the recording/capture half of "publish-ready video." It does not
edit video, generate audio, or upload anywhere — those remain deliberately
manual steps, spelled out above and in every package's `README.md`, because
no tool available in this codebase can do them without a human's actual
voice or artistic/editing judgment.
