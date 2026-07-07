#!/usr/bin/env node
"use strict";

/**
 * Tutorial Factory — recording queue builder.
 *
 * Reads tutorial-factory/tutorial-index.json (must already exist — run
 * `npm run build:tutorial-index` first) and renders recording-queue.md: one
 * row per tutorial with everything a human operator needs to record it via
 * the human+Guidde+Playwright workflow documented in
 * `tutorial-factory/GUIDDE_RECORDING_SOP.md` — the Playwright script path
 * (or a clear "Missing" flag), the Guidde/Synthesia/YouTube asset paths,
 * the tutorial's real `recording_status` (honestly "Not started" for every
 * tutorial today — no video has ever actually been produced in this repo),
 * and a Notes column carrying that tutorial's own real `prerequisites`
 * frontmatter verbatim (cross-tutorial state dependencies, e.g. "needs an
 * existing customer") rather than a second, hand-typed, driftable summary.
 *
 * Like dashboard.md/missing-assets.md, this is a pure rendering of
 * tutorial-index.json — no new facts are invented here.
 *
 * Run directly: `node tutorial-factory/build-recording-queue.js`
 * Or via npm:    `npm run build:recording-queue`
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const INDEX_FILE = path.join(__dirname, "tutorial-index.json");
const OUT_FILE = path.join(__dirname, "recording-queue.md");
const GENERATED_DIR_REL = "generated/tutorials";

function loadIndex() {
  if (!fs.existsSync(INDEX_FILE)) {
    console.error(`Missing ${path.relative(ROOT, INDEX_FILE)} — run \`npm run build:tutorial-index\` first.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
}

function assetPathOrMissing(tutorialId, field, filename) {
  return field === "Complete" ? `${GENERATED_DIR_REL}/${tutorialId}/${filename}` : "Missing";
}

function renderNotes(t) {
  const parts = [];
  if (t.playwright !== "Complete") {
    parts.push(
      "⚠️ **No Playwright script yet** — needs `automation/tutorials/" +
        `${t.tutorial_id}.spec.ts` +
        "` written and live-tested before this can go through the automated (Playwright-drives-the-app) recording workflow. Not created by this task (out of scope).",
    );
  }
  if (t.prerequisites && t.prerequisites.length > 0) {
    parts.push(`**Prerequisites:** ${t.prerequisites.join(" ")}`);
  } else {
    parts.push("Self-contained — no listed prerequisite on another tutorial's data.");
  }
  return parts.join("<br>");
}

function renderRow(t) {
  const cells = [
    `\`${t.tutorial_id}\``,
    t.title,
    t.playwright === "Complete" ? `\`${t.playwright_spec_path}\`` : "**Missing**",
    assetPathOrMissing(t.tutorial_id, t.guidde, "guidde.md"),
    assetPathOrMissing(t.tutorial_id, t.synthesia, "synthesia.md"),
    assetPathOrMissing(t.tutorial_id, t.youtube, "youtube.md"),
    t.recording_status,
    renderNotes(t),
  ];
  return `| ${cells.join(" | ")} |`;
}

function renderQueue(index) {
  const lines = [];
  lines.push("# Recording Queue — All Tutorials");
  lines.push("");
  lines.push(
    "> **Generated file — do not hand-edit.** Regenerate with `npm run build:tutorial-index && npm run " +
      "build:recording-queue` after adding a tutorial, a Playwright spec, or regenerating content assets. Source " +
      "data: `tutorial-index.json`.",
  );
  lines.push("");
  lines.push(`Generated: ${index.generatedAt}`);
  lines.push("");
  lines.push(
    "See [`GUIDDE_RECORDING_SOP.md`](./GUIDDE_RECORDING_SOP.md) for the step-by-step human recording procedure, " +
      "and [`RECORDING.md`](./RECORDING.md) for the separate fully-automated (Playwright-records-its-own-video, " +
      "no Guidde involved) pipeline. This queue is specifically for the **human runs Guidde, Playwright just " +
      "performs the on-screen actions** workflow.",
  );
  lines.push("");

  const ready = index.tutorials.filter((t) => t.playwright === "Complete");
  const notReady = index.tutorials.filter((t) => t.playwright !== "Complete");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- **Ready to record right now** (Playwright script + full generated assets both exist): ${ready.length} / ${index.tutorials.length}`);
  lines.push(`- **Blocked on a missing Playwright script:** ${notReady.length} / ${index.tutorials.length}`);
  lines.push(`- **Actually recorded so far:** ${index.tutorials.filter((t) => t.recording_status === "Done").length} / ${index.tutorials.length} (honest — zero real recordings exist in this repo yet)`);
  lines.push("");

  lines.push("## Queue");
  lines.push("");
  const headers = ["tutorial_id", "Title", "Playwright script", "Guidde checklist", "Synthesia script", "YouTube metadata", "Recording status", "Notes"];
  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`|${headers.map(() => "---").join("|")}|`);
  for (const t of index.tutorials) lines.push(renderRow(t));
  lines.push("");

  return lines.join("\n");
}

function main() {
  const index = loadIndex();
  fs.writeFileSync(OUT_FILE, renderQueue(index) + "\n");
  console.log(`Wrote ${path.relative(ROOT, OUT_FILE)}`);
}

main();
