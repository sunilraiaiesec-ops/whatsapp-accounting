#!/usr/bin/env node
"use strict";

/**
 * Tutorial Factory — one-click recording pipeline.
 *
 * Takes a single `tutorial_id`, replays its Playwright spec against the
 * configured BantooBooks instance with Playwright's own video + trace
 * recording turned on (see `automation/playwright.recording.config.ts`),
 * and assembles the result into a "publish-ready video package" under
 * `recordings/<tutorial_id>/`.
 *
 * ## What this does and does not automate — read this before running it
 *
 * Guidde (referenced throughout `tutorials/README.md` and each tutorial's
 * generated `guidde.md`) has no public API to trigger or
 * control a *recording session* headlessly — its "Magic Capture" is
 * fundamentally a human-driven browser-extension capture. Guidde's actual
 * public API surface is scoped to managing/embedding/distributing guides
 * that already exist, not starting a new capture from a script. See
 * `tutorial-factory/RECORDING.md` for the full research writeup and
 * sources.
 *
 * So this script does NOT drive Guidde. It automates the one thing that
 * genuinely can be automated end-to-end from this codebase: a clean,
 * repeatable, narration-ready SCREEN CAPTURE of the tutorial being
 * performed for real, using Playwright's own video/trace recording of the
 * exact same scripted run this session already used for live
 * verification, combined with the fake-cursor/highlight-before-click
 * system in `automation/helpers/` that was specifically built to look
 * clean on camera.
 *
 * It does NOT produce a finished, publishable video: the raw capture has
 * no audio, and no call-out annotations beyond what's already visible on
 * screen (the highlight/cursor system). A human still needs to add
 * narration (from the packaged `synthesia.md`) and, if desired,
 * Guidde-style call-outs (from the packaged `guidde.md`) in a video
 * editor or by importing the raw capture into Guidde. See the generated
 * `README.md` in the output package, or `tutorial-factory/RECORDING.md`,
 * for the exact remaining steps.
 *
 * Usage:
 *   node tutorial-factory/record-tutorial.js <tutorial_id>
 *   npm run record:video -- <tutorial_id>
 *
 * Env vars (same ones `automation/` already reads — see
 * automation/helpers/config.ts / automation/README.md):
 *   BANTOO_BASE_URL       default http://localhost:3000
 *   BANTOO_DEMO_EMAIL     default central.demo@bantoobooks.com
 *   BANTOO_DEMO_PASSWORD  default DemoBooks2025!
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { ROOT, TUTORIAL_INDEX_FILE, resolveTutorial } = require("./lib/tutorial-lookup");

const AUTOMATION_DIR = path.join(ROOT, "automation");
const SPECS_DIR = path.join(AUTOMATION_DIR, "tutorials");
const GENERATED_DIR = path.join(ROOT, "generated", "tutorials");
const RECORDINGS_DIR = path.join(ROOT, "recordings");
const RECORDING_CONFIG = path.join(AUTOMATION_DIR, "playwright.recording.config.ts");

const BANTOO_BASE_URL = (process.env.BANTOO_BASE_URL || "http://localhost:3000").trim().replace(/\/+$/, "");
const DEMO_EMAIL = (process.env.BANTOO_DEMO_EMAIL || "central.demo@bantoobooks.com").trim();

// Assets copied into the package alongside the raw recording, and why each
// one is there — see the generated package README for the human-facing
// version of this same list.
const PACKAGED_ASSETS = [
  { file: "synthesia.md", purpose: "narration script to record as voiceover audio in post" },
  { file: "youtube.md", purpose: "title/description/chapters/hashtags, ready to paste when uploading" },
  { file: "guidde.md", purpose: "the on-screen highlight/call-out annotation guide, for Guidde import or manual editing" },
];

function fail(message) {
  console.error(`\nERROR: ${message}\n`);
  process.exit(1);
}

/** Recursively collects every file under `dir` whose name matches `predicate`. */
function findFiles(dir, predicate) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(full, predicate));
    } else if (predicate(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

function humanBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function copyIfExists(src, destDir, destName) {
  if (!fs.existsSync(src)) return null;
  const dest = path.join(destDir, destName);
  fs.copyFileSync(src, dest);
  return { name: destName, bytes: fs.statSync(dest).size };
}

function buildManualStepsRemaining(missingSourceAssets) {
  const steps = [
    "Add voiceover narration: record audio from synthesia.md's script (or feed it into Synthesia/another TTS/voice tool) and mix it onto raw-recording.webm in a video editor — the raw capture has no audio track at all.",
    "Optionally add call-out annotations: either import raw-recording.webm into Guidde (Guidde can annotate/enhance an uploaded video, it just can't have triggered this capture itself) and follow guidde.md's checklist, or add the same call-outs manually in any video editor — the on-screen highlight/cursor animation already shows what's being clicked, but guidde.md's zoom/circle/box notes are the source of truth for extra emphasis.",
    "Trim any dead air at the very start/end of raw-recording.webm (the script deliberately holds a few seconds on the first and last screen for exactly this purpose).",
    "Export the final edited video and upload it using youtube.md's title, description, chapters, and hashtags.",
    "Once actually published, update this tutorial's recording_status/editing_status/youtube_status/website_status/help_center_status by hand — see tutorial-factory/README.md; nothing in this repo detects real-world publishing automatically.",
  ];
  if (missingSourceAssets.length > 0) {
    steps.unshift(
      `Missing from this package: ${missingSourceAssets.join(", ")} (not yet generated for this tutorial — run \`npm run generate:tutorials\` if that's unexpected).`,
    );
  }
  return steps;
}

function main() {
  const tutorialId = process.argv[2];
  if (!tutorialId) {
    fail(
      "Usage: node tutorial-factory/record-tutorial.js <tutorial_id>\n" +
        "   or: npm run record:video -- <tutorial_id>\n\n" +
        "Example: npm run record:video -- create-a-customer",
    );
  }

  const resolved = resolveTutorial(tutorialId);
  if (!resolved.ok && resolved.reason === "no-index") {
    fail(
      `${path.relative(ROOT, TUTORIAL_INDEX_FILE)} doesn't exist yet. Run \`npm run build:tutorial-index\` first, ` +
        `then try again.`,
    );
  }
  if (!resolved.ok && resolved.reason === "not-found") {
    fail(`"${tutorialId}" isn't in tutorial-index.json. Known tutorial_ids: ${resolved.knownIds.join(", ")}`);
  }
  const { entry, specPath } = resolved;
  if (entry.playwright !== "Complete") {
    fail(
      `"${tutorialId}" has no Playwright spec tracked in tutorial-index.json (playwright: "${entry.playwright}"). ` +
        `A recording needs a live-tested spec under automation/tutorials/ first.`,
    );
  }
  if (!specPath) {
    fail(
      `tutorial-index.json says "${tutorialId}" has a Playwright spec, but no matching file was found under ` +
        `${path.relative(ROOT, SPECS_DIR)}/. The index may be stale — try \`npm run build:tutorial-index\`.`,
    );
  }

  console.log(`\n▶ Recording "${tutorialId}" (${entry.title})`);
  console.log(`  Spec:     ${path.relative(ROOT, specPath)}`);
  console.log(`  Base URL: ${BANTOO_BASE_URL}`);
  console.log(`  Demo org: ${DEMO_EMAIL}\n`);

  const tempOutputDir = path.join(AUTOMATION_DIR, ".recording-output", tutorialId);
  fs.rmSync(tempOutputDir, { recursive: true, force: true });
  fs.mkdirSync(tempOutputDir, { recursive: true });

  const playwrightBin = path.join(
    ROOT,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "playwright.cmd" : "playwright",
  );
  const args = [
    "test",
    `--config=${path.relative(ROOT, RECORDING_CONFIG)}`,
    path.relative(ROOT, specPath),
    `--output=${path.relative(ROOT, tempOutputDir)}`,
  ];

  console.log(`Running: ${path.basename(playwrightBin)} ${args.join(" ")}\n`);
  const result = spawnSync(playwrightBin, args, {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  const playwrightExitCode = result.status === null ? 1 : result.status;
  const recordingRanCleanly = playwrightExitCode === 0;

  const videoFiles = findFiles(tempOutputDir, (name) => name.endsWith(".webm"));
  const traceFiles = findFiles(tempOutputDir, (name) => name === "trace.zip");

  if (videoFiles.length === 0) {
    console.error(
      `\nNo .webm video was found under ${path.relative(ROOT, tempOutputDir)}/ — the recording did not produce ` +
        `usable video. Raw Playwright output (screenshots, logs, error context) is left in that folder for ` +
        `debugging.\n`,
    );
    process.exit(1);
  }
  if (videoFiles.length > 1) {
    console.warn(`  (found ${videoFiles.length} video files — using the first one; check ${tempOutputDir} if unexpected)`);
  }

  const packageDir = path.join(RECORDINGS_DIR, tutorialId);
  fs.mkdirSync(packageDir, { recursive: true });

  const files = [];
  const rawVideoDest = path.join(packageDir, "raw-recording.webm");
  fs.copyFileSync(videoFiles[0], rawVideoDest);
  files.push({ name: "raw-recording.webm", bytes: fs.statSync(rawVideoDest).size });

  if (traceFiles.length > 0) {
    const traceDest = path.join(packageDir, "trace.zip");
    fs.copyFileSync(traceFiles[0], traceDest);
    files.push({ name: "trace.zip", bytes: fs.statSync(traceDest).size });
  } else {
    console.warn("  (no trace.zip found — trace: \"on\" should always produce one; check the recording config)");
  }

  const genDir = path.join(GENERATED_DIR, tutorialId);
  const missingSourceAssets = [];
  for (const asset of PACKAGED_ASSETS) {
    const copied = copyIfExists(path.join(genDir, asset.file), packageDir, asset.file);
    if (copied) {
      files.push(copied);
    } else {
      missingSourceAssets.push(asset.file);
    }
  }

  const manualStepsRemaining = buildManualStepsRemaining(missingSourceAssets);

  const manifest = {
    tutorialId,
    title: entry.title,
    featureArea: entry.feature_area,
    recordedAt: new Date().toISOString(),
    baseUrl: BANTOO_BASE_URL,
    demoOrgEmail: DEMO_EMAIL,
    specPath: path.relative(ROOT, specPath),
    recordingConfig: path.relative(ROOT, RECORDING_CONFIG),
    playwrightExitCode,
    recordingSucceeded: recordingRanCleanly,
    note: recordingRanCleanly
      ? "Playwright completed the scripted walkthrough successfully; raw-recording.webm is a full, clean capture."
      : "Playwright exited non-zero. raw-recording.webm may show a failed/partial run (e.g. an assertion failing " +
        "mid-script) — review it before treating this package as publish-ready.",
    files,
    missingSourceAssets,
    manualStepsRemaining,
    rawPlaywrightOutputDir: recordingRanCleanly
      ? null
      : path.relative(ROOT, tempOutputDir) + " (kept for debugging since the run did not exit cleanly)",
  };
  fs.writeFileSync(path.join(packageDir, "recording-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  fs.writeFileSync(path.join(packageDir, "README.md"), renderPackageReadme(manifest));

  if (recordingRanCleanly) {
    fs.rmSync(tempOutputDir, { recursive: true, force: true });
  }

  printSummary(manifest, packageDir);
  process.exit(recordingRanCleanly ? 0 : 1);
}

function renderPackageReadme(manifest) {
  const lines = [];
  lines.push(`# Recording Package — ${manifest.title}`);
  lines.push("");
  lines.push(
    `Generated by \`tutorial-factory/record-tutorial.js\` on ${manifest.recordedAt}. See ` +
      "`tutorial-factory/RECORDING.md` for how this pipeline works and what it does/doesn't automate.",
  );
  lines.push("");
  if (!manifest.recordingSucceeded) {
    lines.push(
      `> ⚠️ **This run did not exit cleanly** (Playwright exit code ${manifest.playwrightExitCode}). ${manifest.note} ` +
        `Do not treat this as publish-ready without reviewing \`raw-recording.webm\` first.`,
    );
    lines.push("");
  }
  lines.push("## What's in this folder");
  lines.push("");
  lines.push("| File | What it is |");
  lines.push("|---|---|");
  const fileDescriptions = {
    "raw-recording.webm": "The screen capture itself — Playwright's own video recording of the scripted walkthrough (no audio).",
    "trace.zip": "Playwright trace of the same run — open with `npx playwright show-trace trace.zip` for a step-by-step, screenshot-by-screenshot debugging/re-editing reference.",
    "synthesia.md": "Narration script — record this as voiceover audio (via Synthesia or any TTS/voice actor) and mix it onto the raw recording.",
    "youtube.md": "Title, description, chapters, and hashtags — ready to paste when uploading the finished video.",
    "guidde.md": "The on-screen highlight/call-out annotation checklist — use this when importing the raw recording into Guidde, or as a manual annotation guide in any video editor.",
    "recording-manifest.json": "Machine-readable version of everything in this README.",
  };
  for (const f of manifest.files) {
    lines.push(`| \`${f.name}\` | ${fileDescriptions[f.name] || ""} |`);
  }
  lines.push("| `README.md` | This file. |");
  lines.push("");

  lines.push("## Run details");
  lines.push("");
  lines.push(`- **Tutorial:** \`${manifest.tutorialId}\` — ${manifest.title} (${manifest.featureArea})`);
  lines.push(`- **Recorded against:** ${manifest.baseUrl}, logged in as ${manifest.demoOrgEmail}`);
  lines.push(`- **Spec:** \`${manifest.specPath}\``);
  lines.push(`- **Recording config:** \`${manifest.recordingConfig}\` (Playwright's own video: "on" / trace: "on")`);
  lines.push("");

  lines.push("## What this pipeline does NOT do");
  lines.push("");
  lines.push(
    "Guidde has no public API to trigger a recording session headlessly — its capture is fundamentally a " +
      "human-driven browser extension. This pipeline does not touch Guidde at all; it produces a real, clean, " +
      "repeatable screen capture using Playwright's own recording of the exact same tested walkthrough, which is " +
      "the part that genuinely can be automated. See `tutorial-factory/RECORDING.md` for the full research " +
      "writeup.",
  );
  lines.push("");

  lines.push("## Manual steps still required to get a finished, publishable video");
  lines.push("");
  manifest.manualStepsRemaining.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
  lines.push("");

  return lines.join("\n");
}

function printSummary(manifest, packageDir) {
  console.log("");
  if (manifest.recordingSucceeded) {
    console.log(`✅ Recording package assembled: ${path.relative(ROOT, packageDir)}/`);
  } else {
    console.log(`⚠️  Recording finished with problems — package assembled anyway: ${path.relative(ROOT, packageDir)}/`);
  }
  console.log("");
  console.log("  Files:");
  for (const f of manifest.files) {
    console.log(`    ${f.name.padEnd(24)} ${humanBytes(f.bytes)}`);
  }
  if (manifest.missingSourceAssets.length > 0) {
    console.log(`\n  Missing (not generated for this tutorial): ${manifest.missingSourceAssets.join(", ")}`);
  }
  console.log("\n  Manual steps still needed:");
  manifest.manualStepsRemaining.forEach((step, i) => console.log(`    ${i + 1}. ${step}`));
  console.log("");
}

main();
