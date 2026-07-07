#!/usr/bin/env node
"use strict";

/**
 * Tutorial Factory — master index builder.
 *
 * Scans the real filesystem — `tutorials/*.md`, `generated/tutorials/<slug>/*`,
 * `automation/tutorials/*.spec.ts`, and (read-only, just for
 * `recording_status`) `tutorial-factory/checklists/<slug>.md` — and writes
 * `tutorial-index.json`, one entry per tutorial that actually has a
 * `tutorials/*.md` file today. Nothing here is hand-typed data: every field
 * is either read straight from a real file's frontmatter/contents, or
 * computed from real file existence.
 *
 * This is a read-only tool: it never writes into `tutorials/`, `generator/`,
 * `generated/tutorials/`, or `checklists/` (it only ever reads a checklist,
 * never creates or edits one — that stays build-checklists.js's job), and
 * never runs the generator. It reuses
 * `generator/lib/frontmatter.js`'s parser via a plain `require()` (read
 * access only, never modified) instead of re-implementing YAML parsing.
 *
 * Run directly: `node tutorial-factory/build-index.js`
 * Or via npm:    `npm run build:tutorial-index`
 */

const fs = require("fs");
const path = require("path");
const { parseFrontmatter } = require("../generator/lib/frontmatter");

const ROOT = path.resolve(__dirname, "..");
const TUTORIALS_DIR = path.join(ROOT, "tutorials");
const GENERATED_DIR = path.join(ROOT, "generated", "tutorials");
const AUTOMATION_DIR = path.join(ROOT, "automation", "tutorials");
const CHECKLISTS_DIR = path.join(__dirname, "checklists");
const OUT_FILE = path.join(__dirname, "tutorial-index.json");

const TUTORIAL_FILENAME_RE = /^\d{3}-[a-z0-9-]+\.md$/;

/**
 * generator-produced content asset -> the file under
 * `generated/tutorials/<slug>/` that proves it exists. Deliberately omits
 * `twitter.md` and `metadata.json`, which the task's index schema doesn't
 * ask for as their own tracked fields (both are still visible in
 * `generated/tutorials/<slug>/` directly, and `metadata.json` in particular
 * duplicates this same file-listing concept one level down).
 */
const CONTENT_ASSET_FILES = {
  help: "help.md",
  faq: "faq.md",
  youtube: "youtube.md",
  linkedin: "linkedin.md",
  facebook: "facebook.md",
  shorts: "shorts.md",
  email: "email.md",
  seo: "seo.json",
  guidde: "guidde.md",
  synthesia: "synthesia.md",
};

/**
 * Real-world production fields with **no file-based signal anywhere in
 * this repo** — no actual video has ever been recorded, edited, uploaded,
 * or published for any tutorial here. These are always written as
 * "Not started" by this script; they exist as named fields so a future
 * human/production-tracking process has a documented place to update them
 * to "In progress"/"Done" as real work happens, without changing
 * tutorial-index.json's shape. See README.md's "What this does NOT track"
 * section — conflating "the marketing copy has been generated" with "the
 * video exists" would be actively misleading.
 */
const PRODUCTION_FIELDS = ["recording_status", "editing_status", "youtube_status", "website_status", "help_center_status"];

/**
 * `recording_status` is the one PRODUCTION_FIELDS value with a REAL
 * file-based signal available today: `tutorial-factory/checklists/<id>.md`
 * is explicitly documented (see build-checklists.js) as created once, then
 * hand-maintained — a human ticks its "Guidde recorded" box the moment a
 * real recording actually happens. Reading that box back here means
 * `npm run build:tutorial-index` (and anything downstream, e.g.
 * recording-queue.md) reflects real recording progress instead of a
 * permanently-hardcoded "Not started", without inventing any new
 * durable-storage mechanism — it reuses the one hand-maintained file this
 * project already has for exactly this purpose. The other 4
 * PRODUCTION_FIELDS (editing/youtube/website/help_center) intentionally
 * stay hardcoded "Not started": this repo has no equivalent hand-maintained
 * signal for those yet (the checklist has boxes for them too, but wiring
 * all 5 back is a bigger, separate change than this task's recording-focused
 * scope calls for).
 */
