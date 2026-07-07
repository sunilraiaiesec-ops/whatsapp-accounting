#!/usr/bin/env node
"use strict";

/**
 * Self-checks for the tutorial generator. Not a full test framework — just
 * plain assertions with clear pass/fail output, per the task's "doesn't
 * need a full test framework" instruction.
 *
 * Run: `node generator/verify.js`
 *
 * Checks:
 *   1. Every tutorial produced exactly the expected 12 files.
 *   2. Every `seo.json` / `metadata.json` is valid, parseable JSON.
 *   3. Idempotency: running the generator again with a different candidate
 *      `generatedAtIso`, when nothing about the tutorial's content actually
 *      changed, produces byte-identical output for EVERY file — including
 *      `metadata.json.generatedAt`, which is now preserved rather than
 *      overwritten (see `resolveMetadata()` in generate-tutorial-assets.js).
 *   4. Real content change *does* update `generatedAt`: simulated by
 *      tampering with one tutorial's on-disk `metadata.json`, regenerating,
 *      and confirming the freshly-injected timestamp took effect — then
 *      confirming a further no-op regeneration preserves that new value.
 *
 * Steps 3-4 temporarily mutate `generated/tutorials/`; this script restores
 * the exact original bytes (captured from the very first, real-timestamp run)
 * before exiting, so the working tree is left in a normal, reviewable state
 * with no fake 2020/2030 dates or tampered content left behind.
 */

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const { generate, listTutorialFiles, loadTutorial, OUTPUT_DIR } = require("./generate-tutorial-assets");
const {
  ASSET_TYPES,
  buildFaqQuestions,
  GENERIC_OUTCOME_QUESTION,
  OUTCOME_BUILDER_BY_FEATURE_AREA,
  FEATURE_AREA_EXTRA_BUILDERS,
} = require("./lib/builders");
const { extractKeywords } = require("./lib/text-utils");

const EXPECTED_FILES = [...ASSET_TYPES.map((a) => a.file), "metadata.json"].sort();

let failures = 0;
function check(label, fn) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failures++;
    console.log(`  ✗ ${label}`);
    console.log(`    ${err.message}`);
  }
}

function readTree(tutorialDirs) {
  const tree = {};
  for (const { tutorial_id, dir } of tutorialDirs) {
    tree[tutorial_id] = {};
    for (const file of fs.readdirSync(dir).sort()) {
      tree[tutorial_id][file] = fs.readFileSync(path.join(dir, file), "utf8");
    }
  }
  return tree;
}

/** Writes a previously-captured `readTree()` snapshot back to disk verbatim. */
function writeTree(tutorialDirs, tree) {
  for (const { tutorial_id, dir } of tutorialDirs) {
    for (const [file, content] of Object.entries(tree[tutorial_id])) {
      fs.writeFileSync(path.join(dir, file), content, "utf8");
    }
  }
}

console.log("BantooBooks Tutorial Generator — self-checks\n");

// --- 1 & 2: structural + JSON validity, using a normal (real-timestamp) run.
console.log("Structural + JSON validity checks:");
const firstRun = generate();
const firstRunDirs = firstRun.tutorials.map((t) => ({ tutorial_id: t.tutorial_id, dir: t.dir }));
// Captured now, before any of the deliberately-mutating checks below, so we
// can restore these exact original bytes (including the real generatedAt
// this run just wrote) once those checks are done.
const treeOriginal = readTree(firstRunDirs);

check(`found ${firstRun.tutorials.length} tutorial(s) under tutorials/*.md`, () => {
  assert.ok(firstRun.tutorials.length >= 1, "expected at least one tutorial");
});

for (const t of firstRun.tutorials) {
  check(`${t.tutorial_id}: exactly the expected 12 files`, () => {
    assert.deepStrictEqual(t.files, EXPECTED_FILES, `got: ${JSON.stringify(t.files)}`);
  });
  check(`${t.tutorial_id}/seo.json is valid JSON`, () => {
    JSON.parse(fs.readFileSync(path.join(t.dir, "seo.json"), "utf8"));
  });
  check(`${t.tutorial_id}/metadata.json is valid JSON`, () => {
    JSON.parse(fs.readFileSync(path.join(t.dir, "metadata.json"), "utf8"));
  });
  check(`${t.tutorial_id}/faq.md has no dev-facing provenance artifacts`, () => {
    const faq = fs.readFileSync(path.join(t.dir, "faq.md"), "utf8");
    // Broad regression check: any known shape of internal generator
    // notation (old "_Derived by:_" lines, HTML comments, a stray
    // `faqFromX()` function-name reference, or generic TODO/debug
    // markers) leaking into a reader-facing FAQ, regardless of which
    // question builder produced the surrounding text.
    assert.ok(!/derived by/i.test(faq), "found a 'derived by' provenance note leaking into the rendered FAQ");
    assert.ok(!faq.includes("<!--"), "found an HTML comment leaking into the rendered FAQ");
    assert.ok(!/faqFrom[A-Za-z]+\(\)/.test(faq), "found a raw faqFromX() function-name reference leaking into the rendered FAQ");
    assert.ok(!/\bTODO\b/.test(faq), "found a TODO marker leaking into the rendered FAQ");
  });
}

