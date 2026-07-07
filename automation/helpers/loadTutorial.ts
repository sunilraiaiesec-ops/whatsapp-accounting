/**
 * Loads one tutorial's frontmatter (test_data, step_by_step_actions,
 * demo_company, ...) by `tutorial_id`, reusing the SAME hand-rolled parser
 * the generator uses (generator/lib/frontmatter.js) rather than a second
 * implementation — see that file's own header comment for why it's
 * hand-rolled instead of a real YAML library.
 *
 * Deliberately untyped beyond a thin shape: the frontmatter schema
 * (tutorials/schema.json) is the real source of truth, and duplicating its
 * 18 fields into a parallel TypeScript type here would just be one more
 * place to keep in sync. Specs destructure only the fields they need.
 */

import fs from "node:fs";
import path from "node:path";

// generator/lib/frontmatter.js is plain CommonJS with no type declarations;
// automation/tsconfig.json enables allowJs so this import type-checks as
// `any`, which is fine for a thin data-loading shim like this one.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { parseFrontmatter } = require("../../generator/lib/frontmatter.js");

const TUTORIALS_DIR = path.resolve(__dirname, "../../tutorials");
const TUTORIAL_FILENAME_RE = /^\d{3}-[a-z0-9-]+\.md$/;

export type StepAction = { step: number; action: string };

export type Tutorial = {
  tutorial_id: string;
  title: string;
  feature_area: string;
  demo_company: string;
  test_data: Record<string, string>;
  step_by_step_actions: StepAction[];
  expected_result: string;
  [key: string]: unknown;
};

/** Reads and parses every tutorials/*.md file's frontmatter (no caching — this is a one-shot CLI tool, not a server). */
export function loadAllTutorials(): Tutorial[] {
  const files = fs.readdirSync(TUTORIALS_DIR).filter((f) => TUTORIAL_FILENAME_RE.test(f));
  return files.map((file) => {
    const raw = fs.readFileSync(path.join(TUTORIALS_DIR, file), "utf8");
    const { data } = parseFrontmatter(raw);
    return data as Tutorial;
  });
}

/** Finds one tutorial by its `tutorial_id` frontmatter field (e.g. "create-a-customer"). */
export function loadTutorial(tutorialId: string): Tutorial {
  const match = loadAllTutorials().find((t) => t.tutorial_id === tutorialId);
  if (!match) {
    throw new Error(
      `No tutorial found with tutorial_id "${tutorialId}" in ${TUTORIALS_DIR}. ` +
        `Check tutorials/*.md frontmatter for the exact tutorial_id.`,
    );
  }
  return match;
}