function checklistRecordingStatus(tutorialId) {
  const checklistPath = path.join(CHECKLISTS_DIR, `${tutorialId}.md`);
  if (!fs.existsSync(checklistPath)) return "Not started";
  const text = fs.readFileSync(checklistPath, "utf8");
  const match = text.match(/^-\s\[( |x|X)\]\s*Guidde recorded\s*$/m);
  return match && match[1].toLowerCase() === "x" ? "Done" : "Not started";
}

function completeOrMissing(exists) {
  return exists ? "Complete" : "Missing";
}

function listTutorialFilenames() {
  return fs
    .readdirSync(TUTORIALS_DIR)
    .filter((f) => TUTORIAL_FILENAME_RE.test(f))
    .sort();
}

/**
 * Exact-filename match first (`automation/tutorials/<tutorial_id>.spec.ts`
 * — true for all 5 tutorials today: create-a-customer.spec.ts,
 * create-a-supplier.spec.ts, create-a-sales-invoice.spec.ts,
 * record-customer-receipt.spec.ts, add-inventory-item.spec.ts all match
 * their tutorial_id exactly). Falls back to scanning every spec file's own
 * text for the tutorial_id string (each spec's header comment cites its
 * source tutorial's path, e.g. "tutorials/001-create-a-customer.md"), in
 * case a future tutorial's spec ever gets a differently-shaped filename.
 * Returns null (-> "Missing") if neither approach finds a match.
 */
let _specFilenamesCache = null;
function findPlaywrightSpec(tutorialId) {
  const exactPath = path.join(AUTOMATION_DIR, `${tutorialId}.spec.ts`);
  if (fs.existsSync(exactPath)) return exactPath;

  if (!_specFilenamesCache) {
    _specFilenamesCache = fs.existsSync(AUTOMATION_DIR)
      ? fs.readdirSync(AUTOMATION_DIR).filter((f) => f.endsWith(".spec.ts"))
      : [];
  }
  for (const filename of _specFilenamesCache) {
    const full = path.join(AUTOMATION_DIR, filename);
    const text = fs.readFileSync(full, "utf8");
    if (text.includes(tutorialId)) return full;
  }
  return null;
}

/**
 * Overall lifecycle status, computed purely from what's on disk — never
 * hand-set per tutorial. This is the documented taxonomy/rule:
 *
 *   - "Planned"          tutorials/*.md doesn't exist yet. This status can
 *                         never actually appear *in this generated index*
 *                         (the index only has entries for tutorials that
 *                         already have a .md file) — it's documented here
 *                         because tutorial-factory/roadmap.md's proposed
 *                         tutorials are conceptually at this stage.
 *   - "Drafted"           tutorials/*.md exists, but at least one generator
 *                         content asset or the Playwright spec is missing.
 *   - "Content Complete"  every generator content asset AND the Playwright
 *                         spec exist, but zero real-world production has
 *                         happened yet (every PRODUCTION_FIELDS value is
 *                         still "Not started").
 *   - "In Production"     content is complete and at least one
 *                         PRODUCTION_FIELDS value shows real progress, but
 *                         not every one of them is "Done" yet.
 *   - "Published"         every PRODUCTION_FIELDS value is "Done".
 *
 * For today's 5 tutorials this always computes to "Content Complete": all
 * generator assets + Playwright specs are real and present (verified
 * against the filesystem below), but no actual recording/editing/
 * publishing has happened for any of them.
 */
function computeStatus(entry) {
  const contentComplete =
    Object.keys(CONTENT_ASSET_FILES).every((field) => entry[field] === "Complete") && entry.playwright === "Complete";
  if (!contentComplete) return "Drafted";

  const productionValues = PRODUCTION_FIELDS.map((field) => entry[field]);
  if (productionValues.every((v) => v === "Done")) return "Published";
  if (productionValues.every((v) => v === "Not started")) return "Content Complete";
  return "In Production";
}