// --- FAQ feature-area-aware selection: the *set* of questions should be
// tailored per feature_area (see FEATURE_AREA_EXTRA_BUILDERS /
// OUTCOME_BUILDER_BY_FEATURE_AREA in lib/builders.js), not just phrasing.
// Driven by each tutorial's own `feature_area` field rather than its
// tutorial_id, so this keeps working unmodified if tutorials are renamed or
// a 6th tutorial is added to an already-mapped feature area.
//
// IMPORTANT — this section intentionally does NOT reimplement the
// "should this lifecycle/terminology question appear?" decision as a
// second, separate feature-area assumption (e.g. "every Sales & Invoicing
// tutorial must have the invoice-lifecycle question"). That would be wrong:
// `OUTCOME_BUILDER_BY_FEATURE_AREA` / `FEATURE_AREA_EXTRA_BUILDERS` builders
// self-gate on genuine keyword evidence in *this tutorial's own*
// `expected_result`/`help_center_article`/`goal` (e.g. a credit note that
// reduces an existing invoice never mentions "unpaid", so it correctly gets
// no invoice-lifecycle question — that's not a bug). Instead, the checks
// below call the *exact same* exported builder function the generator uses
// for this tutorial's `feature_area`, and assert that the FAQ's actual
// question set matches whatever that one gate decided — present when the
// gate fires, absent (with the appropriate fallback/no-op) when it doesn't.
// This can never drift from the generator's real behavior because it's not
// a second copy of the logic — it's a direct call into the generator's own
// predicate.
console.log("\nFAQ feature-area-aware question selection:");
const tutorialsData = listTutorialFiles().map((filename) => loadTutorial(filename).data);

for (const data of tutorialsData) {
  const questions = buildFaqQuestions(data).map((q) => q.q);
  check(`${data.tutorial_id}: FAQ has at least 4 questions`, () => {
    assert.ok(questions.length >= 4, `only got ${questions.length}: ${JSON.stringify(questions)}`);
  });

  if (data.feature_area === "Customers" || data.feature_area === "Suppliers") {
    check(`${data.tutorial_id} (${data.feature_area}): FAQ includes an editability question`, () => {
      assert.ok(questions.some((q) => /^Can I edit/.test(q)), `questions were: ${JSON.stringify(questions)}`);
    });
  }

  // Outcome-builder gate: for any feature_area with an entry in
  // OUTCOME_BUILDER_BY_FEATURE_AREA, that builder either replaces the
  // generic closing question with a feature-specific one (when this
  // tutorial's own content meets its gating condition) or steps aside so
  // the generic question shows instead (when it doesn't) — never both,
  // never neither.
  const outcomeBuilder = OUTCOME_BUILDER_BY_FEATURE_AREA[data.feature_area];
  if (outcomeBuilder) {
    check(`${data.tutorial_id} (${data.feature_area}): FAQ outcome question matches the generator's own lifecycle gate`, () => {
      const gated = outcomeBuilder(data);
      if (gated) {
        assert.ok(
          questions.includes(gated.q),
          `this tutorial's content meets the ${data.feature_area} lifecycle gate, so the FAQ should include "${gated.q}", but questions were: ${JSON.stringify(questions)}`,
        );
        assert.ok(
          !questions.includes(GENERIC_OUTCOME_QUESTION),
          `the lifecycle question should replace the generic outcome question, not sit alongside it: ${JSON.stringify(questions)}`,
        );
      } else {
        assert.ok(
          !questions.includes(outcomeBuilder.question),
          `this tutorial's content does NOT meet the ${data.feature_area} lifecycle gate, so the FAQ should NOT include "${outcomeBuilder.question}", but it was present: ${JSON.stringify(questions)}`,
        );
        assert.ok(
          questions.includes(GENERIC_OUTCOME_QUESTION),
          `expected the generic outcome question as the fallback since the lifecycle gate didn't fire, but questions were: ${JSON.stringify(questions)}`,
        );
      }
    });
  }

  // Extra-builder gates: for any feature_area with entries in
  // FEATURE_AREA_EXTRA_BUILDERS, each builder adds its question on top of
  // the base set only when this tutorial's own content meets its gate.
  for (const extraBuilder of FEATURE_AREA_EXTRA_BUILDERS[data.feature_area] || []) {
    check(`${data.tutorial_id} (${data.feature_area}): FAQ "${extraBuilder.question}" question matches the generator's own gate`, () => {
      const gated = extraBuilder(data);
      if (gated) {
        assert.ok(
          questions.includes(gated.q),
          `this tutorial's content meets the gate for "${extraBuilder.question}", so the FAQ should include it, but questions were: ${JSON.stringify(questions)}`,
        );
      } else {
        assert.ok(
          !questions.includes(extraBuilder.question),
          `this tutorial's content does NOT meet the gate for "${extraBuilder.question}", so the FAQ should NOT include it, but it was present: ${JSON.stringify(questions)}`,
        );
      }
    });
  }

  // Narrative ordering: orientation ("Where do I find this...") is an
  // early/context-setting question and must never appear after any
  // outcome-oriented "what happens"/"what should I see" question — those
  // are always the last slot in `buildFaqQuestions()`'s explicit order.
  // The candidate outcome questions are derived from the same
  // OUTCOME_BUILDER_BY_FEATURE_AREA map (plus the generic fallback) rather
  // than a hand-maintained literal list, so a newly-added feature area's
  // outcome question is automatically covered here too.
  check(`${data.tutorial_id}: FAQ orientation question comes before any outcome question`, () => {
    const orientationIdx = questions.indexOf("Where do I find this in BantooBooks?");
    const OUTCOME_QUESTIONS = [
      GENERIC_OUTCOME_QUESTION,
      ...new Set(Object.values(OUTCOME_BUILDER_BY_FEATURE_AREA).map((builder) => builder.question)),
    ];
    assert.ok(orientationIdx !== -1, `expected the orientation question to be present, got: ${JSON.stringify(questions)}`);
    for (const outcomeQ of OUTCOME_QUESTIONS) {
      const outcomeIdx = questions.indexOf(outcomeQ);
      if (outcomeIdx !== -1) {
        assert.ok(
          orientationIdx < outcomeIdx,
          `orientation question (index ${orientationIdx}) should come before "${outcomeQ}" (index ${outcomeIdx}): ${JSON.stringify(questions)}`,
        );
      }
    }
  });

  check(`${data.tutorial_id}: FAQ "Where do I find this?" answer doesn't leak screen_to_show camera-framing text`, () => {
    const orientation = buildFaqQuestions(data).find((q) => q.q === "Where do I find this in BantooBooks?");
    const firstScreen = (data.screen_to_show || [])[0];
    if (orientation && firstScreen) {
      assert.ok(
        !orientation.a.includes(firstScreen.screen),
        `orientation answer quotes screen_to_show verbatim: ${JSON.stringify(orientation.a)}`,
      );
    }
  });
}

