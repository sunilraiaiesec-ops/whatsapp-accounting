#!/usr/bin/env node
"use strict";

/**
 * Tutorial Factory — human-runs-Guidde recording helper.
 *
 * This is deliberately NOT an attempt to control Guidde from a script —
 * see `tutorial-factory/RECORDING.md` for why that's not possible (Guidde
 * has no public API to trigger a recording session headlessly; it's a
 * human-driven browser extension). This script instead supports the real
 * workflow: a human clicks Record in Guidde themselves, and this script
 * makes the "computer performs the tutorial's on-screen steps" half of
 * that workflow a single command, with clear guidance around it.
 *
 * What it does, step by step:
 *   1. Validates the tutorial_id exists and prints where to find its
 *      generated assets (Guidde checklist, Synthesia script, YouTube
 *      metadata) even before running anything.
 *   2. If there's no Playwright spec for this tutorial yet, says so
 *      plainly and exits — no crash, no stack trace, no confusing error.
 *   3. Prints a condensed version of GUIDDE_RECORDING_SOP.md, personalized
 *      with this tutorial's real file paths and the exact command about to
 *      run.
 *   4. Pauses on a simple "press Enter once you've clicked Record in
 *      Guidde" prompt — Guidde itself is never touched programmatically.
 *   5. Runs the matching Playwright spec against
 *      `automation/playwright.config.ts` — the plain BASE config, with
 *      video/trace left off on purpose. See the "Which Playwright config"
 *      section of RECORDING.md for the reasoning: Guidde is doing the
 *      recording this time, so a second simultaneous Playwright-side
 *      video/trace recording would just be a redundant, wasted duplicate
 *      of the exact same screen.
 *   6. Prints a reminder to stop the Guidde recording and finish up using
 *      synthesia.md/youtube.md/guidde.md, and how to mark the tutorial as
 *      recorded once it's really done.
 *
 * Usage:
 *   node tutorial-factory/record-guidde.js <tutorial_id>
 *   npm run record:guidde -- <tutorial_id>
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { spawnSync } = require("child_process");
const { ROOT, resolveTutorial } = require("./lib/tutorial-lookup");

const AUTOMATION_DIR = path.join(ROOT, "automation");
const BASE_CONFIG = path.join(AUTOMATION_DIR, "playwright.config.ts");
const GENERATED_DIR = path.join(ROOT, "generated", "tutorials");
const CHECKLISTS_DIR = path.join(__dirname, "checklists");

const BANTOO_BASE_URL = (process.env.BANTOO_BASE_URL || "http://localhost:3000").trim().replace(/\/+$/, "");
const DEMO_EMAIL = (process.env.BANTOO_DEMO_EMAIL || "central.demo@bantoobooks.com").trim();

function relOrMissing(absPath) {
  return fs.existsSync(absPath) ? path.relative(ROOT, absPath) : null;
}

function promptEnter(message) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(message, () => {
      rl.close();
      resolve();
    });
  });
}

async function main() {
  const tutorialId = process.argv[2];
  if (!tutorialId) {
    console.log(
      "\nUsage: node tutorial-factory/record-guidde.js <tutorial_id>\n" +
        "   or: npm run record:guidde -- <tutorial_id>\n\n" +
        "Example: npm run record:guidde -- create-a-customer\n\n" +
        "See tutorial-factory/recording-queue.md for the full list of tutorial_ids.\n",
    );
    process.exit(1);
  }

  const resolved = resolveTutorial(tutorialId);
  if (!resolved.ok && resolved.reason === "no-index") {
    console.log(
      "\ntutorial-factory/tutorial-index.json doesn't exist yet. Ask someone technical to run " +
        "`npm run build:tutorial-index` first, then try again.\n",
    );
    process.exit(1);
  }
  if (!resolved.ok && resolved.reason === "not-found") {
    console.log(
      `\n"${tutorialId}" isn't a known tutorial_id.\n\n` +
        `Known tutorial_ids: ${resolved.knownIds.join(", ")}\n\n` +
        "Check tutorial-factory/recording-queue.md for the full list with titles.\n",
    );
    process.exit(1);
  }

  const { entry, specPath } = resolved;

  // The one place this script "says so clearly and exits gracefully" per
  // this tutorial's own requirements — no thrown error, no stack trace,
  // just a plain explanation and a pointer to the manual alternative.
  if (!specPath) {
    console.log(`
This tutorial doesn't have an automated recording script yet.

  Tutorial:  ${entry.title} (${tutorialId})
  Status:    no automation/tutorials/${tutorialId}.spec.ts exists

That means this helper can't drive the on-screen actions for you — writing
that script is a separate, technical to-do (see recording-queue.md), not
something this command can do.

You can still record this tutorial by hand: open Guidde, click Record,
then click through the app yourself using this tutorial's own recording
checklist as your step-by-step script:

  ${relOrMissing(path.join(GENERATED_DIR, tutorialId, "guidde.md")) || "(guidde.md not generated for this tutorial)"}

Once a Playwright script exists for "${tutorialId}", re-run:

  npm run record:guidde -- ${tutorialId}
`);
    process.exit(1);
  }

  const guiddePath = relOrMissing(path.join(GENERATED_DIR, tutorialId, "guidde.md"));
  const synthesiaPath = relOrMissing(path.join(GENERATED_DIR, tutorialId, "synthesia.md"));
  const youtubePath = relOrMissing(path.join(GENERATED_DIR, tutorialId, "youtube.md"));
  const checklistPath = relOrMissing(path.join(CHECKLISTS_DIR, `${tutorialId}.md`));
  const specRel = path.relative(ROOT, specPath);
  const command = `npx playwright test --config=${path.relative(ROOT, BASE_CONFIG)} ${specRel}`;

  console.log(`
▶ Recording "${tutorialId}" (${entry.title}) with Guidde
════════════════════════════════════════════════════════

  1. Open ${BANTOO_BASE_URL} in your regular browser (just to have
     something on screen — you don't need to log in there).
  2. Click the Guidde extension icon, then click Record.
       ⚠️  Choose "Entire Screen" (or the new window once it appears) —
           NOT "This Tab". The command below opens its own separate
           browser window; Guidde's "This Tab" mode would just record
           your own idle tab doing nothing.
  3. Come back here and press Enter below once Guidde is actually
     recording.
  4. This script will then run:

       ${command}

     — a real, visible browser window will open by itself, log in, and
     perform every step of the tutorial. Don't touch your mouse/keyboard
     while it runs.
  5. When it finishes, stop your Guidde recording.
  6. Finish the video using:
       - Narration script:   ${synthesiaPath || "(not generated)"}
       - Annotation guide:   ${guiddePath || "(not generated)"}
       - YouTube metadata:   ${youtubePath || "(not generated)"}
  7. Mark it done by checking "Guidde recorded" in:
       ${checklistPath || "(no checklist file found)"}

Full details: tutorial-factory/GUIDDE_RECORDING_SOP.md
`);

  await promptEnter("Press Enter once you've clicked Record in Guidde and are ready to continue... ");

  console.log(`\nRunning: ${command}\n`);
  const playwrightBin = path.join(
    ROOT,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "playwright.cmd" : "playwright",
  );
  const result = spawnSync(playwrightBin, ["test", `--config=${path.relative(ROOT, BASE_CONFIG)}`, specRel], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  const exitCode = result.status === null ? 1 : result.status;

  if (exitCode === 0) {
    console.log(`
✅ Playwright finished the walkthrough. Now:

  1. Stop your Guidde recording.
  2. Review the draft Guidde produced.
  3. Add narration from ${synthesiaPath || "(synthesia.md not generated)"}
  4. Annotate using       ${guiddePath || "(guidde.md not generated)"}
  5. Upload using         ${youtubePath || "(youtube.md not generated)"}
  6. Check "Guidde recorded" in ${checklistPath || "(no checklist file found)"}
`);
  } else {
    console.log(`
⚠️  Playwright exited with code ${exitCode} — the walkthrough didn't finish cleanly.

  - Stop (or discard) your Guidde recording; this take isn't usable.
  - It's always safe to try again: npm run record:guidde -- ${tutorialId}
  - If it keeps failing, show the output above to someone technical.
`);
  }
  process.exit(exitCode);
}

main();