function buildEntry(filename) {
  const raw = fs.readFileSync(path.join(TUTORIALS_DIR, filename), "utf8");
  const { data } = parseFrontmatter(raw);
  const tutorialId = data.tutorial_id;
  const genDir = path.join(GENERATED_DIR, tutorialId);

  const entry = {
    tutorial_id: tutorialId,
    title: data.title,
    feature_area: data.feature_area,
    // Always "Complete" by construction: buildEntry() only ever runs for a
    // filename that listTutorialFilenames() found by actually reading
    // tutorials/ off disk.
    markdown: "Complete",
    // Straight from frontmatter, verbatim — used by
    // build-recording-queue.js to surface real cross-tutorial state
    // dependencies (e.g. "needs an existing customer") without inventing
    // any new hand-typed notes.
    prerequisites: Array.isArray(data.prerequisites) ? data.prerequisites : [],
  };

  for (const [field, file] of Object.entries(CONTENT_ASSET_FILES)) {
    entry[field] = completeOrMissing(fs.existsSync(path.join(genDir, file)));
  }

  const specPath = findPlaywrightSpec(tutorialId);
  entry.playwright = completeOrMissing(Boolean(specPath));
  // Real relative path when found, so downstream reports (e.g.
  // build-recording-queue.js) can print the exact file rather than just a
  // Complete/Missing flag.
  entry.playwright_spec_path = specPath ? path.relative(ROOT, specPath) : null;

  for (const field of PRODUCTION_FIELDS) entry[field] = "Not started";
  entry.recording_status = checklistRecordingStatus(tutorialId);

  entry.status = computeStatus(entry);

  // last_updated: prefer generated/tutorials/<slug>/metadata.json's own
  // `generatedAt` (already the most specific, idempotency-aware timestamp
  // the generator maintains for this tutorial's content), falling back to
  // the source tutorials/*.md file's own mtime if that file/field is
  // missing — never a fabricated date.
  const metadataPath = path.join(genDir, "metadata.json");
  let lastUpdated = null;
  let lastUpdatedSource = null;
  if (fs.existsSync(metadataPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
      if (meta.generatedAt) {
        lastUpdated = meta.generatedAt;
        lastUpdatedSource = `generated/tutorials/${tutorialId}/metadata.json#generatedAt`;
      }
    } catch (err) {
      // Malformed/unreadable metadata.json -> fall through to the mtime
      // fallback below rather than crashing the whole index build.
    }
  }
  if (!lastUpdated) {
    const stat = fs.statSync(path.join(TUTORIALS_DIR, filename));
    lastUpdated = stat.mtime.toISOString();
    lastUpdatedSource = `tutorials/${filename} (file mtime, metadata.json unavailable)`;
  }
  entry.last_updated = lastUpdated;
  entry.last_updated_source = lastUpdatedSource;

  return entry;
}

function main() {
  const filenames = listTutorialFilenames();
  const tutorials = filenames.map(buildEntry);

  const index = {
    generatedAt: new Date().toISOString(),
    generatedBy: "tutorial-factory/build-index.js",
    note:
      "Every field below is derived from real files on disk (tutorials/*.md frontmatter, generated/tutorials/<slug>/* file existence, automation/tutorials/*.spec.ts). recording_status reflects the real, hand-maintained 'Guidde recorded' checkbox in tutorial-factory/checklists/<slug>.md (tick it, then re-run `npm run build:tutorial-index`). editing_status/youtube_status/website_status/help_center_status have no file-based signal in this repo yet and are always \"Not started\" until a real production process updates them.",
    tutorialCount: tutorials.length,
    tutorials,
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(index, null, 2) + "\n");
  console.log(`Wrote ${tutorials.length} tutorial(s) to ${path.relative(ROOT, OUT_FILE)}`);
  for (const t of tutorials) {
    console.log(`  ${t.tutorial_id} — ${t.status}`);
  }
}

main();
