#!/usr/bin/env node
"use strict";

/**
 * Tutorial Factory — dashboard + missing-assets report builder.
 *
 * Reads tutorial-factory/tutorial-index.json (must already exist — run
 * `npm run build:tutorial-index` first) and renders two generated,
 * do-not-hand-edit files:
 *
 *   - dashboard.md       production statistics + one status table row per
 *                         tutorial (✅/🔴 per tracked asset/production field).
 *   - missing-assets.md  a plain per-tutorial list of exactly what's
 *                         missing, derived from the same index data.
 *
 * Both outputs are pure renderings of tutorial-index.json — no new facts
 * are invented here, only formatting/aggregation of what build-index.js
 * already verified against the real filesystem.
 *
 * Run directly: `node tutorial-factory/build-dashboard.js`
 * Or via npm:    `npm run build:dashboard`
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const INDEX_FILE = path.join(__dirname, "tutorial-index.json");
const DASHBOARD_FILE = path.join(__dirname, "dashboard.md");
const MISSING_ASSETS_FILE = path.join(__dirname, "missing-assets.md");

// Content-generation assets tracked per tutorial (the "is the marketing/
// docs copy drafted" side of things) — order here is the dashboard table's
// column order.
const CONTENT_COLUMNS = [
  { field: "markdown", label: "Markdown" },
  { field: "help", label: "Help" },
  { field: "faq", label: "FAQ" },
  { field: "seo", label: "SEO" },
  { field: "youtube", label: "YouTube" },
  { field: "facebook", label: "Facebook" },
  { field: "linkedin", label: "LinkedIn" },
  { field: "email", label: "Email" },
  { field: "playwright", label: "Playwright" },
  { field: "guidde", label: "Guidde" },
  { field: "synthesia", label: "Synthesia" },
];

// Real-world production fields with no file-based signal (see
// build-index.js) — rendered as 3 summary columns per the task's requested
// dashboard shape, rather than all 5 raw fields:
//   Recorded  <- recording_status
//   Edited    <- editing_status
//   Published <- true only once youtube_status AND website_status AND
//                 help_center_status are ALL "Done" (i.e. actually live
//                 everywhere, not just uploaded to one channel). The full,
//                 ungrouped 5-field detail is always available in
//                 tutorial-index.json itself.
function publishedValue(t) {
  const fields = ["youtube_status", "website_status", "help_center_status"];
  if (fields.every((f) => t[f] === "Done")) return "Done";
  if (fields.some((f) => t[f] !== "Not started")) return "In progress";
  return "Not started";
}

function statusEmoji(value) {
  if (value === "Complete" || value === "Done") return "✅";
  if (value === "In progress") return "🟡";
  return "🔴"; // "Missing" or "Not started"
}

function loadIndex() {
  if (!fs.existsSync(INDEX_FILE)) {
    console.error(`Missing ${path.relative(ROOT, INDEX_FILE)} — run \`npm run build:tutorial-index\` first.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
}

/**
 * Production statistics, computed straight from tutorial-index.json.
 *
 * "Overall completion %" methodology (documented since this is otherwise
 * an arbitrary-looking number): every tutorial has 16 tracked yes/no
 * signals — the 11 content-generation columns above (markdown, help, faq,
 * seo, youtube, facebook, linkedin, email, playwright, guidde, synthesia)
 * plus the 5 raw production fields (recording/editing/youtube/website/
 * help_center_status, each counted as "done" only when its value is
 * literally "Done"). Overall % = (sum of "done" signals across all
 * tutorials) / (16 × tutorial count). This deliberately weights content
 * generation and real-world production equally per signal, rather than
 * letting "the marketing copy is finished" alone imply the tutorial is
 * mostly done.
 *
 * "Estimated remaining" is a rough heuristic, not a forecast — see the
 * inline comment below and dashboard.md's own caveat text.
 */