// --- YouTube package: chapters must never look truncated, hashtags must be
// a healthy, non-generic-only set, and the description must contain both
// the placeholder-link block and the fixed subscribe CTA.
console.log("\nYouTube package checks:");
for (const t of firstRun.tutorials) {
  const data = tutorialsData.find((d) => d.tutorial_id === t.tutorial_id);
  const youtube = fs.readFileSync(path.join(t.dir, "youtube.md"), "utf8");
  const [, chaptersBlock = ""] = youtube.split("## Chapters");
  const [, hashtagsBlock = ""] = youtube.split("## Hashtags");
  const hashtagsLine = hashtagsBlock.split("## Chapters")[0].trim();
  const [, descriptionBlock = ""] = youtube.split("## Description");
  const description = descriptionBlock.split("## Hashtags")[0];

  check(`${t.tutorial_id}/youtube.md: no chapter title is truncated`, () => {
    assert.ok(!chaptersBlock.includes("…"), "found an ellipsis in the Chapters section — a chapter title looks cut off");
    const chapterLines = chaptersBlock
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^\d+:\d{2}\s/.test(l));
    assert.ok(chapterLines.length >= 3, `expected several chapter lines, got: ${JSON.stringify(chapterLines)}`);
    for (const line of chapterLines) {
      assert.ok(!/\.\.\.$/.test(line), `chapter line looks truncated: "${line}"`);
    }
  });

  check(`${t.tutorial_id}/youtube.md: 5-10 hashtags, not purely generic`, () => {
    const tags = hashtagsLine.split(/\s+/).filter(Boolean);
    assert.ok(tags.length >= 5 && tags.length <= 10, `expected 5-10 hashtags, got ${tags.length}: ${hashtagsLine}`);
    assert.ok(tags.every((tag) => /^#[A-Za-z0-9]+$/.test(tag)), `found a malformed hashtag token: ${hashtagsLine}`);
    const genericOnly = new Set(["#software", "#business", "#tech", "#tips"]);
    const specificTags = tags.filter((tag) => !genericOnly.has(tag.toLowerCase()));
    assert.ok(specificTags.length >= 3, `hashtag set leans too generic: ${hashtagsLine}`);
  });

  check(`${t.tutorial_id}/youtube.md: description has the try-it link, the Help Center placeholder, and the subscribe CTA`, () => {
    assert.ok(description.includes("https://books.bantoobooks.com"), "missing the real 'Try BantooBooks free' link");
    assert.ok(/TODO/.test(description), "missing a clearly-labeled TODO placeholder for the not-yet-published Help Center link");
    assert.ok(
      /subscribe for more BantooBooks tutorials/i.test(description),
      "missing the fixed subscribe call-to-action line",
    );
  });

  check(`${t.tutorial_id}/youtube.md: description naturally reuses 2+ of this tutorial's own SEO keywords`, () => {
    const keywords = extractKeywords([data.title, data.feature_area, data.goal, data.audience], 12);
    const lowerDescription = description.toLowerCase();
    const hits = keywords.filter((k) => lowerDescription.includes(k));
    assert.ok(hits.length >= 2, `expected at least 2 keyword hits in the description, got ${hits.length}: ${JSON.stringify(hits)}`);
  });
}

// --- Shorts/Reels script: the explicit 5-part Hook -> Problem -> Fast
// Solution -> Result -> CTA structure, a 75-115 word count band (~30-45s at
// ~150 wpm), a max-3-item Fast Solution action list, and the exact fixed
// CTA line (never a second, different one appended).
console.log("\nShorts/Reels script checks:");
const SHORTS_SECTION_ORDER = ["## Hook", "## Problem", "## Fast Solution", "## Result", "## CTA"];
const SHORTS_CTA_LINE = "Follow BantooBooks for more business tips.";
for (const t of firstRun.tutorials) {
  const shorts = fs.readFileSync(path.join(t.dir, "shorts.md"), "utf8");

  check(`${t.tutorial_id}/shorts.md: word count is in the 75-115 range`, () => {
    const m = shorts.match(/\*\*Word count:\*\*\s*(\d+)\s*words/);
    assert.ok(m, "couldn't find the '**Word count:** N words' line");
    const count = Number(m[1]);
    assert.ok(count >= 75 && count <= 115, `expected 75-115 words, got ${count}`);
  });

  check(`${t.tutorial_id}/shorts.md: has all 5 labeled sections, in order`, () => {
    const positions = SHORTS_SECTION_ORDER.map((heading) => shorts.indexOf(heading));
    positions.forEach((pos, i) => assert.ok(pos !== -1, `missing section heading "${SHORTS_SECTION_ORDER[i]}"`));
    for (let i = 1; i < positions.length; i++) {
      assert.ok(
        positions[i - 1] < positions[i],
        `sections are out of order: "${SHORTS_SECTION_ORDER[i - 1]}" should come before "${SHORTS_SECTION_ORDER[i]}"`,
      );
    }
  });

  check(`${t.tutorial_id}/shorts.md: CTA section is exactly the fixed universal line`, () => {
    const [, ctaBlock = ""] = shorts.split(/## CTA[^\n]*\n/);
    const ctaLines = ctaBlock
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    assert.deepStrictEqual(ctaLines, [SHORTS_CTA_LINE], `expected exactly one line, "${SHORTS_CTA_LINE}", got: ${JSON.stringify(ctaLines)}`);
  });

  check(`${t.tutorial_id}/shorts.md: Fast Solution has at most 3 action items`, () => {
    const [, afterFastSolution = ""] = shorts.split("## Fast Solution");
    const [fastSolutionBlock = ""] = afterFastSolution.split("## Result");
    const bullets = fastSolutionBlock
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("- "));
    assert.ok(bullets.length >= 1 && bullets.length <= 3, `expected 1-3 action items, got ${bullets.length}: ${JSON.stringify(bullets)}`);
  });
}

// --- LinkedIn post: must open with a real hook (a relatable pain point),
// never a generic feature-announcement opener or the tutorial title
// verbatim, and must carry a tight 3-5 hashtag set.
console.log("\nLinkedIn post checks:");
// Shared with the Facebook checks below — both posts must open with a real
// hook, never a generic "here's a feature" announcement.
const BANNED_GENERIC_OPENERS = [
  /^learn how to/i,
  /^here'?s how to/i,
  /^in this (?:video|tutorial)/i,
  /^this tutorial shows/i,
];
const BANNED_LINKEDIN_OPENERS = BANNED_GENERIC_OPENERS;
for (const t of firstRun.tutorials) {
  const data = tutorialsData.find((d) => d.tutorial_id === t.tutorial_id);
  const linkedin = fs.readFileSync(path.join(t.dir, "linkedin.md"), "utf8");
  const bodyLines = linkedin
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#")); // drop the blank lines and the "# LinkedIn Post — ..." / "#hashtag" lines
  const opener = bodyLines[0] || "";
  const hashtagLine = linkedin
    .split("\n")
    .map((l) => l.trim())
    .reverse()
    .find((l) => l.startsWith("#"));

  check(`${t.tutorial_id}/linkedin.md: opens with a real hook, not a generic announcement`, () => {
    assert.ok(opener.length > 0, "couldn't find an opening line at all");
    for (const re of BANNED_LINKEDIN_OPENERS) {
      assert.ok(!re.test(opener), `opening line matches a banned generic-announcement pattern: "${opener}"`);
    }
    assert.ok(
      opener.toLowerCase() !== data.title.toLowerCase(),
      `opening line is just the tutorial title verbatim: "${opener}"`,
    );
  });

  check(`${t.tutorial_id}/linkedin.md: 3-5 specific hashtags`, () => {
    const tags = (hashtagLine || "").split(/\s+/).filter(Boolean);
    assert.ok(tags.length >= 3 && tags.length <= 5, `expected 3-5 hashtags, got ${tags.length}: ${hashtagLine}`);
    assert.ok(tags.every((tag) => /^#[A-Za-z0-9]+$/.test(tag)), `found a malformed hashtag token: ${hashtagLine}`);
  });

  check(`${t.tutorial_id}/linkedin.md: does not quote the raw goal field verbatim`, () => {
    assert.ok(
      data.goal && !linkedin.includes(data.goal),
      `found the literal goal field spliced verbatim into the post: ${JSON.stringify(data.goal)}`,
    );
  });
}

// --- Facebook post: conversational, problem-first, short (<=2-sentence)
// paragraphs, never a generic announcement opener, 3-5 hashtags, and no
// verbatim `goal` splice — same discipline as the LinkedIn checks above,
// tuned for Facebook's shorter, more casual, mobile-friendly voice.
console.log("\nFacebook post checks:");
function countSentences(text) {
  const matches = text.match(/[^.!?]+[.!?]+/g);
  if (matches) return matches.length;
  return text.trim().length > 0 ? 1 : 0;
}
function stripLeadingEmoji(text) {
  return text.replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, "");
}
for (const t of firstRun.tutorials) {
  const data = tutorialsData.find((d) => d.tutorial_id === t.tutorial_id);
  const facebook = fs.readFileSync(path.join(t.dir, "facebook.md"), "utf8");
  const paragraphs = facebook
    .split("\n\n")
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !p.startsWith("#")); // drop the "# Facebook Post — ..." heading and the hashtag line
  const opener = stripLeadingEmoji(paragraphs[0] || "");
  const hashtagLine = facebook
    .split("\n")
    .map((l) => l.trim())
    .reverse()
    .find((l) => l.startsWith("#"));

  check(`${t.tutorial_id}/facebook.md: opens with a real hook, not a generic announcement`, () => {
    assert.ok(opener.length > 0, "couldn't find an opening line at all");
    for (const re of BANNED_GENERIC_OPENERS) {
      assert.ok(!re.test(opener), `opening line matches a banned generic-announcement pattern: "${opener}"`);
    }
    assert.ok(
      opener.toLowerCase() !== data.title.toLowerCase(),
      `opening line is just the tutorial title verbatim: "${opener}"`,
    );
  });

  check(`${t.tutorial_id}/facebook.md: every paragraph is at most 2 sentences (short, phone-friendly)`, () => {
    for (const p of paragraphs) {
      const count = countSentences(p);
      assert.ok(count <= 2, `paragraph has ${count} sentences, expected at most 2: "${p}"`);
    }
  });

  check(`${t.tutorial_id}/facebook.md: 3-5 hashtags`, () => {
    const tags = (hashtagLine || "").split(/\s+/).filter(Boolean);
    assert.ok(tags.length >= 3 && tags.length <= 5, `expected 3-5 hashtags, got ${tags.length}: ${hashtagLine}`);
    assert.ok(tags.every((tag) => /^#[A-Za-z0-9]+$/.test(tag)), `found a malformed hashtag token: ${hashtagLine}`);
  });

  check(`${t.tutorial_id}/facebook.md: does not quote the raw goal field verbatim`, () => {
    assert.ok(
      data.goal && !facebook.includes(data.goal),
      `found the literal goal field spliced verbatim into the post: ${JSON.stringify(data.goal)}`,
    );
  });
}

// --- seo.json: the enterprise-grade SEO/structured-data package —
// length-aware meta title/description, tiered keyword phrases with no
// cross-tier duplicates, well-formed JSON-LD, and no silently-blank
// placeholder fields anywhere.
console.log("\nSEO package checks:");
const seoByTutorial = {};
const seoMetaTitles = new Set();
for (const t of firstRun.tutorials) {
  seoByTutorial[t.tutorial_id] = JSON.parse(fs.readFileSync(path.join(t.dir, "seo.json"), "utf8"));
}

/** Recursively asserts no string is empty/whitespace-only and no array is empty, anywhere in `value` (every placeholder must instead contain "TODO"). */
function assertNoBlankFields(value, label) {
  if (Array.isArray(value)) {
    assert.ok(value.length > 0, `${label}: found an empty array`);
    value.forEach((v, i) => assertNoBlankFields(v, `${label}[${i}]`));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) assertNoBlankFields(v, `${label}.${k}`);
  } else if (typeof value === "string") {
    assert.ok(value.trim().length > 0, `${label}: found an empty/blank string`);
  }
}

for (const [tutorialId, seo] of Object.entries(seoByTutorial)) {
  check(`${tutorialId}/seo.json: meta title is 50-60 characters`, () => {
    assert.ok(
      seo.metaTitle.length >= 50 && seo.metaTitle.length <= 60,
      `expected 50-60 chars, got ${seo.metaTitle.length}: ${JSON.stringify(seo.metaTitle)}`,
    );
  });

  check(`${tutorialId}/seo.json: meta description is 140-160 characters and not truncated`, () => {
    assert.ok(
      seo.metaDescription.length >= 140 && seo.metaDescription.length <= 160,
      `expected 140-160 chars, got ${seo.metaDescription.length}: ${JSON.stringify(seo.metaDescription)}`,
    );
    assert.ok(!seo.metaDescription.includes("…"), "meta description contains a truncation ellipsis");
    assert.ok(/[.!?]$/.test(seo.metaDescription.trim()), "meta description doesn't end on a complete sentence");
  });

  check(`${tutorialId}/seo.json: keyword tiers are each 3-5 items with no cross-tier duplicates`, () => {
    for (const tier of ["secondaryKeywords", "longTailKeywords", "relatedSearchPhrases"]) {
      assert.ok(Array.isArray(seo[tier]) && seo[tier].length >= 3 && seo[tier].length <= 5, `${tier}: expected 3-5 items, got ${JSON.stringify(seo[tier])}`);
    }
    const all = [seo.primaryKeyword, ...seo.secondaryKeywords, ...seo.longTailKeywords, ...seo.relatedSearchPhrases].map((s) =>
      s.toLowerCase(),
    );
    const seen = new Set();
    const dups = all.filter((s) => (seen.has(s) ? true : (seen.add(s), false)));
    assert.deepStrictEqual(dups, [], `found duplicate phrase(s) across keyword tiers: ${JSON.stringify(dups)}`);
  });

  check(`${tutorialId}/seo.json: jsonLd is well-formed and carries the HowTo extensions`, () => {
    const serialized = JSON.stringify(seo.jsonLd);
    const reparsed = JSON.parse(serialized); // throws if not valid JSON
    assert.strictEqual(reparsed["@type"], "HowTo");
    assert.ok(/^PT/.test(seo.jsonLd.totalTime), `totalTime isn't an ISO 8601 duration: ${seo.jsonLd.totalTime}`);
    assert.ok(seo.jsonLd.supply.length > 0, "supply[] is empty");
    assert.ok(seo.jsonLd.tool.length > 0, "tool[] is empty");
    assert.strictEqual(seo.jsonLd.publisher.name, "BantooBooks");
    assert.ok(seo.jsonLd.step.length > 0, "step[] is empty — the original HowTo mapping got lost in the rewrite");
  });

  check(`${tutorialId}/seo.json: jsonLd.about is a proper schema.org Thing object, never a bare string`, () => {
    assert.strictEqual(typeof seo.jsonLd.about, "object", `expected an object, got: ${JSON.stringify(seo.jsonLd.about)}`);
    assert.ok(!Array.isArray(seo.jsonLd.about), "jsonLd.about should be an object, not an array");
    assert.ok(typeof seo.jsonLd.about["@type"] === "string" && seo.jsonLd.about["@type"].length > 0, "jsonLd.about is missing @type");
    assert.ok(typeof seo.jsonLd.about.name === "string" && seo.jsonLd.about.name.length > 0, "jsonLd.about is missing name");
  });

  check(`${tutorialId}/seo.json: secondaryKeywords has no bare UI-instruction fragments (e.g. "Enter Name")`, () => {
    const IMPERATIVE_FRAGMENT_RE = /^(Enter|Confirm|Check|Open|Select|Set|Skip|Click|Type)\s+\S+$/i;
    for (const phrase of seo.secondaryKeywords) {
      assert.ok(
        !IMPERATIVE_FRAGMENT_RE.test(phrase),
        `secondaryKeywords contains an instructional UI fragment, not a search-style phrase: "${phrase}"`,
      );
    }
  });

  check(`${tutorialId}/seo.json: no blank placeholder fields (TODOs must say so explicitly)`, () => {
    assertNoBlankFields(seo, "seo.json");
  });

  check(`${tutorialId}/seo.json: openGraph/twitterCard/canonicalUrl are internally consistent`, () => {
    assert.strictEqual(seo.openGraph.url, seo.canonicalUrl, "openGraph.url should reuse canonicalUrl, not a second invented URL");
    assert.strictEqual(seo.jsonLd.url, seo.canonicalUrl, "jsonLd.url should reuse canonicalUrl, not a second invented URL");
    assert.strictEqual(seo.twitterCard.card, "summary_large_image");
  });
}

check("seo.json: meta titles are unique across all generated tutorials", () => {
  const titles = Object.values(seoByTutorial).map((seo) => seo.metaTitle);
  assert.strictEqual(new Set(titles).size, titles.length, `found duplicate meta titles: ${JSON.stringify(titles)}`);
});

// --- Email: a warm, under-250-word (body-only) Customer Success note
// carrying all 3 required links — the help article using the real
// `canonicalUrl` (reusing seo.json's, not a second invented URL), the video
// as a clearly-labeled TODO placeholder, and at least one related-tutorial
// link whenever seo.json's own `relatedTutorials` has any — plus a
// consistent sign-off across every tutorial.
console.log("\nEmail checks:");
const EMAIL_SIGNOFF_LINE = "Happy bookkeeping,";
for (const t of firstRun.tutorials) {
  const email = fs.readFileSync(path.join(t.dir, "email.md"), "utf8");
  const seo = seoByTutorial[t.tutorial_id];
  const [, bodyBlock = ""] = email.split("## Body");

  check(`${t.tutorial_id}/email.md: body word count is under 250`, () => {
    const m = bodyBlock.match(/\*\*Word count:\*\*\s*(\d+)\s*words/);
    assert.ok(m, "couldn't find the '**Word count:** N words' line");
    const count = Number(m[1]);
    assert.ok(count < 250, `expected under 250 words, got ${count}`);
  });

  check(`${t.tutorial_id}/email.md: help article link uses the real canonicalUrl from seo.json`, () => {
    assert.ok(seo && seo.canonicalUrl, "no canonicalUrl found in this tutorial's seo.json to compare against");
    assert.ok(email.includes(seo.canonicalUrl), `expected to find seo.json's canonicalUrl (${seo.canonicalUrl}) in the email`);
  });

  check(`${t.tutorial_id}/email.md: video link is a clearly-labeled TODO placeholder`, () => {
    assert.ok(/Watch the video:\*\*\s*TODO/.test(email), "missing a clearly-labeled TODO placeholder for the video link");
  });

  check(`${t.tutorial_id}/email.md: has a related-tutorial link whenever seo.json lists any`, () => {
    const relatedTutorials = (seo && seo.relatedTutorials) || [];
    if (relatedTutorials.length > 0) {
      assert.ok(email.includes("You might also like"), "seo.json has relatedTutorials but the email has no related-tutorials section");
      const hits = relatedTutorials.filter((rt) => email.includes(rt.canonicalUrl));
      assert.ok(hits.length >= 1, "none of seo.json's relatedTutorials URLs appear in the email");
    }
  });

  check(`${t.tutorial_id}/email.md: has the consistent sign-off line`, () => {
    assert.ok(email.includes(EMAIL_SIGNOFF_LINE), `missing the consistent sign-off line "${EMAIL_SIGNOFF_LINE}"`);
    assert.ok(email.includes("The BantooBooks Team"), 'missing "The BantooBooks Team" in the sign-off');
  });
}

const totalFiles = firstRun.tutorials.reduce((sum, t) => sum + t.files.length, 0);
check(`total generated file count is ${firstRun.tutorials.length} tutorials × 12 files`, () => {
  assert.strictEqual(totalFiles, firstRun.tutorials.length * 12);
});

// --- Tutorial-level marketing-copy overrides: 3 Inventory-area tutorials
// (record-a-goods-receipt, adjust-inventory, write-off-inventory) are about
// receiving/correcting/writing off stock, not about stockouts, so they get
// their own `*_BY_TUTORIAL_ID` override entries in lib/builders.js instead
// of inheriting `Inventory`'s generic "running out of stock"/"best-seller"
// story. This section proves two things at once, so the override layer
// can't silently regress in either direction:
//   1. the 3 overridden tutorials no longer contain the generic Inventory
//      stockout language in the channels that were overridden, and
//   2. the *other* 2 Inventory tutorials (add-inventory-item,
//      respond-to-low-stock-reorder-suggestion) still correctly fall
//      through to that same generic story, completely unaffected — proving
//      this is an additive override layer, not a replacement that could
//      have accidentally broken the feature-area fallback for everyone else.
console.log("\nTutorial-level story overrides (Inventory sub-workflow specificity):");
const OVERRIDDEN_INVENTORY_TUTORIALS = ["record-a-goods-receipt", "adjust-inventory", "write-off-inventory"];
const FALLBACK_INVENTORY_TUTORIALS = ["add-inventory-item", "respond-to-low-stock-reorder-suggestion"];
// Per-channel "generic tell" — the literal phrase(s) that only ever appear
// via the shared `Inventory` feature-area story/benefits, never via a
// tutorial_id-level override. linkedin.md/facebook.md/shorts.md all share
// the same "running out of stock"/stockout vocabulary; email.md's generic
// `whyLead` sentence never uses that vocabulary (it's a different generic
// sentence about "what's left on your shelves"), so its actual generic
// tell is the mismatched `EMAIL_BENEFITS_BY_FEATURE_AREA.Inventory` bullet
// instead — using the same stockout regex for email would be testing for
// something that was never there even in the correct fallback case.
const GENERIC_TELLS_BY_FILE = {
  "linkedin.md": [/running out of stock/i, /best-?seller/i, /top seller/i, /over-order/i],
  "facebook.md": [/running out of stock/i, /best-?seller/i, /top seller/i, /over-order/i],
  "shorts.md": [/running out of stock/i, /best-?seller/i, /top seller/i, /over-order/i],
  "email.md": [/Add a new item in under a minute/i],
};

for (const t of firstRun.tutorials) {
  if (!OVERRIDDEN_INVENTORY_TUTORIALS.includes(t.tutorial_id) && !FALLBACK_INVENTORY_TUTORIALS.includes(t.tutorial_id)) continue;

  const isOverridden = OVERRIDDEN_INVENTORY_TUTORIALS.includes(t.tutorial_id);
  for (const [file, tells] of Object.entries(GENERIC_TELLS_BY_FILE)) {
    const content = fs.readFileSync(path.join(t.dir, file), "utf8");
    const foundTell = tells.find((re) => re.test(content));
    check(
      `${t.tutorial_id}/${file}: ${isOverridden ? "no longer uses" : "still correctly uses"} the generic Inventory story`,
      () => {
        if (isOverridden) {
          assert.ok(
            !foundTell,
            `expected the tutorial_id-level override to have replaced the generic Inventory story, but found "${foundTell}" in ${file}`,
          );
        } else {
          assert.ok(
            foundTell,
            `expected this tutorial (no override entry) to still fall back to the generic Inventory story, but none of ${tells} matched in ${file}`,
          );
        }
      },
    );
  }
}

// --- 3: idempotency — regenerating with a different candidate timestamp,
// when nothing about the tutorial's content actually changed, must not
// touch a single byte of any file, including metadata.json.generatedAt
// (which is now preserved rather than overwritten — see resolveMetadata()).
console.log("\nIdempotency check (regenerate twice with different candidate timestamps, no real content change):");
const TS_A = "2020-01-01T00:00:00.000Z";
const TS_B = "2030-06-15T12:34:56.000Z";

const runA = generate({ generatedAtIso: TS_A });
const treeA = readTree(runA.tutorials.map((t) => ({ tutorial_id: t.tutorial_id, dir: t.dir })));

const runB = generate({ generatedAtIso: TS_B });
const treeB = readTree(runB.tutorials.map((t) => ({ tutorial_id: t.tutorial_id, dir: t.dir })));

check("both runs produced the same set of tutorials", () => {
  assert.deepStrictEqual(Object.keys(treeA).sort(), Object.keys(treeB).sort());
});

let comparedFiles = 0;
for (const tutorialId of Object.keys(treeA)) {
  for (const file of Object.keys(treeA[tutorialId])) {
    comparedFiles++;
    check(`${tutorialId}/${file}: byte-identical across both runs (including generatedAt for metadata.json)`, () => {
      assert.strictEqual(treeA[tutorialId][file], treeB[tutorialId][file]);
      assert.strictEqual(treeA[tutorialId][file], treeOriginal[tutorialId][file]);
    });
  }
}
console.log(`  (compared ${comparedFiles} files across both runs)`);

// --- 4: a genuine content change DOES update generatedAt, and that new
// value then sticks (isn't itself immediately overwritten by a further
// no-op regeneration). Simulated by tampering with one tutorial's on-disk
// metadata.json directly.
console.log("\ngeneratedAt update check (simulated real content change):");
const TS_C = "2021-05-05T00:00:00.000Z";
const TS_D = "2032-09-09T09:09:09.000Z";
const sample = runB.tutorials[0];
const sampleMetadataPath = path.join(sample.dir, "metadata.json");

const tampered = JSON.parse(fs.readFileSync(sampleMetadataPath, "utf8"));
tampered.suggestedCTA = "(tampered by verify.js to simulate a real content change)";
fs.writeFileSync(sampleMetadataPath, JSON.stringify(tampered, null, 2) + "\n", "utf8");

generate({ generatedAtIso: TS_C });
check(`${sample.tutorial_id}/metadata.json: generatedAt updates when on-disk content actually differs`, () => {
  const after = JSON.parse(fs.readFileSync(sampleMetadataPath, "utf8"));
  assert.strictEqual(after.generatedAt, TS_C, "expected the freshly-injected timestamp to be used");
  assert.notStrictEqual(after.suggestedCTA, tampered.suggestedCTA, "expected the tampered field to be rebuilt, not preserved");
});

generate({ generatedAtIso: TS_D });
check(`${sample.tutorial_id}/metadata.json: generatedAt is preserved once content matches again`, () => {
  const after = JSON.parse(fs.readFileSync(sampleMetadataPath, "utf8"));
  assert.strictEqual(after.generatedAt, TS_C, "expected TS_C to still be preserved, not overwritten with TS_D");
});

// --- Restore the exact original bytes captured right after the first real
// run, rather than relying on another `generate()` call — now that
// generatedAt is idempotent, a plain re-run would happily preserve whatever
// fake/tampered state checks 3-4 left behind instead of producing a fresh
// real timestamp.
writeTree(firstRunDirs, treeOriginal);
console.log("\nRestored generated/tutorials/ to its original (real-timestamp, untampered) state.");

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
