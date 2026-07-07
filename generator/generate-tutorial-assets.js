#!/usr/bin/env node
"use strict";

/**
 * BantooBooks Tutorial Generator
 * --------------------------------------------------------------------------
 * Deterministic, offline. Reads every `tutorials/NNN-slug.md` file (each one
 * YAML-frontmatter + markdown, matching tutorials/schema.json) and writes a
 * fixed set of 12 derived asset files per tutorial into
 * `generated/tutorials/<tutorial_id>/`.
 *
 * Run: `node generator/generate-tutorial-assets.js`
 * (from the repo root, or any cwd — paths below are resolved relative to
 * this file, not the shell's cwd.)
 *
 * See generator/README.md for the full explanation of each output and how
 * to extend this script with a new output type or pick up a new tutorial.
 */

const fs = require("fs");
const path = require("path");
const util = require("util");

const { parseFrontmatter } = require("./lib/frontmatter");
const { ASSET_TYPES, buildMetadata } = require("./lib/builders");

const REPO_ROOT = path.resolve(__dirname, "..");
const TUTORIALS_DIR = path.join(REPO_ROOT, "tutorials");
const OUTPUT_DIR = path.join(REPO_ROOT, "generated", "tutorials");

// Only files named NNN-slug.md are treated as real tutorials — this is what
// makes "add a new tutorial and it's automatically picked up" true: drop
// 006-your-slug.md into tutorials/ following the existing naming convention
// and the next run of this script produces its generated/tutorials/ folder
// with no code changes required. README.md, TEMPLATE.md and schema.json are
// deliberately excluded by this pattern.
const TUTORIAL_FILENAME_RE = /^\d{3}-[a-z0-9-]+\.md$/;

function listTutorialFiles() {
  return fs
    .readdirSync(TUTORIALS_DIR)
    .filter((f) => TUTORIAL_FILENAME_RE.test(f))
    .sort();
}

function loadTutorial(filename) {
  const raw = fs.readFileSync(path.join(TUTORIALS_DIR, filename), "utf8");
  const { data } = parseFrontmatter(raw);
  return { filename, data };
}

/**
 * Reads and parses an existing `metadata.json` from a previous run, if any.
 * Returns `null` on any read/parse failure (e.g. first-ever run, or a
 * corrupted/hand-edited file) so the caller falls back to "no existing
 * metadata" behavior rather than throwing.
 */
function readExistingMetadata(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "metadata.json"), "utf8"));
  } catch (err) {
    return null;
  }
}

/**
 * Builds this tutorial's `metadata.json`, preserving the previous
 * `generatedAt` value instead of overwriting it with `candidateGeneratedAtIso`
 * whenever every other field would come out identical to what's already on
 * disk. This is what keeps `npm run generate:tutorials` diff-free when
 * nothing about the tutorial's content actually changed, while still
 * updating the timestamp the moment something real does change.
 */
function resolveMetadata(dir, data, candidateGeneratedAtIso) {
  const candidate = buildMetadata(data, candidateGeneratedAtIso);
  const existing = readExistingMetadata(dir);
  if (existing && typeof existing === "object") {
    const { generatedAt: existingGeneratedAt, ...existingRest } = existing;
    const { generatedAt: _candidateGeneratedAt, ...candidateRest } = candidate;
    if (existingGeneratedAt && util.isDeepStrictEqual(existingRest, candidateRest)) {
      return { ...candidate, generatedAt: existingGeneratedAt };
    }
  }
  return candidate;
}

/**
 * Runs the full generation pass and writes files to disk.
 * @param {object} [opts]
 * @param {string} [opts.generatedAtIso] — override for the one field allowed
 *   to vary between runs (`metadata.json.generatedAt`). Defaults to
 *   `new Date().toISOString()`. Passing a fixed value lets callers (e.g.
 *   verify.js) prove the rest of the output is byte-identical across runs.
 * @returns {{tutorials: Array<{tutorial_id: string, dir: string, files: string[]}>}}
 */
function generate(opts = {}) {
  const generatedAtIso = opts.generatedAtIso || new Date().toISOString();
  const filenames = listTutorialFiles();
  const results = [];

  for (const filename of filenames) {
    const { data } = loadTutorial(filename);
    const dir = path.join(OUTPUT_DIR, data.tutorial_id);
    fs.mkdirSync(dir, { recursive: true });

    const writtenFiles = [];

    for (const asset of ASSET_TYPES) {
      const content = asset.build(data);
      const serialized = asset.kind === "json" ? JSON.stringify(content, null, 2) + "\n" : ensureTrailingNewline(content);
      fs.writeFileSync(path.join(dir, asset.file), serialized, "utf8");
      writtenFiles.push(asset.file);
    }

    const metadata = resolveMetadata(dir, data, generatedAtIso);
    fs.writeFileSync(path.join(dir, "metadata.json"), JSON.stringify(metadata, null, 2) + "\n", "utf8");
    writtenFiles.push("metadata.json");

    results.push({ tutorial_id: data.tutorial_id, sourceFile: filename, dir, files: writtenFiles.sort() });
  }

  return { tutorials: results, generatedAtIso };
}

function ensureTrailingNewline(text) {
  return text.endsWith("\n") ? text : text + "\n";
}

function main() {
  const summary = generate();
  console.log(`Generated tutorial assets for ${summary.tutorials.length} tutorial(s):\n`);
  for (const t of summary.tutorials) {
    console.log(`  ${t.tutorial_id}  (${t.files.length} files) <- tutorials/${t.sourceFile}`);
  }
  console.log(`\nOutput root: ${path.relative(REPO_ROOT, OUTPUT_DIR)}/`);
}

if (require.main === module) {
  main();
}

module.exports = { generate, listTutorialFiles, loadTutorial, TUTORIALS_DIR, OUTPUT_DIR, ASSET_TYPES };