function computeStats(index) {
  const tutorials = index.tutorials;
  const total = tutorials.length;
  const contentComplete = tutorials.filter((t) => CONTENT_COLUMNS.every((c) => t[c.field] === "Complete")).length;
  const recorded = tutorials.filter((t) => t.recording_status === "Done").length;
  const published = tutorials.filter((t) => publishedValue(t) === "Done").length;

  const signalsPerTutorial = CONTENT_COLUMNS.length + 5; // 11 content + 5 production = 16
  let doneSignals = 0;
  for (const t of tutorials) {
    for (const c of CONTENT_COLUMNS) if (t[c.field] === "Complete") doneSignals++;
    for (const f of ["recording_status", "editing_status", "youtube_status", "website_status", "help_center_status"]) {
      if (t[f] === "Done") doneSignals++;
    }
  }
  const totalSignals = signalsPerTutorial * total;
  const overallPct = totalSignals > 0 ? Math.round((doneSignals / totalSignals) * 1000) / 10 : 0;

  // Rough remaining-effort heuristic, grounded in this actual session's
  // pace rather than an invented number:
  //   - Authoring a new tutorial's tutorials/NNN-slug.md frontmatter (goal,
  //     steps, test_data, etc.) plus writing + live-testing its Playwright
  //     spec was this session's real bottleneck per tutorial (everything
  //     downstream — help/faq/youtube/linkedin/facebook/shorts/email/seo —
  //     is now a ~zero-marginal-cost `npm run generate:tutorials` re-run,
  //     since that logic already exists and applies automatically to any
  //     new tutorial). We don't have precise session timing logs, so this
  //     is deliberately a coarse per-tutorial unit count, not a time
  //     estimate in hours/days.
  //   - Video production (recording/editing/uploading/publishing) has zero
  //     historical data in this repo (nothing has ever actually been
  //     produced) — flagged explicitly as "unknown" rather than guessed.
  const remainingTutorialsToward150 = Math.max(0, 150 - total);
  const goal = 150;

  return {
    total,
    goal,
    contentComplete,
    recorded,
    published,
    overallPct,
    remainingTutorialsToward150,
  };
}

function renderTableRow(t) {
  const cells = CONTENT_COLUMNS.map((c) => statusEmoji(t[c.field]));
  cells.push(statusEmoji(t.recording_status)); // Recorded
  cells.push(statusEmoji(t.editing_status)); // Edited
  cells.push(statusEmoji(publishedValue(t))); // Published
  return `| ${t.title} | ${t.feature_area} | ${t.status} | ${cells.join(" | ")} |`;
}

