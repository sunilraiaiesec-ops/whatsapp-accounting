"use strict";

/**
 * Shared "find this tutorial and its Playwright spec" lookup, used by both
 * `record-tutorial.js` (the fully-automated Playwright-records-its-own-
 * video pipeline) and `record-guidde.js` (the human-runs-Guidde pipeline),
 * so the two scripts can never drift into two slightly-different
 * definitions of "is this tutorial recordable."
 *
 * Deliberately NOT `tutorial-factory/build-index.js` itself: that file's
 * `main()` runs at module load time and rewrites `tutorial-index.json` as
 * a side effect — not something either recording script should trigger
 * just by validating an argument. Its `findPlaywrightSpec()` logic
 * (exact-filename match, falling back to a text scan) is small enough to
 * duplicate here on purpose, with this comment as the reason why.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const TUTORIAL_INDEX_FILE = path.join(__dirname, "..", "tutorial-index.json");
const SPECS_DIR = path.join(ROOT, "automation", "tutorials");

function loadTutorialIndex() {
  if (!fs.existsSync(TUTORIAL_INDEX_FILE)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(TUTORIAL_INDEX_FILE, "utf8"));
}

function findPlaywrightSpec(tutorialId) {
  const exactPath = path.join(SPECS_DIR, `${tutorialId}.spec.ts`);
  if (fs.existsSync(exactPath)) return exactPath;

  if (!fs.existsSync(SPECS_DIR)) return null;
  for (const filename of fs.readdirSync(SPECS_DIR).filter((f) => f.endsWith(".spec.ts"))) {
    const full = path.join(SPECS_DIR, filename);
    if (fs.readFileSync(full, "utf8").includes(tutorialId)) return full;
  }
  return null;
}

/**
 * Resolves a `tutorial_id` to its tutorial-index.json entry and (if any)
 * real Playwright spec path. Never throws or exits — callers decide how to
 * present "not found"/"no index"/"no spec" to their own user (a hard error
 * for `record-tutorial.js`, a graceful message for `record-guidde.js`).
 *
 * Returns one of:
 *   { ok: false, reason: "no-index" }
 *   { ok: false, reason: "not-found", knownIds: string[] }
 *   { ok: true, entry, specPath: string | null }
 */
function resolveTutorial(tutorialId) {
  const index = loadTutorialIndex();
  if (!index) return { ok: false, reason: "no-index" };

  const entry = index.tutorials.find((t) => t.tutorial_id === tutorialId);
  if (!entry) {
    return { ok: false, reason: "not-found", knownIds: index.tutorials.map((t) => t.tutorial_id) };
  }

  const specPath = entry.playwright === "Complete" ? findPlaywrightSpec(tutorialId) : null;
  return { ok: true, entry, specPath };
}

module.exports = { ROOT, TUTORIAL_INDEX_FILE, loadTutorialIndex, findPlaywrightSpec, resolveTutorial };
