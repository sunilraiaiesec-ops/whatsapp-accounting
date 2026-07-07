#!/usr/bin/env node
"use strict";

/**
 * Tutorial Factory — publishing checklist generator.
 *
 * Reads tutorial-index.json and creates one checklist file per tutorial at
 * `tutorial-factory/checklists/<tutorial_id>.md`, with exactly 9 fixed
 * checkbox items covering the full path from "content is drafted" to
 * "actually published": Playwright verified, Guidde recorded, Synthesia
 * narration, Thumbnail, YouTube upload, Website, Help Center, Social posts
 * scheduled, QA approved.
 *
 * IMPORTANT — idempotency / does not clobber human progress: unlike
 * build-index.js/build-dashboard.js, this script only ever *creates* a
 * checklist file that doesn't already exist; it never overwrites one that
 * does. Once a checklist exists, it becomes a hand-maintained record of
 * real production progress (someone ticks boxes as recording/editing/
 * publishing actually happens) — a future re-run of this script must not
 * silently reset those check-marks back to their day-1 state. This is the
 * same "don't cause spurious/destructive regeneration diffs" principle
 * `generator/`'s metadata.json-generatedAt idempotency uses, applied here
 * to a file that's designed to be edited by hand after its first
 * generation, not to a fully machine-owned file.
 *
 * Only "Playwright verified" is ever pre-checked, and only for tutorials
 * with real evidence of a live, passing test run — see
 * PLAYWRIGHT_LIVE_VERIFIED below. Every other box starts unchecked, since
 * no actual recording/editing/publishing has happened for any tutorial in
 * this repo yet.
 *
 * Run directly: `node tutorial-factory/build-checklists.js`
 * Or via npm:    `npm run build:checklists`
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const INDEX_FILE = path.join(__dirname, "tutorial-index.json");
const CHECKLISTS_DIR = path.join(__dirname, "checklists");

/**
 * Tutorials whose Playwright spec was actually run live against the
 * BantooBooks UI and observed to pass, per this development session's own
 * context (not something derivable from any file in this repo — Playwright
 * doesn't leave a persistent "last run passed" artifact on disk). This is
 * a point-in-time fact as of when this list was written; if a tutorial's
 * spec is later live-verified (or a regression is found), update this set
 * — or, simpler, just hand-edit that tutorial's own checklist file, since
 * checklists are never auto-overwritten once created (see file header).
 */
const PLAYWRIGHT_LIVE_VERIFIED = new Set([
  "create-a-customer",
  "create-a-supplier",
  "create-a-sales-invoice",
  "record-customer-receipt",
  "add-inventory-item",
]);

const CHECKLIST_ITEMS = [
  "Playwright verified",
  "Guidde recorded",
  "Synthesia narration",
  "Thumbnail",
  "YouTube upload",
  "Website",
  "Help Center",
  "Social posts scheduled",
  "QA approved",
];

function loadIndex() {
  if (!fs.existsSync(INDEX_FILE)) {
    console.error(`Missing ${path.relative(ROOT, INDEX_FILE)} — run \`npm run build:tutorial-index\` first.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
}

function renderChecklist(t) {
  const lines = [];
  lines.push(`# Publishing Checklist — ${t.title}`);
  lines.push("");
  lines.push(`\`tutorial_id\`: \`${t.tutorial_id}\` · Feature area: ${t.feature_area}`);
  lines.push("");
  lines.push(
    "> Generated once by `tutorial-factory/build-checklists.js` from real evidence available at generation time " +
      "(see that script's header for exactly what counts as evidence). **This file is then hand-maintained** — " +
      "check items off as the real production work happens. Re-running the generator will never overwrite an " +
      "existing checklist file, so your progress here is safe."
  );
  lines.push("");
  for (const item of CHECKLIST_ITEMS) {
    const checked = item === "Playwright verified" && PLAYWRIGHT_LIVE_VERIFIED.has(t.tutorial_id);
    lines.push(`- [${checked ? "x" : " "}] ${item}`);
  }
  lines.push("");
  return lines.join("\n");
}

function main() {
  const index = loadIndex();
  fs.mkdirSync(CHECKLISTS_DIR, { recursive: true });

  let created = 0;
  let skipped = 0;
  for (const t of index.tutorials) {
    const outFile = path.join(CHECKLISTS_DIR, `${t.tutorial_id}.md`);
    if (fs.existsSync(outFile)) {
      console.log(`  skipped (already exists, left untouched): ${path.relative(ROOT, outFile)}`);
      skipped++;
      continue;
    }
    fs.writeFileSync(outFile, renderChecklist(t));
    console.log(`  created: ${path.relative(ROOT, outFile)}`);
    created++;
  }
  console.log(`\n${created} checklist(s) created, ${skipped} already existed and were left as-is.`);
}

main();