function renderDashboard(index) {
  const stats = computeStats(index);
  const lines = [];

  lines.push("# Tutorial Factory — Production Dashboard");
  lines.push("");
  lines.push(
    "> **Generated file — do not hand-edit.** Regenerate with `npm run build:tutorial-index && npm run build:dashboard` " +
      "after adding/updating a tutorial. Source data: `tutorial-index.json`."
  );
  lines.push("");
  lines.push(`Generated: ${index.generatedAt}`);
  lines.push("");

  lines.push("## Production Statistics");
  lines.push("");
  lines.push(`- **Total tutorials tracked:** ${stats.total} (goal: ${stats.goal}+)`);
  lines.push(`- **Content-complete** (all ${CONTENT_COLUMNS.length} generator/Playwright assets present): ${stats.contentComplete} / ${stats.total}`);
  lines.push(`- **Recorded:** ${stats.recorded} / ${stats.total}`);
  lines.push(`- **Published** (live on YouTube *and* website *and* Help Center): ${stats.published} / ${stats.total}`);
  lines.push(`- **Overall completion:** ${stats.overallPct}% — see methodology note below`);
  lines.push(`- **Remaining tutorials to reach the ${stats.goal}+ goal:** ${stats.remainingTutorialsToward150}`);
  lines.push("");
  const signalsPerTutorial = CONTENT_COLUMNS.length + 5;
  const contentOnlyPct = Math.round((CONTENT_COLUMNS.length / signalsPerTutorial) * 1000) / 10;
  lines.push(
    `> **Overall completion % methodology:** each tutorial has ${signalsPerTutorial} tracked yes/no signals — the ` +
      `${CONTENT_COLUMNS.length} content-generation columns in the table below, plus the 5 real-world production ` +
      'fields (recording/editing/YouTube/website/Help Center status, each only counted "done" when its value is ' +
      `literally "Done"). Overall % = (done signals across every tutorial) ÷ (${signalsPerTutorial} × tutorial count). ` +
      "This weights content generation and real production equally, on purpose — a tutorial whose marketing copy " +
      `is fully generated but has never been recorded is only about ${contentOnlyPct}% done by this measure, not 100%.`
  );
  lines.push("");
  lines.push(
    "> **\"Estimated remaining\" — a rough heuristic, not a forecast:** this session's real bottleneck per " +
      "tutorial was authoring its `tutorials/NNN-slug.md` frontmatter and writing + live-testing its Playwright " +
      "spec — every downstream content asset (help/faq/youtube/linkedin/facebook/shorts/email/seo/guidde/" +
      "synthesia) is already a ~zero-marginal-cost `npm run generate:tutorials` re-run once those two human inputs " +
      `exist, since that generator logic is built once and reused automatically. At ${stats.total} tutorials done, ` +
      `there are **${stats.remainingTutorialsToward150} tutorials' worth of frontmatter + Playwright-spec authoring** ` +
      "left before the content-generation side of the 150+ goal is met. Real-world video production (recording/" +
      "editing/uploading/publishing) has **zero historical data in this repo** — nothing has actually been " +
      "recorded yet for any tutorial — so no time estimate is given for that side; it needs a real estimate from " +
      "whoever owns video production, not a number guessed here."
  );
  lines.push("");

  lines.push("## Status Legend");
  lines.push("");
  lines.push("✅ Complete / Done &nbsp;&nbsp; 🟡 In progress &nbsp;&nbsp; 🔴 Missing / Not started");
  lines.push("");

  lines.push("## Tutorial Status");
  lines.push("");
  const headerLabels = ["Tutorial", "Feature Area", "Status", ...CONTENT_COLUMNS.map((c) => c.label), "Recorded", "Edited", "Published"];
  lines.push(`| ${headerLabels.join(" | ")} |`);
  lines.push(`|${headerLabels.map(() => "---").join("|")}|`);
  for (const t of index.tutorials) lines.push(renderTableRow(t));
  lines.push("");

  lines.push(
    "See `missing-assets.md` for a plain-language per-tutorial breakdown of exactly what's missing, and " +
      "`tutorial-index.json` for the full underlying data (including the `shorts`/`twitter` asset and the raw, " +
      "ungrouped 5-field production status not shown as separate columns above)."
  );
  lines.push("");

  return lines.join("\n");
}

function renderMissingAssets(index) {
  const lines = [];
  lines.push("# Tutorial Factory — Missing Assets Report");
  lines.push("");
  lines.push(
    "> **Generated file — do not hand-edit.** Regenerate with `npm run build:tutorial-index && npm run build:dashboard`. " +
      "Source data: `tutorial-index.json`."
  );
  lines.push("");
  lines.push(`Generated: ${index.generatedAt}`);
  lines.push("");

  for (const t of index.tutorials) {
    lines.push(`## ${t.title} (\`${t.tutorial_id}\`)`);
    lines.push("");
    lines.push(`- **Status:** ${t.status}`);

    const missingContent = CONTENT_COLUMNS.filter((c) => t[c.field] !== "Complete").map((c) => c.label);
    if (missingContent.length === 0) {
      lines.push("- **Content assets:** none missing ✅");
    } else {
      lines.push(`- **Content assets missing:** ${missingContent.join(", ")}`);
    }

    const notStartedProduction = PRODUCTION_LABELS.filter(({ field }) => t[field] !== "Done").map(({ label }) => label);
    if (notStartedProduction.length === 0) {
      lines.push("- **Production:** fully recorded, edited, and published ✅");
    } else {
      lines.push(`- **Production not yet complete:** ${notStartedProduction.join(", ")}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

const PRODUCTION_LABELS = [
  { field: "recording_status", label: "recording" },
  { field: "editing_status", label: "editing" },
  { field: "youtube_status", label: "YouTube upload" },
  { field: "website_status", label: "website publish" },
  { field: "help_center_status", label: "Help Center publish" },
];

function main() {
  const index = loadIndex();
  fs.writeFileSync(DASHBOARD_FILE, renderDashboard(index) + "\n");
  fs.writeFileSync(MISSING_ASSETS_FILE, renderMissingAssets(index) + "\n");
  console.log(`Wrote ${path.relative(ROOT, DASHBOARD_FILE)}`);
  console.log(`Wrote ${path.relative(ROOT, MISSING_ASSETS_FILE)}`);
}

main();
