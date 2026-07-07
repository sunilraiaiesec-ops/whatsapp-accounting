"use strict";

/**
 * Pure functions that turn one parsed tutorial's frontmatter (`data`) into
 * the text/JSON of each generated asset. Every function here is a pure
 * function of `data` (plus, for metadata.json only, an explicit timestamp
 * argument) — no I/O, no randomness, no clock reads except where noted.
 * That's what makes two runs of the generator byte-identical.
 */

const {
  wordCount,
  estimateSeconds,
  formatMmSs,
  truncate,
  truncateAtWordBoundary,
  extractKeywords,
  toHashtag,
  splitParagraphs,
  splitGuiddeNotes,
  demoteHeadings,
  stripStepsSection,
} = require("./text-utils");

// fs/path/parseFrontmatter are used ONLY by seo.json's `relatedTutorials`
// cross-referencing (see `getTutorialIndex()` below), which needs every
// *other* tutorial's title/canonicalUrl, not just the one `buildSeo()` was
// called with. This re-reads tutorials/*.md independently of
// generate-tutorial-assets.js's own discovery loop, so that script's
// architecture (how it iterates tutorials and writes files) is untouched.
const fs = require("fs");
const path = require("path");
const { parseFrontmatter } = require("./frontmatter");

// ---------------------------------------------------------------------------
// (1) guidde.md — Guidde recording checklist
// ---------------------------------------------------------------------------
function buildGuidde(data) {
  const prep = splitGuiddeNotes(data.guidde_recording_notes);
  const steps = data.step_by_step_actions || [];
  const screens = indexByStep(data.screen_to_show, "screen");
  const highlights = indexByStep(data.on_screen_highlights, "highlight");

  const lines = [];
  lines.push(`# Guidde Recording Checklist — ${data.title}`);
  lines.push("");
  lines.push(
    `**Tutorial:** \`${data.tutorial_id}\` · **Feature area:** ${data.feature_area} · **Demo org:** ${data.demo_company}`,
  );
  lines.push("");
  lines.push(
    "> Source: `guidde_recording_notes` + `step_by_step_actions` + `screen_to_show` + `on_screen_highlights` from the tutorial frontmatter. Tick each box while you record.",
  );
  lines.push("");
  lines.push("## Before you record");
  lines.push("");
  for (const item of prep) lines.push(`- [ ] ${item}`);
  lines.push("");
  lines.push("## Recording steps");
  lines.push("");
  for (const s of steps) {
    lines.push(`### Step ${s.step}`);
    lines.push("");
    lines.push(`- [ ] **Do:** ${s.action}`);
    if (screens.has(s.step)) lines.push(`- [ ] **Screen on camera:** ${screens.get(s.step)}`);
    if (highlights.has(s.step)) lines.push(`- [ ] **Highlight/zoom:** ${highlights.get(s.step)}`);
    lines.push("");
  }
  lines.push("## After you record");
  lines.push("");
  lines.push(`- [ ] Confirm the final screen matches the expected result: ${data.expected_result}`);
  lines.push("- [ ] Trim dead air at the start/end and export.");
  lines.push("");
  return lines.join("\n");
}

function indexByStep(arr, field) {
  const map = new Map();
  for (const item of arr || []) map.set(item.step, item[field]);
  return map;
}

// ---------------------------------------------------------------------------
// (2) synthesia.md — Synthesia narration script, scene-numbered with a
// words-per-minute timing estimate (explicitly labeled as an estimate).
// ---------------------------------------------------------------------------
const SYNTHESIA_WPM = 150;
function buildSynthesia(data) {
  const scenes = splitParagraphs(data.synthesia_script);
  const totalWords = scenes.reduce((sum, s) => sum + wordCount(s), 0);
  const totalSeconds = estimateSeconds(totalWords, SYNTHESIA_WPM);

  const lines = [];
  lines.push(`# Synthesia Narration Script — ${data.title}`);
  lines.push("");
  lines.push(
    `**Estimated duration:** ~${formatMmSs(totalSeconds)} (${totalWords} words at ~${SYNTHESIA_WPM} wpm) — *estimate only; actual Synthesia avatar pacing will vary.*`,
  );
  lines.push("");
  lines.push("> Source: `synthesia_script`, split into scenes on paragraph breaks. No visual-only references — this narration must stand alone.");
  lines.push("");

  let cursor = 0;
  scenes.forEach((scene, idx) => {
    const words = wordCount(scene);
    const start = cursor;
    const dur = estimateSeconds(words, SYNTHESIA_WPM);
    cursor += dur;
    lines.push(`## Scene ${idx + 1} (~${formatMmSs(start)}–${formatMmSs(cursor)}, ~${words} words)`);
    lines.push("");
    lines.push(scene);
    lines.push("");
  });

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// (3) help.md — Help Center Markdown
// ---------------------------------------------------------------------------
function buildHelp(data) {
  const lines = [];
  lines.push(`# ${data.title}`);
  lines.push("");
  lines.push(`_Help Center article · ${data.feature_area}_`);
  lines.push("");
  lines.push(`**Goal:** ${data.goal}`);
  lines.push("");
  lines.push(`**Who this is for:** ${data.audience}`);
  lines.push("");
  lines.push("## Before you start");
  lines.push("");
  for (const p of data.prerequisites || []) lines.push(`- ${p}`);
  lines.push("");
  lines.push("## Steps");
  lines.push("");
  for (const s of data.step_by_step_actions || []) lines.push(`${s.step}. ${s.action}`);
  lines.push("");
  const testDataEntries = Object.entries(data.test_data || {});
  if (testDataEntries.length > 0) {
    lines.push("## Sample values used in this walkthrough");
    lines.push("");
    lines.push(`Recorded in the **${data.demo_company}** demo organization, using these sample values:`);
    lines.push("");
    for (const [k, v] of testDataEntries) lines.push(`- **${k}:** ${v === "" ? "_(left blank)_" : v}`);
    lines.push("");
  }
  lines.push("## Expected result");
  lines.push("");
  lines.push(data.expected_result);
  lines.push("");
  lines.push("## Full article");
  lines.push("");
  // `help_center_article` has its own "## Steps" narrative, but that would
  // just repeat the numbered list above in prose form — drop it and keep
  // only the "why this matters" intro and the closing "Tip".
  lines.push(demoteHeadings(stripStepsSection(data.help_center_article), 1));
  lines.push("");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// (4) faq.md — 3-8 Q&As, phrased like real customer questions. Provenance
// (which frontmatter fields feed which question) lives only in the code
// comments below — the rendered output has zero dev-facing artifacts.
// ---------------------------------------------------------------------------

// Derived from: audience + goal.
function faqFromAudience(data) {
  return {
    q: "Who is this tutorial for?",
    a: `This is written for ${lower(data.audience)}. By the end, you'll be able to: ${lower(data.goal)}`,
  };
}
// Derived from: prerequisites.
function faqFromPrerequisites(data) {
  const items = data.prerequisites || [];
  const a =
    items.length === 1
      ? `Just one thing: ${lower(items[0])}`
      : `A few things: ${items.map((item) => stripTrailingPeriod(lower(item))).join("; ")}.`;
  return { q: "What do I need before I start?", a };
}
/**
 * Derived from: step_by_step_actions[0] + the total step count. Reframed
 * from the old "How many steps are involved?" (Step 1 .../Final step ...)
 * into an outcome-oriented "how do I begin" question — real customers ask
 * where to click first, not for a step-count. Only quotes the first step's
 * *button/control label* (via the same quoted-string extraction used
 * elsewhere in this file), not its full sentence, since that full sentence
 * is also `help.md`'s numbered step 1 verbatim — naming just the control
 * keeps this a distinct, shorter answer rather than a duplicate.
 */
function faqFromGettingStarted(data) {
  const steps = data.step_by_step_actions || [];
  const first = steps[0];
  if (!first) return null;
  const label = firstQuotedLabel(first.action);
  const a = label
    ? `Start from **${label}** — you'll spot it right on your dashboard. From there, BantooBooks walks you through the rest of the form; it's a quick, ${steps.length}-step walkthrough.`
    : `${stripTrailingPeriod(
        first.action,
      )}. From there, BantooBooks walks you through the rest of the form — it's a quick, ${steps.length}-step walkthrough.`;
  return { q: "How do I get started?", a };
}
/**
 * Derived from: expected_result. `help.md` already quotes `expected_result`
 * in full (often 2+ sentences) under "## Expected result", so this
 * deliberately only takes the first sentence — a shorter, still-complete
 * gist rather than the whole field — and introduces it differently, so the
 * FAQ reads as a quick answer rather than a re-print of that section.
 */
/**
 * The generic closing/outcome question, used as the fallback whenever a
 * feature area either has no `OUTCOME_BUILDER_BY_FEATURE_AREA` entry, or
 * has one but this particular tutorial's own content doesn't meet that
 * builder's gating condition. Exported as a named constant (rather than
 * left as an inline literal) so verify.js can assert presence/absence of
 * *this exact* fallback without hardcoding a second copy of the string.
 */
const GENERIC_OUTCOME_QUESTION = "What should I see when I'm done?";
function faqFromExpectedResult(data) {
  const gist = firstSentence(data.expected_result);
  return { q: GENERIC_OUTCOME_QUESTION, a: `The short version: ${lower(gist)}` };
}
/**
 * Derived from: feature_area + step_by_step_actions[0]'s button/control
 * label. Deliberately does NOT quote `screen_to_show` (that field is
 * video-production/camera-framing language — e.g. "The BantooBooks
 * dashboard (Home), showing the greeting, the category pills, and the
 * 'Create actions' row" — which reads like a shot list, not something a
 * real help-center FAQ would say to an end user). Instead names the plain
 * app section plus the real on-screen shortcut label, reusing the same
 * quoted-first-label extraction `faqFromGettingStarted()` uses, so this
 * generalizes to any tutorial's real button text rather than a hardcoded
 * per-feature-area shortcut name.
 */
function faqFromFeatureArea(data) {
  const steps = data.step_by_step_actions || [];
  const shortcutLabel = steps[0] ? firstQuotedLabel(steps[0].action) : null;
  const shortcut = shortcutLabel ? `, or the "${shortcutLabel}" shortcut on your dashboard` : "";
  return {
    q: "Where do I find this in BantooBooks?",
    a: `Look for it in the **${data.feature_area}** section — you can get there from the sidebar${shortcut}.`,
  };
}
/**
 * Optional question, only included when a step actually mentions the
 * duplicate-contact-detection flow (case-insensitive substring match on
 * "existing" or "duplicate"). The entity noun in the question itself
 * ("duplicate customer" vs "duplicate supplier") comes from
 * `inferEntityNoun()` below, derived from tutorial_id/title/feature_area —
 * never hardcoded per tutorial. Tutorials with no such step (e.g. inventory
 * items, sales invoices, receipts) simply don't get this question —
 * returning `null` here tells `buildFaq()` to skip it. The answer names the
 * two action buttons rather than quoting the step's full sentence (which is
 * also `help.md`'s numbered step verbatim), so this reads as its own,
 * shorter take rather than a repeat.
 */
function faqFromDuplicateHandling(data) {
  const steps = data.step_by_step_actions || [];
  const match = steps.find((s) => /existing|duplicate/i.test(s.action || ""));
  if (!match) return null;
  const noun = inferEntityNoun(data) || "entry";
  const buttons = [...(match.action || "").matchAll(/"([^"]+)"/g)]
    .map((m) => m[1])
    .filter((label) => /^(use|create|keep|merge)/i.test(label));
  const choices =
    buttons.length >= 2
      ? ` You'll get two choices: **${buttons[0]}** if it's really the same one, or **${buttons[1]}** if it's genuinely different.`
      : "";
  return {
    q: `What happens if BantooBooks finds a duplicate ${noun}?`,
    a: `Before saving, BantooBooks checks whether you might already have this ${noun} on file.${choices}`,
  };
}
/**
 * New: "Can I edit this later?" — generic-but-honest answer (we don't have
 * verified per-entity UI copy for every tutorial, so this deliberately
 * avoids naming a specific button/screen). The entity noun again comes from
 * `inferEntityNoun()`; if it can't be confidently inferred, the question is
 * skipped rather than reading as generic filler.
 */
function faqFromEditability(data) {
  const noun = inferEntityNoun(data);
  if (!noun) return null;
  return {
    q: `Can I edit the ${noun} later?`,
    a: `Yes — nothing here is locked in. You can always go back to this ${noun}'s own record later and update the details if something changes.`,
  };
}
/**
 * New: "Which fields are required?" — derived from `test_data` plus
 * language cues ("optional", "leave ... blank", "already shows", "if you
 * have", a "+ X / Y / Z" reveal-more-fields control, etc.) found in
 * `step_by_step_actions`, `voiceover_script`, `help_center_article`, and
 * `synthesia_script`. See `classifyTestDataFields()` below. Only rendered
 * when we can point to at least one field that's genuinely optional or
 * auto-filled — otherwise the contrast isn't informative, so we skip it
 * rather than pad the FAQ with a non-answer.
 */
function faqFromRequiredFields(data) {
  const { required, optional, autoDefault } = classifyTestDataFields(data);
  if (required.length === 0 || (optional.length === 0 && autoDefault.length === 0)) return null;

  const requiredLabels = joinNatural(required.map((f) => `**${f.label}**`));
  const verb = required.length === 1 ? "is" : "are";
  const noun = required.length === 1 ? "thing" : "things";
  let a = `${requiredLabels} ${verb} really the only ${noun} you need to fill in yourself.`;

  if (autoDefault.length > 0) {
    const autoLabels = joinNatural(autoDefault.map((f) => `**${f.label}**`));
    a += ` BantooBooks sets ${autoLabels} automatically, so you don't have to touch ${
      autoDefault.length === 1 ? "it" : "them"
    }.`;
  }
  if (optional.length > 0) {
    const optLabels = joinNatural(optional.map((f) => `**${f.label}**`));
    a += ` Everything else (${optLabels}) is optional — add it now if it's handy, or come back and fill it in later.`;
  }

  return { q: "Which fields are required?", a };
}
/**
 * New: "Can I add [field(s)] later?" for the tutorial's most *notable*
 * optional field(s) (from `classifyTestDataFields()`). Generic geography
 * fields (country/city/...) are deprioritized — most users already assume
 * those are skippable — in favor of more distinctive fields (WhatsApp,
 * Barcode, Reference, ...) a real user is more likely to specifically
 * wonder about. Picks the top 1-2, in the tutorial's own `test_data` order,
 * and is skipped entirely when a tutorial has no optional fields at all.
 */
const LOW_NOTABILITY_FIELD_RE = /^(country|city|state|region|province|address)$/i;
const POSSESSIVE_BY_ENTITY_NOUN = { customer: "their", supplier: "their" };
function faqFromNotableOptional(data) {
  const { optional } = classifyTestDataFields(data);
  if (optional.length === 0) return null;
  const ranked = [...optional].sort(
    (a, b) => (LOW_NOTABILITY_FIELD_RE.test(a.key) ? 1 : 0) - (LOW_NOTABILITY_FIELD_RE.test(b.key) ? 1 : 0),
  );
  const picked = ranked.slice(0, 2).map((f) => f.label);
  const noun = inferEntityNoun(data) || "entry";
  const possessive = POSSESSIVE_BY_ENTITY_NOUN[noun] || "the";
  const fieldPhrase = picked.length === 1 ? `${possessive} ${picked[0]}` : `${possessive} ${picked[0]} or ${picked[1]}`;
  const itThem = picked.length === 1 ? "it" : "them";
  return {
    q: `Can I add ${fieldPhrase} later?`,
    a: `Yes — skip ${itThem} for now if you'd rather. You can always come back to this ${noun}'s own record afterward and fill ${itThem} in then.`,
  };
}

// ---------------------------------------------------------------------------
// Feature-area-aware question SELECTION. These functions answer the same
// kind of "what happens" question as `faqFromExpectedResult()`, just framed
// around the thing a user in *that* feature area is most likely to actually
// wonder about (invoice lifecycle, stock-on-hand, receipt/payment
// terminology, ...). Each one still self-gates on concrete textual evidence
// in the tutorial's own `expected_result`/`help_center_article` — so mapping
// the "wrong" builder to a feature area is harmless (it returns `null` and
// the generic fallback below takes over) rather than fabricating a claim.
// ---------------------------------------------------------------------------

/**
 * Sales & Invoicing variant of the "what happens" question.
 *
 * `.question` is attached to the function itself (not just embedded in the
 * returned object) so callers — namely verify.js — can learn the fixed
 * question text this builder would produce *even when it gates itself off*
 * (returns null), without having to hardcode a second copy of the string
 * or fake up trigger data just to peek at it. The gating condition itself
 * (the regex test below) still lives in exactly one place: here.
 */
function faqFromInvoiceLifecycle(data) {
  const corpus = `${data.expected_result || ""} ${data.help_center_article || ""}`;
  if (!/unpaid/i.test(corpus)) return null;
  return {
    q: faqFromInvoiceLifecycle.question,
    a: "It's saved with status **Unpaid** — that's expected, not an error. As soon as your customer pays (in full or in part) and you record a receipt for them, BantooBooks updates the status for you automatically.",
  };
}
faqFromInvoiceLifecycle.question = "What happens after I save the invoice?";
/** Purchasing variant of the "what happens" question — a bill owed to a supplier, not a sales invoice, so uses "payment" rather than "receipt" as the settling action. */
function faqFromBillLifecycle(data) {
  const corpus = `${data.expected_result || ""} ${data.help_center_article || ""}`;
  if (!/unpaid/i.test(corpus)) return null;
  return {
    q: faqFromBillLifecycle.question,
    a: "It's saved with status **Unpaid** — that's expected, not an error. As soon as you pay your supplier (in full or in part) and record a payment for them, BantooBooks updates the status for you automatically.",
  };
}
faqFromBillLifecycle.question = "What happens after I save the bill?";
/** Receipts variant of the "what happens" question. */
function faqFromReceiptSettlement(data) {
  const corpus = `${data.expected_result || ""} ${data.help_center_article || ""}`;
  if (!/unpaid/i.test(corpus) || !/\bpaid\b/i.test(corpus)) return null;
  return {
    q: faqFromReceiptSettlement.question,
    a: "If the amount matches an outstanding invoice exactly, yes — BantooBooks flips that invoice's status to **Paid** the moment you save the receipt, with nothing extra for you to do.",
  };
}
faqFromReceiptSettlement.question = "Does this automatically mark the invoice as paid?";
/** Inventory extra: whether stock is on hand immediately after adding an item. */
function faqFromStockStartsAtZero(data) {
  const corpus = `${data.expected_result || ""} ${data.help_center_article || ""}`;
  if (!/\b0\s+units?\b/i.test(corpus)) return null;
  const noun = inferEntityNoun(data) || "item";
  return {
    q: faqFromStockStartsAtZero.question,
    a: `Not yet — a brand-new ${noun} always starts at 0 units on hand. BantooBooks only starts tracking real quantity once you actually receive stock for it from a supplier.`,
  };
}
faqFromStockStartsAtZero.question = "Does adding this item put stock in my inventory right away?";
/**
 * Receipts/Payments extra: surfaces the receipt-vs-payment terminology
 * distinction as its own question, since it's a common real-world point of
 * confusion. Only fires when the tutorial's own `goal`/`help_center_article`
 * genuinely draws that money-in-vs-money-out distinction, and names the
 * actual action button (from `step_by_step_actions[0]`) rather than
 * hardcoding "Record receipt", so this generalizes to a future Payments
 * tutorial too.
 */
function faqFromMoneyDirectionTerminology(data) {
  const corpus = `${data.goal || ""} ${data.help_center_article || ""}`;
  const hasBothTerms = /\breceipt\b/i.test(corpus) && /\bpayment\b/i.test(corpus);
  const hasDirection = /(coming in|money in|received from)/i.test(corpus) && /(going out|money out|paid out)/i.test(corpus);
  if (!hasBothTerms || !hasDirection) return null;
  const steps = data.step_by_step_actions || [];
  const actionLabel = (steps[0] && firstQuotedLabel(steps[0].action)) || "the matching action";
  return {
    q: faqFromMoneyDirectionTerminology.question,
    a: `In BantooBooks, a **receipt** is money coming in — like a customer paying you — while a **payment** is money going out, such as paying a supplier. Even if you'd casually call this "recording a payment," the action you want here is **${actionLabel}**.`,
  };
}
faqFromMoneyDirectionTerminology.question = "What's the difference between a receipt and a payment?";
/**
 * feature_area -> extra builder(s) layered on top of the generic base
 * question set (see `buildFaqQuestions()`). Unmapped feature areas simply
 * get no extras — the generic base set already covers them. Adding a new
 * feature area's own flavor of question later means adding one entry here,
 * not special-casing a tutorial_id.
 */
const FEATURE_AREA_EXTRA_BUILDERS = {
  Inventory: [faqFromStockStartsAtZero],
  Receipts: [faqFromMoneyDirectionTerminology],
  Payments: [faqFromMoneyDirectionTerminology],
};
/**
 * feature_area -> a *replacement* for the generic "what should I see"
 * question (`faqFromExpectedResult()`), used when that feature area has a
 * more specific, more useful framing of the same underlying fact. Falls
 * back to the generic version below when unmapped, or when the specific
 * builder can't find the evidence it needs.
 */
const OUTCOME_BUILDER_BY_FEATURE_AREA = {
  "Sales & Invoicing": faqFromInvoiceLifecycle,
  Receipts: faqFromReceiptSettlement,
  Purchasing: faqFromBillLifecycle,
};

/**
 * Assembles the ordered list of {q, a} pairs for one tutorial in an
 * explicit, fixed narrative-slot order (not a sort by some heuristic, so
 * the order is deterministic and easy to reason about/adjust): context ->
 * orientation -> first action -> core mechanics -> mechanics detail ->
 * conditional mechanics -> feature-area-specific mechanics/outcome ->
 * aftercare -> closing/outcome. Every conditional question still self-omits
 * via `null` exactly as before — only the *order* changed here, not which
 * questions get included.
 */
function buildFaqQuestions(data) {
  const results = [];
  const push = (result) => {
    if (result) results.push(result);
  };

  // Slot 1 — context: who this is for, what you need before you start.
  push(faqFromAudience(data));
  push(faqFromPrerequisites(data));

  // Slot 2 — orientation: where in the app.
  push(faqFromFeatureArea(data));

  // Slot 3 — first action: how to begin.
  push(faqFromGettingStarted(data));

  // Slot 4 — core mechanics: which fields are required.
  push(faqFromRequiredFields(data));

  // Slot 5 — mechanics detail: the tutorial's most notable optional field(s).
  push(faqFromNotableOptional(data));

  // Slot 6 — conditional mechanics: duplicate detection.
  push(faqFromDuplicateHandling(data));

  // Slot 7 — feature-area-specific mechanics/outcome (the v3-round
  // additions): both the "extra" builders (stock-starts-at-zero,
  // receipt/payment terminology) and, when this feature area has one, the
  // OUTCOME_BUILDER replacement for the generic "what should I see"
  // question (invoice lifecycle / receipt settlement) — these read as a
  // specific mechanic this feature area's user would wonder about, not a
  // closing summary, so they belong here rather than at the very end.
  const outcomeBuilder = OUTCOME_BUILDER_BY_FEATURE_AREA[data.feature_area];
  const outcomeOverride = outcomeBuilder && outcomeBuilder(data);
  push(outcomeOverride);
  for (const extraBuilder of FEATURE_AREA_EXTRA_BUILDERS[data.feature_area] || []) {
    push(extraBuilder(data));
  }

  // Slot 8 — aftercare: can I edit this later.
  push(faqFromEditability(data));

  // Slot 9 — closing/outcome: what should I see when I'm done. Only shown
  // when no feature-area-specific outcome question already covered this in
  // slot 7 above, so a tutorial never gets two overlapping "what happens"
  // questions.
  if (!outcomeOverride) push(faqFromExpectedResult(data));

  return results;
}

function buildFaq(data) {
  const lines = [];
  lines.push(`# FAQ — ${data.title}`);
  lines.push("");
  lines.push(
    "> Every answer below is deterministically derived from this tutorial's own frontmatter fields — nothing here is invented.",
  );
  lines.push("");
  for (const { q, a } of buildFaqQuestions(data)) {
    lines.push(`### ${q}`);
    lines.push("");
    lines.push(a);
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Maps a tutorial to the plain-English noun for "the thing this tutorial
 * creates/edits" (customer, supplier, invoice, receipt, item, ...), used by
 * `faqFromDuplicateHandling()` and `faqFromEditability()`. Checked in order
 * of specificity: tutorial_id/title keywords first (most specific to *this*
 * tutorial), then feature_area as a broader fallback. Returns `null` if
 * nothing matches, so callers can omit a question rather than guess.
 */
const ENTITY_NOUN_KEYWORDS = [
  { pattern: /invoice/i, noun: "invoice" },
  { pattern: /receipt/i, noun: "receipt" },
  { pattern: /supplier/i, noun: "supplier" },
  { pattern: /customer/i, noun: "customer" },
  { pattern: /inventory|item/i, noun: "item" },
  { pattern: /payment/i, noun: "payment" },
];
const FEATURE_AREA_ENTITY_NOUNS = {
  Customers: "customer",
  Suppliers: "supplier",
  "Sales & Invoicing": "invoice",
  Payments: "payment",
  Receipts: "receipt",
  Inventory: "item",
};
function inferEntityNoun(data) {
  const haystack = `${data.tutorial_id || ""} ${data.title || ""}`;
  for (const { pattern, noun } of ENTITY_NOUN_KEYWORDS) {
    if (pattern.test(haystack)) return noun;
  }
  return FEATURE_AREA_ENTITY_NOUNS[data.feature_area] || null;
}

// ---------------------------------------------------------------------------
// classifyTestDataFields() — sorts a tutorial's `test_data` keys into
// required / optional / auto-defaulted buckets by scanning the tutorial's
// own text for concrete language cues. No guessing at backend validation:
// a field only lands in `optional`/`autoDefault` when the tutorial's own
// steps or narration actually say so; everything else defaults to
// `required` (the safer default — worst case we call something required
// that's technically optional, never the other way around).
// ---------------------------------------------------------------------------
const OPTIONAL_CUE_RE =
  /\boptional\b|isn'?t required|is not required|\bnot required\b|none[^.]{0,30}\brequired\b|leave[^.]{0,30}blank|left blank|if you have\b|if useful\b|if it applies\b|if (?:one|any|they) applies?\b|if applicable\b|you don'?t have to\b|don'?t need to\b|can (?:always )?(?:come back|add|fill (?:it|them) in)[^.]{0,20}later|skip (?:this|it)[^.]{0,15}for now|feel free to skip|if you'?d like\b/i;
const AUTO_DEFAULT_CUE_RE = /already shows|\bdefault\b|automatically (?:set|shows|leaves)|leave (?:that|this|it) as is/i;

function classifyTestDataFields(data) {
  const testData = data.test_data || {};
  const keys = Object.keys(testData);
  if (keys.length === 0) return { required: [], optional: [], autoDefault: [] };

  const steps = data.step_by_step_actions || [];
  const resolved = new Map(); // key -> { kind: "optional" | "autoDefault", label: string|null }
  const tryAssign = (label, kind) => {
    const key = matchLabelToKey(label, keys);
    if (key && !resolved.has(key)) resolved.set(key, { kind, label: label.trim() });
  };

  // Phase 1 — precise, quote-anchored cues straight from the numbered steps
  // (the most structured, least ambiguous source), so a cue about one field
  // can't accidentally "leak" onto a different field mentioned nearby.
  for (const s of steps) {
    const action = s.action || "";
    let m;
    const optRe = /"([^"]+?)\s*\(optional\)"/gi;
    while ((m = optRe.exec(action))) tryAssign(m[1], "optional");

    const blankQuotedRe = /leave\s+"([^"]+)"\s*blank/gi;
    while ((m = blankQuotedRe.exec(action))) tryAssign(m[1], "optional");

    const blankBareRe = /leave\s+([A-Za-z]+)\s+blank/gi;
    while ((m = blankBareRe.exec(action))) tryAssign(m[1], "optional");

    const defaultRe = /"([^"]+)"[^".]{0,25}(?:already shows|is the default|left as (?:is|it))/gi;
    while ((m = defaultRe.exec(action))) tryAssign(m[1], "autoDefault");

    // A "+ X / Y / Z" control that "reveals extra fields" — a common
    // progressive-disclosure pattern — implies X, Y, and Z are all optional.
    const revealMatch = action.match(/"[+＋]?\s*([^"]+?)"\s+to reveal[^".]{0,40}extra fields/i);
    if (revealMatch) {
      for (const part of revealMatch[1].split("/")) {
        const cleaned = part.replace(/^[+＋\s]+/, "").trim();
        if (cleaned) tryAssign(cleaned, "optional");
      }
    }
  }

  // Phase 2 — looser cues from prose, only trusted when a given sentence
  // mentions exactly this one field (and no other test_data key), so an
  // unrelated "optional" elsewhere in a multi-field sentence can't
  // misattribute to the wrong field. Deliberately limited to the numbered
  // steps and `help_center_article` — the two most carefully-worded, topical
  // sources — rather than `voiceover_script`/`synthesia_script`, whose more
  // colloquial narration tends to mention a field in passing (e.g. "add a
  // note for the customer") in ways that can falsely implicate an unrelated
  // key when it sits next to a cue word.
  const humanized = new Map(keys.map((k) => [k, humanizeKey(k)]));
  // Normalized (possessive-stripped) forms for the containment checks below
  // only — same reasoning as `matchLabelToKey()`'s use of `normalizeLabel()`:
  // a possessive mention like "Supplier's reference" must not silently read
  // as containing the unrelated, shorter "supplier" key (nor fail to be
  // recognized as also mentioning "supplierRef"), which would otherwise let
  // a cue meant for one field mis-set another, or slip past the
  // `mentionsOtherKey` ambiguity guard entirely. `OPTIONAL_CUE_RE`/
  // `AUTO_DEFAULT_CUE_RE` still test the original, unnormalized `chunk`.
  const normalizedHumanized = new Map(keys.map((k) => [k, normalizeLabel(humanizeKey(k))]));
  const chunks = [...steps.map((s) => s.action || ""), ...splitSentences(data.help_center_article)];
  for (const key of keys) {
    if (resolved.has(key)) continue;
    const needle = normalizedHumanized.get(key);
    if (!needle) continue;
    for (const chunk of chunks) {
      const normalizedChunk = normalizeLabel(chunk);
      if (!normalizedChunk.includes(needle)) continue;
      const mentionsOtherKey = keys.some((other) => other !== key && normalizedChunk.includes(normalizedHumanized.get(other)));
      if (mentionsOtherKey) continue; // ambiguous — can't tell which field the cue is about
      if (OPTIONAL_CUE_RE.test(chunk)) {
        resolved.set(key, { kind: "optional", label: null });
        break;
      }
      if (AUTO_DEFAULT_CUE_RE.test(chunk)) {
        resolved.set(key, { kind: "autoDefault", label: null });
        break;
      }
    }
  }

  const required = [];
  const optional = [];
  const autoDefault = [];
  for (const key of keys) {
    const r = resolved.get(key);
    const otherValues = keys.filter((k) => k !== key).map((k) => testData[k]);
    const label = (r && r.label) || findLabelForValue(steps, testData[key], otherValues) || sentenceCase(humanized.get(key));
    if (!r) required.push({ key, label });
    else if (r.kind === "optional") optional.push({ key, label });
    else autoDefault.push({ key, label });
  }
  return { required, optional, autoDefault };
}
function sentenceCase(text) {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "dueDate" -> "due date"; "referenceNo" -> "reference no". */
function humanizeKey(key) {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
}
function normalizeLabel(text) {
  return (
    String(text || "")
      .toLowerCase()
      // Strip a trailing possessive ("Supplier's" -> "supplier") rather than
      // just deleting the apostrophe ("Supplier's" -> "suppliers") — the
      // latter silently fuses the "s" onto the preceding word, which can
      // make a possessive label like "Supplier's reference" collide with an
      // unrelated, shorter key like "supplier" during substring matching
      // below instead of the intended "supplierRef".
      .replace(/'s\b/g, "")
      .replace(/[^a-z0-9 ]/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}
/**
 * Matches a free-text label (e.g. "Due date") back to its test_data key
 * (e.g. "dueDate"). The substring-containment fallback picks the *longest*
 * (most specific) matching key rather than the first one encountered in
 * `keys` order — e.g. for label "Supplier reference" both "supplier" and
 * "supplierRef" (-> "supplier ref") are valid substring candidates, and the
 * longer, more specific "supplier ref" is the correct one; returning on the
 * first match would incorrectly bind the cue to the unrelated "supplier"
 * field whenever it happens to be declared first in test_data.
 */
function matchLabelToKey(label, keys) {
  const norm = normalizeLabel(label);
  if (!norm) return null;
  for (const key of keys) {
    if (norm === normalizeLabel(humanizeKey(key))) return key;
  }
  let best = null;
  let bestLen = 0;
  for (const key of keys) {
    const keyNorm = normalizeLabel(humanizeKey(key));
    if (keyNorm.length < 3 || norm.length < 3) continue;
    if ((norm.includes(keyNorm) || keyNorm.includes(norm)) && keyNorm.length > bestLen) {
      best = key;
      bestLen = keyNorm.length;
    }
  }
  return best;
}
/**
 * Best-effort "real UI label" for a field, found by looking for its exact
 * test_data value quoted next to another quoted string in a step (e.g.
 * `type "677 45 12 89" into the "Phone" field` -> "Phone"). Falls back to
 * a sentence-cased version of the key itself when no step spells it out.
 *
 * `otherValues` are this same tutorial's *other* test_data values — a
 * candidate "label" that's actually identical to one of those is rejected,
 * since a real UI label is never the same as a sibling field's raw value.
 * This matters for a step packing two field references into one sentence,
 * e.g. `Confirm "Qty" already shows "1", then type "180,000" into "Unit
 * price".` — without this guard, looking up the label for value "1" would
 * grab the next quoted string after it ("180,000", the *following* field's
 * own value) instead of continuing on to the real label ("Qty") that
 * precedes it.
 */
function findLabelForValue(steps, value, otherValues = []) {
  if (!value) return null;
  const escaped = escapeRegExp(String(value));
  const afterRe = new RegExp(`"${escaped}"[^"]{0,20}"([^"]+)"`, "i");
  const beforeRe = new RegExp(`"([^"]+)"[^"]{0,25}"${escaped}"`, "i");
  const normalizedOtherValues = otherValues.filter((v) => v != null).map((v) => String(v).trim().toLowerCase());
  const isPlausibleLabel = (candidate) => !normalizedOtherValues.includes(candidate.trim().toLowerCase());
  // Check both directions per-step, in step order, so the *first* step that
  // mentions this value (typically where the user actually enters/selects
  // it) wins — rather than letting an unrelated later step that happens to
  // quote something shortly after the same value (e.g. a final confirmation
  // step quoting a status badge) get checked first. Within a step, prefer
  // "value" -> "label" (e.g. `type "X" into the "Field"`) over the reverse,
  // since it's the tighter, more specific "typing into a field" pattern —
  // the reverse can otherwise pick up an unrelated nearby quoted form/button
  // name (e.g. an `"Add item"` form heading) that merely precedes the value.
  for (const s of steps) {
    const action = s.action || "";
    const after = action.match(afterRe);
    if (after && isPlausibleLabel(after[1])) return after[1];
    const before = action.match(beforeRe);
    if (before && isPlausibleLabel(before[1])) return before[1];
  }
  return null;
}
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/** First quoted string in a step's action, with a leading "+" control marker stripped (e.g. `"+ Add customer"` -> `"Add customer"`). */
function firstQuotedLabel(text) {
  const m = String(text || "").match(/"([^"]+)"/);
  return m ? m[1].replace(/^[+＋\s]+/, "") : null;
}
function splitSentences(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
function joinNatural(items) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

// ---------------------------------------------------------------------------
// (5)(6)(7) youtube.md — title variant, richer description, short chapter
// titles, and hashtags: everything a publisher needs to upload with minimal
// manual editing, all still deterministically derived from frontmatter.
// ---------------------------------------------------------------------------
const CHAPTER_INTRO_SECONDS = 8;
const CHAPTER_MIN_SECONDS = 8;
const CHAPTER_WPM = 150;
const YOUTUBE_BASE_URL = "https://books.bantoobooks.com"; // the app's real, verified base URL (see ledger/app/layout.tsx)

/** Computes chapter markers + the running total video-length estimate, shared by the title (duration modifier) and the Chapters section. */
function computeYoutubeChapters(data) {
  const voiceByStep = indexByStep(data.voiceover_script, "line");
  const steps = data.step_by_step_actions || [];
  const testDataKeys = Object.keys(data.test_data || {});

  const chapters = [];
  let cursor = 0;
  chapters.push({ time: cursor, label: "Introduction" });
  cursor += CHAPTER_INTRO_SECONDS;

  for (const s of steps) {
    chapters.push({ time: cursor, label: `Step ${s.step}: ${summarizeStepForChapter(s, testDataKeys)}` });
    const words = wordCount(voiceByStep.get(s.step) || s.action);
    cursor += Math.max(CHAPTER_MIN_SECONDS, estimateSeconds(words, CHAPTER_WPM));
  }
  chapters.push({ time: cursor, label: "Recap" });

  return { chapters, totalSeconds: cursor };
}

/**
 * Short, complete chapter-title generator. Rather than truncating a step's
 * full action sentence (which can only ever end mid-word/mid-clause once
 * the sentence is longer than the budget), this detects the step's leading
 * instruction verb and its target field/control — cross-referenced against
 * this tutorial's own `test_data` keys wherever possible, so e.g. a step
 * that fills in three fields at once lists all three by name — and returns
 * a short, human, always-complete phrase. Falls back to a short leading
 * clause (cut at a natural punctuation boundary, never mid-word and never
 * with a trailing "…") when no pattern confidently applies.
 */
const CHAPTER_FINALE_RE = /\bnow appears\b|\bappears at the top\b/i;
const CHAPTER_DUPLICATE_RE = /possible existing|possible.*duplicate|existing contact found/i;
const CHAPTER_VERB_PATTERNS = [
  { re: /\bclick\b/i, kind: "click" },
  { re: /\b(?:type|enter)\b/i, kind: "type" },
  { re: /\bconfirm\b/i, kind: "confirm" },
  { re: /\bcheck\b/i, kind: "check" },
  { re: /\bopen\b/i, kind: "open" },
  { re: /\bselect\b|\bchoose\b/i, kind: "select" },
  { re: /\bchange\b|\bset\b/i, kind: "set" },
  { re: /\bleave\b/i, kind: "leave" },
];
const CHAPTER_VERB_LABEL = { type: "Enter", confirm: "Confirm", check: "Check", open: "Open", select: "Select", set: "Set", leave: "Skip" };

/**
 * Matches phrases shaped like a bare UI instruction ("Enter Name", "Open
 * Customer") — i.e. one of `CHAPTER_VERB_LABEL`'s own verbs followed by a
 * field/entity name. These make fine chapter titles (that's what they were
 * built for) but are not genuine search-style keyword phrases, so
 * `buildKeywordTiers()` below excludes them from `secondaryKeywords`. Note
 * this deliberately does NOT match the tutorial's own action verbs (Create,
 * Add, Record, ...) used elsewhere for phrases like "Create Customer" —
 * those describe what a user searches for, not a camera/UI instruction.
 */
const IMPERATIVE_UI_FRAGMENT_RE = /^(Enter|Confirm|Check|Open|Select|Set|Skip|Note|Type|Click)\s+/i;
function isImperativeUiFragment(phrase) {
  return IMPERATIVE_UI_FRAGMENT_RE.test(String(phrase || "").trim());
}

function detectChapterVerbKind(text) {
  let best = null;
  for (const { re, kind } of CHAPTER_VERB_PATTERNS) {
    const m = text.match(re);
    if (m && (best === null || m.index < best.index)) best = { index: m.index, kind };
  }
  return best ? best.kind : null;
}
function cleanQuotedForChapter(label) {
  return String(label || "")
    .replace(/^[+＋\s]+/, "")
    .replace(/\s*\(optional\)\s*$/i, "")
    .trim();
}
function isShortChapterLabel(text) {
  return text.length > 0 && text.length <= 24 && text.split(/\s+/).length <= 3;
}
/** Title-cases a short phrase, keeping small joining words lowercase (except as the first word). */
function titleCaseWords(text) {
  const small = new Set(["a", "an", "the", "of", "to", "in", "on", "for", "and", "or"]);
  return String(text || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => (i > 0 && small.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}
/** Exact-normalized match only (no fuzzy substring) — strict enough to avoid e.g. "Line items" wrongly matching an "item" key. */
function exactTestDataLabel(rawLabel, testDataKeys) {
  const cleaned = cleanQuotedForChapter(rawLabel);
  const norm = normalizeLabel(cleaned);
  if (!norm) return null;
  for (const key of testDataKeys) {
    if (norm === normalizeLabel(humanizeKey(key))) return cleaned;
  }
  return null;
}
function fallbackChapterPhrase(text) {
  const noQuotes = text.replace(/["“”]/g, "");
  const boundary = noQuotes.search(/,|;|\(| — | - /);
  const clause = boundary > 6 ? noQuotes.slice(0, boundary) : noQuotes;
  const words = clause.replace(/\.$/, "").trim().split(/\s+/).slice(0, 7).join(" ");
  return titleCaseWords(words);
}
/**
 * A "+ X / Y / Z" control that reveals extra fields (e.g. "+ WhatsApp /
 * Country / City") — same pattern `classifyTestDataFields()` uses to infer
 * optional fields. Detected before the generic verb-kind logic below so it
 * gets its own action-oriented title ("Reveal WhatsApp, Country, and
 * City") instead of a bare field list with no verb, which is what the
 * generic "click" path would otherwise produce for this specific control.
 * This is a general fix (not a one-tutorial special case): any tutorial
 * with this reveal-extra-fields pattern — e.g. create-a-supplier's
 * identical "+ WhatsApp / Country / City" step — gets the same treatment,
 * so its very next chapter (the actual fill-in-the-fields step) no longer
 * reads as a redundant, un-verbed repeat of the one before it.
 */
const CHAPTER_REVEAL_RE = /"[+＋]?\s*([^"]+?)"\s+to reveal[^".]{0,40}extra fields/i;
function summarizeStepForChapter(step, testDataKeys) {
  const text = String(step.action || "").trim();
  if (CHAPTER_DUPLICATE_RE.test(text)) return "Review Possible Duplicate";
  if (CHAPTER_FINALE_RE.test(text)) return "Review the Result";

  const revealMatch = text.match(CHAPTER_REVEAL_RE);
  if (revealMatch) {
    const fields = revealMatch[1]
      .split("/")
      .map((part) => part.replace(/^[+＋\s]+/, "").trim())
      .filter(Boolean)
      .map(titleCaseWords);
    if (fields.length > 0) return `Reveal ${joinNatural(fields)}`;
  }

  const quoted = [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const kind = detectChapterVerbKind(text);

  if (kind === "click") {
    const label = quoted[0] ? titleCaseWords(cleanQuotedForChapter(quoted[0])) : null;
    return label || fallbackChapterPhrase(text);
  }
  if (kind && CHAPTER_VERB_LABEL[kind]) {
    const fieldLabels = [];
    for (const q of quoted) {
      const matched = exactTestDataLabel(q, testDataKeys);
      if (matched && !fieldLabels.includes(matched)) fieldLabels.push(matched);
    }
    if (fieldLabels.length > 0) {
      return `${CHAPTER_VERB_LABEL[kind]} ${joinNatural(fieldLabels.map(titleCaseWords))}`;
    }
    const cleanedQuoted = quoted.map(cleanQuotedForChapter);
    const candidate = kind === "type" ? cleanedQuoted[cleanedQuoted.length - 1] : cleanedQuoted[0];
    if (candidate && isShortChapterLabel(candidate)) {
      return `${CHAPTER_VERB_LABEL[kind]} ${titleCaseWords(candidate)}`;
    }
  }
  return fallbackChapterPhrase(text);
}

/**
 * feature_area -> extra keyword-relevant hashtag(s) beyond the always-on
 * base set. Same lookup-map-with-fallback pattern used throughout this
 * file (facebookConnective, FEATURE_AREA_EXTRA_BUILDERS, ...): unmapped
 * areas simply skip this layer rather than getting a wrong tag.
 */
const REGION_HASHTAGS_BY_COUNTRY = {
  cameroon: ["#CameroonBusiness", "#AfricaSME"],
};
const DEFAULT_REGION_HASHTAGS = ["#AfricaSME"];
/** Derives a region hashtag pair from this tutorial's own `test_data.country` or `demo_company` — never invented, always traceable to a real field. */
function inferRegionHashtags(data) {
  const country = (data.test_data && data.test_data.country) || "";
  const haystack = `${country} ${data.demo_company || ""}`.toLowerCase();
  for (const [key, tags] of Object.entries(REGION_HASHTAGS_BY_COUNTRY)) {
    if (haystack.includes(key)) return tags;
  }
  return DEFAULT_REGION_HASHTAGS;
}
/**
 * 5-10 specific hashtags: product + established #SME tag + feature area +
 * the entity noun (when inferable) + region tags (derived from this
 * tutorial's own country/demo org, not invented) + enough keyword-derived
 * tags (same stopword-filtered `extractKeywords()` used by `seo.json`,
 * reused rather than re-implemented) to reach a healthy count. Deduped
 * case-/plural-insensitively, same rule as `buildHashtags()` above.
 */
function buildYoutubeHashtags(data) {
  const noun = inferEntityNoun(data);
  const base = ["#BantooBooks", "#SME", toHashtag(data.feature_area)];
  if (noun) base.push(toHashtag(noun));
  const candidates = [...base, ...inferRegionHashtags(data)];
  const keywordTags = extractKeywords([data.title, data.goal, data.audience], 10).map(toHashtag);
  for (const tag of keywordTags) {
    if (candidates.length >= 10) break;
    candidates.push(tag);
  }
  const seen = new Set();
  const out = [];
  for (const tag of candidates) {
    const key = tag.toLowerCase().replace(/s$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= 10) break;
  }
  return out;
}

/** First non-heading paragraph of a markdown blob — used for the description's "why it matters" line. */
function extractFirstArticleParagraph(markdown) {
  const paragraphs = splitParagraphs(markdown).filter((p) => !/^#{1,6}\s/.test(p));
  return paragraphs[0] || "";
}
/** Reuses each tutorial's own hand-written `youtube_description` bullets when present; otherwise synthesizes 3 from evenly-spaced steps so a future tutorial without bullets still gets a real "What you'll learn" list. */
function extractLearnBullets(data) {
  const fromDescription = String(data.youtube_description || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^-\s+/.test(l))
    .map((l) => l.replace(/^-\s+/, "").trim());
  if (fromDescription.length > 0) return fromDescription;

  const steps = data.step_by_step_actions || [];
  const testDataKeys = Object.keys(data.test_data || {});
  return pickThreeIndices(steps.length).map((i) => summarizeStepForChapter(steps[i], testDataKeys));
}
/**
 * Assembles a publish-ready description entirely from frontmatter: intro
 * (goal) -> what you'll learn (existing/synthesized bullets) -> who it's
 * for (audience) -> why it matters (help_center_article's own intro
 * paragraph, falling back to expected_result) -> a try-it CTA -> a
 * clearly-labeled placeholder link block (real app URL + a TODO for the
 * not-yet-published help-center URL, per the task's explicit instruction
 * not to invent one) -> a fixed subscribe CTA.
 */
function buildYoutubeDescription(data) {
  // `goal` is already a complete, well-punctuated sentence (some end with a
  // parenthetical aside) — used as-is rather than force-appending a brand
  // suffix, which reads awkwardly whenever goal ends with ")." or already
  // mentions BantooBooks itself mid-sentence.
  const intro = `In this video, you'll learn how to ${lower(data.goal.trim())}`;
  const bullets = extractLearnBullets(data);
  const whyItMatters = extractFirstArticleParagraph(data.help_center_article) || data.expected_result;

  const lines = [];
  lines.push(intro);
  lines.push("");
  lines.push("🎯 What you'll learn:");
  for (const b of bullets) lines.push(`- ${b}`);
  lines.push("");
  lines.push(`👤 Who this is for: ${data.audience}.`);
  lines.push("");
  lines.push(`💡 Why it matters: ${whyItMatters}`);
  lines.push("");
  lines.push("👉 Ready to try it yourself? Open BantooBooks and follow along next time you need to do this.");
  lines.push("");
  // Same emoji-led-line register as everything above, rather than switching
  // to a `[Label] → url` bracket-arrow notation for just these two lines.
  lines.push(`🔗 Try BantooBooks free: ${YOUTUBE_BASE_URL}`);
  lines.push(`📄 Help Center article: TODO: paste this tutorial's published Help Center URL once it's live (see help.md for the article text)`);
  lines.push("");
  lines.push("🔔 If this tutorial helped you, subscribe for more BantooBooks tutorials.");
  return lines.join("\n");
}

/**
 * Compelling-but-accurate title variant: `short_youtube_title` stays the
 * safe base (verified <70-char copy already written for this tutorial),
 * with a `(Modifier)` suffix chosen deterministically from this tutorial's
 * own step count / computed video length — never a random pick, and never
 * a claim that isn't backed by the tutorial's own data.
 */
const TITLE_COMPLETE_GUIDE_STEP_THRESHOLD = 12;
const TITLE_STEP_BY_STEP_STEP_THRESHOLD = 10;
function suggestYoutubeTitle(data, totalVideoSeconds) {
  const base = data.short_youtube_title || data.title;
  const action = stripBantooBooksSuffix(base.replace(/^how to\s+/i, ""));
  const stepCount = (data.step_by_step_actions || []).length;

  let modifier;
  if (stepCount >= TITLE_COMPLETE_GUIDE_STEP_THRESHOLD) {
    modifier = "Complete Guide";
  } else if (stepCount < TITLE_STEP_BY_STEP_STEP_THRESHOLD) {
    const minutes = Math.max(1, Math.ceil(totalVideoSeconds / 60));
    modifier = `Under ${minutes} Minute${minutes === 1 ? "" : "s"}`;
  } else {
    modifier = "Step-by-Step";
  }
  return `How to ${action} in BantooBooks (${modifier})`;
}

function buildYoutube(data) {
  const { chapters, totalSeconds } = computeYoutubeChapters(data);
  const hashtags = buildYoutubeHashtags(data);

  const lines = [];
  lines.push(`# YouTube Metadata — ${data.title}`);
  lines.push("");
  lines.push("## Title");
  lines.push("");
  lines.push(suggestYoutubeTitle(data, totalSeconds));
  lines.push("");
  lines.push("## Description");
  lines.push("");
  lines.push(buildYoutubeDescription(data));
  lines.push("");
  lines.push("## Hashtags");
  lines.push("");
  lines.push(hashtags.join(" "));
  lines.push("");
  lines.push("## Chapters");
  lines.push("");
  lines.push(
    `> Timestamps below are **placeholder estimates** — derived from a ~${CHAPTER_WPM} wpm narration heuristic per step (minimum ${CHAPTER_MIN_SECONDS}s/chapter), not from an actual video. Re-time every timestamp against the real edited video before publishing.`,
  );
  lines.push("");
  for (const c of chapters) lines.push(`${formatMmSs(c.time)} ${c.label}`);
  lines.push("");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// (8) shorts.md — a genuinely optimized 30-45s vertical-video script, not
// just a shorter version of synthesia.md. Replaces the old 3-part
// Hook/Core/CTA shape — whose "Core" sampled 3 evenly-spaced FULL sentences
// from `voiceover_script` with no regard for whether that particular step
// was actually worth showing (the earlier review's "even-index sampling can
// pick a low-value step" finding) — with an explicit 5-part Hook -> Problem
// -> Fast Solution -> Result -> CTA structure: a punchy feature-area hook
// (own strategy map, distinct in style from LinkedIn's reflective hooks and
// Facebook's longer conversational ones), one short problem sentence, 2-3
// *essential* action steps only (explicitly excluding review/outcome steps,
// then reusing youtube.md's chapter-title summarizer for short verb+object
// phrases instead of full explanatory sentences), one short result
// sentence, and a fixed universal CTA line.
// ---------------------------------------------------------------------------
const SHORTS_WPM = 150;
const SHORTS_TARGET_MIN_WORDS = 75;
const SHORTS_TARGET_MAX_WORDS = 115;
const SHORTS_CTA_LINE = "Follow BantooBooks for more business tips.";

/**
 * feature_area -> a short, punchy (~6 words or fewer where possible) hook —
 * a blunt question or imperative, not a reflective statement. Distinct in
 * *style* from `LINKEDIN_STORY_BY_FEATURE_AREA`'s reflective hooks and
 * `FACEBOOK_STORY_BY_FEATURE_AREA`'s longer conversational ones, even
 * though all three are grounded in the same real pain points (contact
 * tracking, unpaid invoices, payment reconciliation, stockouts) — none of
 * these sentences are reused verbatim from either of those maps. Unmapped
 * feature areas fall back to `DEFAULT_SHORTS_HOOK`.
 */
const SHORTS_HOOK_BY_FEATURE_AREA = {
  Customers: "Stop losing track of your customers.",
  Suppliers: "Stop losing track of your suppliers.",
  "Sales & Invoicing": "Still chasing down unpaid invoices?",
  Receipts: "Still matching payments to invoices by hand?",
  Inventory: "Still running out of stock without warning?",
  Purchasing: "Still losing track of supplier bills?",
  Payments: "Still forgetting to log supplier payments?",
  Reports: "Still digging through invoices for a balance?",
  Banking: "Only tracking one account for your money?",
};
const DEFAULT_SHORTS_HOOK = "There's a much faster way to do this.";

/**
 * tutorial_id -> override for the same 3 Inventory-area tutorials as
 * `LINKEDIN_STORY_BY_TUTORIAL_ID` / `FACEBOOK_STORY_BY_TUTORIAL_ID` above,
 * checked first and falling back to `SHORTS_HOOK_BY_FEATURE_AREA` /
 * `SHORTS_PROBLEM_BY_FEATURE_AREA` / `SHORTS_RESULT_BY_FEATURE_AREA`
 * otherwise — see the comment on `LINKEDIN_STORY_BY_TUTORIAL_ID` for the
 * full rationale. Shorts hooks stay ultra-punchy (3-second, sub-10-word)
 * per this format's existing style, distinct from the longer LinkedIn/
 * Facebook phrasing above even though grounded in the same 3 angles.
 */
const SHORTS_HOOK_BY_TUTORIAL_ID = {
  "record-a-goods-receipt": "Stock just arrived — is your count right?",
  "adjust-inventory": "Does your actual stock count match reality?",
  "write-off-inventory": "Still counting that damaged stock as sellable?",
};

/**
 * feature_area -> one short (Problem, 3-8s) sentence naming the cost of the
 * hook's pain point — adapted and compressed from
 * `FACEBOOK_STORY_BY_FEATURE_AREA`'s longer "cost" sentence for this
 * faster-paced format, not copied verbatim.
 */
const SHORTS_PROBLEM_BY_FEATURE_AREA = {
  Customers:
    "When customer details live in a notebook, a chat thread, or just your memory, it's easy to forget who owes you money, and awkward to chase once you're not sure.",
  Suppliers:
    "When purchases and payments live in different notebooks or just your memory, it's easy to lose track of what you owe, or pay the same bill twice.",
  "Sales & Invoicing":
    "Without a proper invoice, it's easy to undercharge someone, miss a due date, or completely forget who still owes you money by the time it actually matters.",
  Receipts:
    "Matching a payment to the right invoice by hand takes time, especially when a customer only pays part of what they owe you.",
  Inventory:
    "Without a running stock count, it's easy to over-order what's already sitting there and run out of what's actually selling, right when it matters most.",
  Purchasing:
    "When supplier bills come in on paper or by message, it's easy to pay one twice, or completely forget one until the supplier calls chasing it.",
  Payments:
    "When a payment to a supplier isn't written down right away, it's easy to lose track of what's actually been settled, or pay the same bill twice.",
  Reports:
    "Without one place to look, answering a simple 'what do I owe you' question can mean digging back through old invoices and receipts.",
  Banking:
    "A bank account, a cash drawer, sometimes mobile money too — without tracking each one separately, it's easy for a balance to be wrong.",
};
const DEFAULT_SHORTS_PROBLEM =
  "Doing this by hand takes time, and it's easy for something important to slip through the cracks and cost you later, without you even noticing.";

/** tutorial_id -> override, same priority/rationale as `SHORTS_HOOK_BY_TUTORIAL_ID` above. */
const SHORTS_PROBLEM_BY_TUTORIAL_ID = {
  "record-a-goods-receipt":
    "Without logging a delivery properly, your recorded stock can quietly drift away from what's actually on the shelf, until you're already short.",
  "adjust-inventory":
    "Stock can go missing or get miscounted, and once your records are off, every report built on that number is a little bit wrong.",
  "write-off-inventory":
    "If damaged, expired, or lost stock isn't removed from your records, your inventory value stays inflated and your reports stop reflecting reality.",
};

/**
 * feature_area -> one short (Result, 25-35s) sentence stating the concrete
 * outcome. A compressed, generic paraphrase of that tutorial's own
 * `expected_result` field — grounded in the same real facts (a new record
 * appearing right away, a balance or status updating automatically) but
 * never the literal demo entity names or the full multi-clause field.
 */
const SHORTS_RESULT_BY_FEATURE_AREA = {
  Customers:
    "Your new customer shows up right away, ready for you to invoice them and track exactly what they owe you, with zero extra work.",
  Suppliers:
    "Your new supplier shows up right away, ready for you to track everything you've purchased and still owe them, all in one place.",
  "Sales & Invoicing":
    "The invoice is saved instantly, and that customer's balance updates automatically so you always know exactly where things stand.",
  Receipts:
    "The customer's balance drops right away, and the invoice flips from unpaid to paid, automatically, with no extra steps for you.",
  Inventory:
    "Your new item is saved and ready for BantooBooks to start tracking its stock level for you, right from day one.",
  Purchasing:
    "The bill is saved instantly, and that supplier's balance updates automatically so you always know exactly what you owe.",
  Payments:
    "The supplier's balance drops right away, and the bill flips from unpaid to paid, automatically, with no extra steps for you.",
  Reports:
    "The customer's full statement — every invoice, receipt, and running balance — is right there, always up to date.",
  Banking: "Your new account is saved and ready to use immediately for every payment and receipt you record.",
};
const DEFAULT_SHORTS_RESULT =
  "It's saved and tracked automatically, with nothing left for you to update or double-check by hand afterward.";

/** tutorial_id -> override, same priority/rationale as `SHORTS_HOOK_BY_TUTORIAL_ID` above. */
const SHORTS_RESULT_BY_TUTORIAL_ID = {
  "record-a-goods-receipt":
    "Your stock count and what you owe that supplier both update the moment you save the goods receipt, automatically.",
  "adjust-inventory": "The item's on-hand count is corrected instantly, with your reason saved right alongside it for future reference.",
  "write-off-inventory":
    "The stock is written off instantly, and your inventory value updates right away to reflect only what you can actually sell.",
};

function buildShorts(data) {
  const hook = SHORTS_HOOK_BY_TUTORIAL_ID[data.tutorial_id] || SHORTS_HOOK_BY_FEATURE_AREA[data.feature_area] || DEFAULT_SHORTS_HOOK;
  const problem =
    SHORTS_PROBLEM_BY_TUTORIAL_ID[data.tutorial_id] || SHORTS_PROBLEM_BY_FEATURE_AREA[data.feature_area] || DEFAULT_SHORTS_PROBLEM;
  const result = SHORTS_RESULT_BY_TUTORIAL_ID[data.tutorial_id] || SHORTS_RESULT_BY_FEATURE_AREA[data.feature_area] || DEFAULT_SHORTS_RESULT;
  const actions = pickEssentialActionPhrases(data);
  const fastSolutionIntro = "Here's the fastest way to get it done, start to finish, no extra clicks:";

  const scriptParts = [hook, problem, fastSolutionIntro, ...actions, result, SHORTS_CTA_LINE];
  const words = wordCount(scriptParts.join(" "));

  const lines = [];
  lines.push(`# Shorts / Reels Script (~30-45s) — ${data.title}`);
  lines.push("");
  lines.push(
    `**Word count:** ${words} words (target ~${SHORTS_TARGET_MIN_WORDS}-${SHORTS_TARGET_MAX_WORDS} words for ~30-45s at ~${SHORTS_WPM} wpm)`,
  );
  lines.push("");
  lines.push(
    "> Derived from `feature_area` (Hook/Problem/Result, via small feature-area strategy maps below), the 2-3 fastest essential actions from `step_by_step_actions` (short verb+object phrases, reusing youtube.md's chapter-title summarizer — review/outcome steps are excluded, not just evenly sampled), and a fixed CTA line.",
  );
  lines.push("");
  lines.push("## Hook (0-3s)");
  lines.push("");
  lines.push(hook);
  lines.push("");
  lines.push("## Problem (3-8s)");
  lines.push("");
  lines.push(problem);
  lines.push("");
  lines.push("## Fast Solution (8-25s)");
  lines.push("");
  lines.push(fastSolutionIntro);
  lines.push("");
  for (const action of actions) lines.push(`- ${action}`);
  lines.push("");
  lines.push("## Result (25-35s)");
  lines.push("");
  lines.push(result);
  lines.push("");
  lines.push("## CTA (35-45s)");
  lines.push("");
  lines.push(SHORTS_CTA_LINE);
  lines.push("");
  return lines.join("\n");
}

/**
 * Up to 3 short verb+object action phrases representing the *fastest* path
 * through the tutorial — not full step coverage, and never a full
 * explanatory sentence. First excludes steps that are really a
 * confirmation/outcome moment rather than an action a viewer needs to copy
 * (the same `CHAPTER_FINALE_RE`/`CHAPTER_DUPLICATE_RE` patterns
 * `summarizeStepForChapter()` already treats specially for youtube.md — a
 * "Review the Result" or "Review Possible Duplicate" moment was never a
 * real, fast-path action worth showing here), then evenly samples up to 3
 * of the *remaining* essential-action steps. This is what actually fixes
 * the old builder's "even-index sampling can pick a low-value step"
 * problem: a review/outcome step can no longer be picked at all (instead of
 * just being unlucky enough to land on an unrepresentative index), and each
 * sampled step is now a short phrase instead of a full voiceover sentence.
 */
function pickEssentialActionPhrases(data) {
  const steps = data.step_by_step_actions || [];
  const testDataKeys = Object.keys(data.test_data || {});
  const essential = steps.filter((s) => {
    const text = String(s.action || "");
    return !CHAPTER_FINALE_RE.test(text) && !CHAPTER_DUPLICATE_RE.test(text);
  });
  const source = essential.length > 0 ? essential : steps;
  const idx = pickThreeIndices(source.length);
  return idx.map((i) => summarizeStepForChapter(source[i], testDataKeys));
}

function pickThreeIndices(n) {
  if (n <= 0) return [];
  if (n <= 3) return Array.from({ length: n }, (_, i) => i);
  const mid = Math.floor((n - 1) / 2);
  return [...new Set([0, mid, n - 1])];
}

// ---------------------------------------------------------------------------
// (9) linkedin.md — a founder-voice business story, not a feature
// announcement: hook (real pain point) -> relatable elaboration -> the
// BantooBooks angle (grounded in `goal`) -> a brief tutorial mention -> a
// reflective CTA question tied back to the same pain point. Deliberately
// drops the decorative "📘 title" banner line and the emoji-heavy hard-sell
// CTA the old version used ("👉 New to BantooBooks? Start your free trial
// and follow along.") — those read fine for a Facebook-style casual post
// (see `facebookConnective()` below, which keeps its emoji), but clash with
// the calmer, more editorial tone a founder's own LinkedIn post should have.
// ---------------------------------------------------------------------------

/**
 * feature_area -> a small, fixed story skeleton naming a real, relatable
 * pain point for that area — never a fabricated statistic or specific
 * claim we can't back up. The `hook`/`relate`/`solution`/`closing`/`cta`
 * copy is all fixed per area (same pattern as `FACEBOOK_STORY_BY_FEATURE_AREA` and
 * the FAQ feature-area maps). `solution` is a hand-written paraphrase of
 * what that tutorial's own `goal` field means in practice — factually
 * equivalent to `goal`, but reworded rather than quoted, so a reader can't
 * spot an exact seam where fixed hook-writing stops and a raw frontmatter
 * field starts. Unmapped feature areas fall back to
 * `DEFAULT_LINKEDIN_STORY`, a generic-but-still-relatable version of the
 * same shape, so a 6th tutorial in a new area never breaks this.
 */
const LINKEDIN_STORY_BY_FEATURE_AREA = {
  Customers: {
    hook: "Ever get to the end of the month and realize you're not sure who still owes you money?",
    relate:
      "When customer records live across notebooks, chat threads, and memory, it's easy for a balance to quietly slip through the cracks — and awkward to chase once you're not even sure of the number.",
    solution: "every customer you add becomes part of a running, always-current record of what they owe you.",
    closing: 'That means the answer to "who owes me what" is always one click away.',
    cta: "Where does your business currently keep track of who owes you money?",
  },
  Suppliers: {
    hook: "Ever get a call from a supplier asking about a payment, and you're not 100% sure if it's already been settled?",
    relate:
      "Purchases and payments scattered across invoices, messages, and memory make it easy to lose track of what you owe — and to whom.",
    solution: "every supplier you add gets its own running record of what you've purchased and paid them.",
    closing: "That means you always know exactly where you stand with every supplier.",
    cta: "How does your business currently track what it owes its suppliers?",
  },
  "Sales & Invoicing": {
    hook: "Ever sell something on credit and then lose track of whether — or when — you actually got paid?",
    relate:
      "Manual invoice math and scattered paper trails make it easy to undercharge, miss a due date, or simply lose sight of who still owes you.",
    solution: "every invoice you create is tracked against that customer's balance automatically, from the moment you save it.",
    closing: "That means the math and the tracking are handled for you, invoice by invoice.",
    cta: "What's your current process for chasing an unpaid invoice?",
  },
  Receipts: {
    hook: "Ever get a payment from a customer and have to dig back through invoices to figure out what it was actually for?",
    relate:
      "Matching money coming in against the right invoice — especially when a customer only pays part of what they owe — is exactly the kind of manual reconciliation that eats up an afternoon.",
    solution: "every receipt you record updates that customer's balance and your bank or cash balance together, automatically.",
    closing: "That means a payment gets matched to the right invoice without you digging through records.",
    cta: "How much time does reconciling payments cost your business each month?",
  },
  Inventory: {
    hook: "Ever run out of a best-seller and only find out when a customer asks for it?",
    relate:
      "Without a running count of what's actually on the shelf, it's easy to over-order what's already sitting there and under-order what's about to sell out.",
    solution: "every item you add gets tracked with a live stock count from day one, plus a heads-up before it actually runs out.",
    closing: "That means you find out before you run out, not after.",
    cta: "What's your current system for knowing when stock is running low?",
  },
  Purchasing: {
    hook: "Ever lose track of which supplier bills you've actually paid?",
    relate:
      "When bills come in on paper, by WhatsApp, or just from memory, it's easy to pay one twice — or forget one until the supplier calls chasing it.",
    solution: "every bill you record is tracked against that supplier's balance automatically, from the moment you save it.",
    closing: "That means you always know exactly what you still owe, and to whom.",
    cta: "How does your business currently keep track of unpaid supplier bills?",
  },
  Payments: {
    hook: "Ever pay a supplier and forget to note it down, so the next bill looks like you never paid?",
    relate:
      "When payments to suppliers get scribbled on paper or just remembered, it's easy to lose track of what's actually been settled — and to pay the same bill twice.",
    solution: "every payment you record updates that supplier's balance immediately, matched to the right bill.",
    closing: "That means you always know exactly what's been paid and what's still outstanding.",
    cta: "How does your business currently track payments made to suppliers?",
  },
  Reports: {
    hook: "Ever have a customer ask 'what do I owe you?' and have to go dig through invoices to answer?",
    relate:
      "Without one place to see a customer's full history, answering a simple balance question can turn into ten minutes of digging through old invoices and receipts.",
    solution: "every customer's full statement — invoices, receipts, and running balance — is one click away, always up to date.",
    closing: "That means you can answer 'what do I owe' on the spot, every time.",
    cta: "How long does it currently take you to answer a customer's balance question?",
  },
  Banking: {
    hook: "Ever record a payment and realize BantooBooks doesn't have the right account to put it in?",
    relate:
      "Every business has more than one place money actually sits — a bank account, a cash drawer, sometimes mobile money — and each one needs its own accurate running balance.",
    solution: "every bank, cash, or mobile money account you add gets its own running balance, ready to use across every payment and receipt.",
    closing: "That means every transaction lands in the right place, automatically.",
    cta: "How many different bank, cash, or mobile money accounts does your business actually use?",
  },
};
const DEFAULT_LINKEDIN_STORY = {
  hook: "Ever feel like a routine task in your business takes far longer than it should?",
  relate: "Manual processes and scattered records make everyday bookkeeping harder than it needs to be.",
  solution: "it keeps one running, always-current record instead of relying on memory or scattered notes.",
  closing: "That's one less thing to track by hand.",
  cta: "What process still takes too long in your business?",
};

/**
 * tutorial_id -> override for tutorials whose real workflow is a genuine
 * semantic mismatch for their feature area's generic story. Checked BEFORE
 * `LINKEDIN_STORY_BY_FEATURE_AREA`, so this is a strictly additive override
 * layer, not a replacement: any tutorial without an entry here falls
 * through to its feature area's story exactly as before (e.g.
 * `add-inventory-item` / `respond-to-low-stock-reorder-suggestion` keep
 * using `LINKEDIN_STORY_BY_FEATURE_AREA.Inventory`'s "running out of
 * stock" narrative unchanged, since that one genuinely fits both of them).
 * The 3 entries below all sit in the `Inventory` feature area but are
 * about receiving/correcting/writing off stock, not about stockouts, so
 * they need their own story rather than inheriting one written for a
 * different workflow.
 */
const LINKEDIN_STORY_BY_TUTORIAL_ID = {
  "record-a-goods-receipt": {
    hook: "Ever get a delivery from a supplier and wonder if your stock count is actually right afterward?",
    relate:
      "When a delivery isn't logged carefully, it's easy for your recorded stock to quietly drift away from what's actually on the shelf — and for that gap to only surface once you're already short.",
    solution: "recording a goods receipt updates your stock count and what you owe that supplier in the same step, matched to the delivery.",
    closing: "That means your stock numbers stay accurate, delivery after delivery.",
    cta: "How does your business currently confirm a delivery actually matches your stock records?",
  },
  "adjust-inventory": {
    hook: "Ever count your actual stock and find it doesn't match what BantooBooks says you have?",
    relate:
      "Stock can go missing, get miscounted, or just drift out of sync with your records over time — and once it does, every report built on that number is a little bit wrong.",
    solution: "you can correct the on-hand count for any item in a couple of clicks, with a reason attached.",
    closing: "That means your stock reports stay trustworthy, not just optimistic.",
    cta: "How often do you check your actual stock against what your records say?",
  },
  "write-off-inventory": {
    hook: "Still have damaged or expired stock sitting on your books like it's sellable?",
    relate:
      "Stock that's damaged, expired, or lost doesn't just disappear from your shelf — if it's not removed from your records too, your inventory value stays inflated and your reports stop reflecting reality.",
    solution: "writing off that stock removes it from your count and adjusts your inventory value in the same step.",
    closing: "That means your books only ever reflect stock you can actually sell.",
    cta: "How does your business currently handle stock that's damaged, expired, or lost?",
  },
};

function buildLinkedin(data) {
  const story = LINKEDIN_STORY_BY_TUTORIAL_ID[data.tutorial_id] || LINKEDIN_STORY_BY_FEATURE_AREA[data.feature_area] || DEFAULT_LINKEDIN_STORY;
  const hashtags = buildLinkedinHashtags(data);

  const lines = [];
  lines.push(`# LinkedIn Post — ${data.title}`);
  lines.push("");
  lines.push(story.hook);
  lines.push("");
  lines.push(story.relate);
  lines.push("");
  lines.push(`That's exactly the problem BantooBooks solves — ${story.solution} ${story.closing}`);
  lines.push("");
  lines.push(`We walk through exactly how in our latest tutorial: "${data.title}".`);
  lines.push("");
  lines.push(story.cta);
  lines.push("");
  lines.push(hashtags.join(" "));
  lines.push("");
  return lines.join("\n");
}
/**
 * 3-5 specific, industry-relevant hashtags for LinkedIn: the entity noun,
 * the feature area, one region tag (both derived the same way as
 * `buildYoutubeHashtags()` — reusing `inferEntityNoun()`/
 * `inferRegionHashtags()` rather than a third hashtag algorithm), then
 * enough stopword-filtered keywords (the same `extractKeywords()` used by
 * `seo.json`) to reach 3-5 total. `#BantooBooks`/`#SME` are listed last, as
 * a fallback only — they're only ever used if the tutorial's own fields
 * don't yield enough specific tags on their own, per the "skip the generic
 * pair if better alternatives exist" instruction.
 */
function buildLinkedinHashtags(data) {
  const noun = inferEntityNoun(data);
  const region = inferRegionHashtags(data);
  const keywordTags = extractKeywords([data.title, data.goal, data.audience], 10)
    .filter((w) => w !== "bantoobooks")
    .map(toHashtag);
  const candidates = [
    ...(noun ? [toHashtag(noun)] : []),
    toHashtag(data.feature_area),
    ...(region[0] ? [region[0]] : []),
    ...keywordTags,
    "#BantooBooks",
    "#SME",
  ];
  const seen = new Set();
  const out = [];
  for (const tag of candidates) {
    const key = tag.toLowerCase().replace(/s$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= 5) break;
  }
  return out;
}

/**
 * Shared hashtag derivation for linkedin.md and twitter.md: `#BantooBooks`
 * + `#SME` + the feature area + up to 3 more title/goal/audience keywords,
 * excluding "bantoobooks" itself (already covered by the fixed tag) and
 * deduping case-insensitively so e.g. "Customers" and "customer" don't both
 * end up as separate hashtags.
 */
function buildHashtags(data, extraCount = 3) {
  const keywords = extractKeywords([data.title, data.feature_area, data.goal, data.audience]).filter(
    (w) => w !== "bantoobooks",
  );
  const candidates = ["#BantooBooks", "#SME", toHashtag(data.feature_area), ...keywords.slice(0, extraCount).map(toHashtag)];
  const seen = new Set();
  const out = [];
  for (const tag of candidates) {
    const key = tag.toLowerCase().replace(/s$/, ""); // treat plural/singular as the same tag
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

// ---------------------------------------------------------------------------
// (10) facebook.md — short, conversational, mobile-friendly SME post. Uses
// the same hook -> relatable cost -> BantooBooks-solves-it -> CTA shape as
// linkedin.md's `LINKEDIN_STORY_BY_FEATURE_AREA` strategy map, but with its
// own, distinctly more casual/shorter copy in `FACEBOOK_STORY_BY_FEATURE_AREA`
// below — this is a parallel map, not a re-route through the LinkedIn one,
// since a real shop owner scrolling Facebook on their phone reads very
// differently from someone reading a founder's LinkedIn post.
// ---------------------------------------------------------------------------

/**
 * feature_area -> a short, punchy story for a real shop owner scrolling
 * Facebook on their phone: `hook` is a direct question naming the pain
 * point (not a reflective statement like LinkedIn's), `cost` is one short
 * sentence on why it costs them time/money/stress (grounded in the same
 * kind of real facts as the LinkedIn hooks — no invented stats), `solution`
 * paraphrases this tutorial's own `goal` field (never quotes it verbatim —
 * same discipline as `LINKEDIN_STORY_BY_FEATURE_AREA`), and `cta` is a
 * friendly, engagement-inviting question tied to the same pain point. Every
 * field is a single short sentence so the whole post stays scannable on a
 * phone. Unmapped feature areas fall back to `DEFAULT_FACEBOOK_STORY`.
 */
const FACEBOOK_STORY_BY_FEATURE_AREA = {
  Customers: {
    hook: "Still writing customer details in a notebook?",
    cost: "It's easy for a page to go missing — or for you to just forget who owes you what.",
    solution: "BantooBooks keeps every customer, and what they owe you, in one place on your phone.",
    cta: "How do you currently keep track of your customers?",
  },
  Suppliers: {
    hook: "Not sure which suppliers you still owe money to?",
    cost: "When purchases and payments live in different notebooks (or just your memory), it's easy to lose track — or pay twice.",
    solution: "BantooBooks keeps every supplier, and what you owe them, in one place.",
    cta: "How do you currently track what you owe your suppliers?",
  },
  "Sales & Invoicing": {
    hook: "Ever sell on credit and lose track of who still owes you?",
    cost: "Without a proper invoice, it's easy to undercharge or forget who's paid and who hasn't.",
    solution: "BantooBooks creates the invoice for you and keeps track of what's still owed.",
    cta: "How do you currently keep track of unpaid invoices?",
  },
  Receipts: {
    hook: "A customer pays you — but which invoice was it for?",
    cost: "Matching a payment to the right invoice by hand takes time, especially when they only pay part of it.",
    solution: "BantooBooks matches the payment to the invoice for you and updates the balance automatically.",
    cta: "How long does it take you to match payments to invoices?",
  },
  Inventory: {
    hook: "Ever run out of a top seller without warning?",
    cost: "Without a running stock count, it's easy to over-order what's already there and run out of what's actually selling.",
    solution: "BantooBooks keeps a live count of your stock, so you find out before you run out.",
    cta: "How do you currently know when stock is running low?",
  },
  Purchasing: {
    hook: "Not sure which supplier bills are still unpaid?",
    cost: "When bills live on paper or in your memory, it's easy to pay one twice, or miss one entirely.",
    solution: "BantooBooks tracks every bill against that supplier's balance, automatically.",
    cta: "How do you currently keep track of what you owe suppliers?",
  },
  Payments: {
    hook: "Paid a supplier — but forgot to write it down?",
    cost: "Without a record, it's easy to lose track of what's actually been paid, or pay the same bill twice.",
    solution: "BantooBooks matches the payment to the bill and updates your balance automatically.",
    cta: "How do you currently track payments you've made to suppliers?",
  },
  Reports: {
    hook: "A customer asks what they owe — do you know off the top of your head?",
    cost: "Without one place to check, answering means digging back through old invoices and receipts.",
    solution: "BantooBooks shows a customer's full statement and running balance, instantly.",
    cta: "How do you currently answer a customer's 'what do I owe' question?",
  },
  Banking: {
    hook: "Got more than one place your business money sits?",
    cost: "A bank account, a cash drawer, maybe mobile money too — each one needs its own accurate balance, or your numbers won't add up.",
    solution: "BantooBooks tracks each account separately and keeps every balance accurate.",
    cta: "How many bank, cash, or mobile money accounts does your business use?",
  },
};
const DEFAULT_FACEBOOK_STORY = {
  hook: "Still doing this the manual way?",
  cost: "Manual tracking takes time, and it's easy for something to slip through the cracks.",
  solution: "BantooBooks keeps track of it for you, automatically.",
  cta: "How do you currently handle this in your business?",
};

/**
 * tutorial_id -> override, same purpose/priority as
 * `LINKEDIN_STORY_BY_TUTORIAL_ID` above (checked first, falls back to the
 * feature-area story otherwise) — kept in its own Facebook-voiced map
 * rather than reusing the LinkedIn one, matching the existing pattern
 * where each channel has its own hook/cost/solution/cta phrasing tuned to
 * that channel's tone (Facebook = short, punchy, question-led).
 */
const FACEBOOK_STORY_BY_TUTORIAL_ID = {
  "record-a-goods-receipt": {
    hook: "Just got a delivery from a supplier — does your stock count match?",
    cost: "Without logging it properly, your recorded stock can quietly drift away from what's actually on the shelf.",
    solution: "BantooBooks updates your stock count and what you owe that supplier, in one step.",
    cta: "How do you currently check a delivery against your stock records?",
  },
  "adjust-inventory": {
    hook: "Counted your stock lately — does it match your records?",
    cost: "Stock can go missing or get miscounted, and once it does, every report built on that number is a little bit wrong.",
    solution: "BantooBooks lets you correct the on-hand count in a couple of clicks, with a reason attached.",
    cta: "How often do you check your actual stock against your records?",
  },
  "write-off-inventory": {
    hook: "Got damaged or expired stock still sitting on your books?",
    cost: "If it's not removed from your records, your inventory value stays inflated and your reports stop reflecting reality.",
    solution: "BantooBooks removes it from your count and adjusts your inventory value in one step.",
    cta: "How do you currently handle stock that's damaged, expired, or lost?",
  },
};

function buildFacebook(data) {
  const story = FACEBOOK_STORY_BY_TUTORIAL_ID[data.tutorial_id] || FACEBOOK_STORY_BY_FEATURE_AREA[data.feature_area] || DEFAULT_FACEBOOK_STORY;
  const hashtags = buildFacebookHashtags(data);

  const lines = [];
  lines.push(`# Facebook Post — ${data.title}`);
  lines.push("");
  lines.push(`${pickEmoji(data.feature_area)} ${story.hook}`);
  lines.push("");
  lines.push(story.cost);
  lines.push("");
  lines.push(story.solution);
  lines.push("");
  lines.push(`👀 Want to see it? Quick walkthrough here: "${data.title}"`);
  lines.push("");
  lines.push(story.cta);
  lines.push("");
  lines.push(hashtags.join(" "));
  lines.push("");
  return lines.join("\n");
}

function pickEmoji(featureArea) {
  const map = {
    Customers: "👥",
    Suppliers: "🚚",
    "Sales & Invoicing": "🧾",
    Payments: "💳",
    Receipts: "💰",
    Inventory: "📦",
    Reports: "📊",
    "Ask Bantoo": "🤖",
    Settings: "⚙️",
    Migration: "🔄",
    Approvals: "✅",
    Billing: "🧮",
    Purchasing: "🧾",
    Banking: "🏦",
  };
  return map[featureArea] || "✨";
}

/**
 * 3-5 hashtags tuned toward small-business/accounting/inventory/retail/
 * Africa themes — reuses the same `inferEntityNoun()`/`inferRegionHashtags()`
 * /`extractKeywords()` machinery as `buildLinkedinHashtags()` rather than a
 * 4th hashtag algorithm, but leads with `#SmallBusiness` (this is the one
 * post type explicitly aimed at small shop owners) and keeps `#BantooBooks`
 * as a low-priority fallback, same "skip the generic pair if better
 * alternatives exist" rule as LinkedIn's.
 */
function buildFacebookHashtags(data) {
  const noun = inferEntityNoun(data);
  const region = inferRegionHashtags(data);
  const keywordTags = extractKeywords([data.title, data.goal], 8)
    .filter((w) => w !== "bantoobooks")
    .map(toHashtag);
  const candidates = [
    ...(noun ? [toHashtag(pluralize(noun))] : []),
    "#SmallBusiness",
    toHashtag(data.feature_area),
    ...(region[0] ? [region[0]] : []),
    ...keywordTags,
    "#BantooBooks",
  ];
  const seen = new Set();
  const out = [];
  for (const tag of candidates) {
    const key = tag.toLowerCase().replace(/s$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= 5) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// (11) twitter.md — one primary post (<=280 chars) + alternates
// ---------------------------------------------------------------------------
const TWITTER_LIMIT = 280;
function buildTwitter(data) {
  const tags = buildHashtags(data, 1).join(" ");

  const variantA = composeTweet(`${pickEmoji(data.feature_area)} ${data.short_youtube_title}:`, data.goal, tags);
  const variantB = composeTweet(`New tutorial:`, `${data.title} — ${data.goal}`, tags);
  const variantC = composeTweet(`Did you know?`, data.expected_result, tags);

  const lines = [];
  lines.push(`# X (Twitter) Post — ${data.title}`);
  lines.push("");
  lines.push("## Primary");
  lines.push("");
  lines.push(`${variantA.text}`);
  lines.push("");
  lines.push(`_${variantA.text.length}/${TWITTER_LIMIT} characters_`);
  lines.push("");
  lines.push("## Alternate 1");
  lines.push("");
  lines.push(variantB.text);
  lines.push("");
  lines.push(`_${variantB.text.length}/${TWITTER_LIMIT} characters_`);
  lines.push("");
  lines.push("## Alternate 2");
  lines.push("");
  lines.push(variantC.text);
  lines.push("");
  lines.push(`_${variantC.text.length}/${TWITTER_LIMIT} characters_`);
  lines.push("");
  return lines.join("\n");
}

function composeTweet(prefix, body, tags) {
  const fixed = `${prefix} ` + " " + tags; // prefix + trailing tags are never trimmed
  const budget = TWITTER_LIMIT - (prefix.length + 1) - 1 - tags.length;
  const trimmedBody = truncate(body, Math.max(20, budget));
  const text = `${prefix} ${trimmedBody} ${tags}`.replace(/\s+/g, " ").trim();
  return { text };
}

// ---------------------------------------------------------------------------
// (12) email.md — a warm, helpful 1:1 note from BantooBooks' own Customer
// Success team, not a marketing blast. Deliberately distinct in voice from
// both `linkedin.md` (founder-voice business story) and `facebook.md`
// (blunt-question, shop-owner-conversational): this one opens with a plain
// "Hi there," greeting and speaks in first-person-plural ("We know...").
// Reuses existing infrastructure rather than inventing parallel logic:
// `buildCanonicalUrl()` and `buildRelatedTutorials()` (both defined further
// below, next to `buildSeo()`) for the help-article link and the "you might
// also like" list, and the same `help_center_article`-intro "why it
// matters" extraction (`extractFirstArticleParagraph()`) built for
// youtube.md's description.
//
// Word count budget: **body only** — the "## Subject line" text isn't
// counted, since a subject line isn't part of what a reader experiences as
// "the email" itself. `verify.js` enforces this under 250. If a future
// frontmatter change ever risked pushing a body over budget, the fix is to
// trim the "why it matters" sentence first — the 3 required links
// (help article / video / related tutorials) are never dropped.
// ---------------------------------------------------------------------------
const EMAIL_VIDEO_PLACEHOLDER = "TODO: paste this tutorial's published video URL once it's live";
const EMAIL_SIGNOFF = "Happy bookkeeping,\nThe BantooBooks Team";

/**
 * feature_area -> a short, warm, first-person-plural lead sentence naming
 * the same real pain point already established in
 * `FACEBOOK_STORY_BY_FEATURE_AREA`/`LINKEDIN_STORY_BY_FEATURE_AREA` — but
 * in customer-success voice ("We know...") rather than either of those
 * files' voices, and never reusing their sentences verbatim. Unmapped
 * feature areas fall back to `DEFAULT_EMAIL_WHY_LEAD`.
 */
const EMAIL_WHY_LEAD_BY_FEATURE_AREA = {
  Customers: "We know keeping track of who owes you money can be one of the trickiest parts of running a business.",
  Suppliers: "We know it's easy to lose sight of what you owe your suppliers once purchases start piling up.",
  "Sales & Invoicing":
    "We know it's easy to lose track of who's paid and who hasn't, especially once things get busy.",
  Receipts: "We know matching a payment to the right invoice can eat up more time than it should.",
  Inventory: "We know it's easy to lose track of what's actually left on your shelves.",
  Purchasing: "We know it's easy to lose track of which supplier bills you've actually paid, especially once a few come in the same week.",
  Payments: "We know it's easy to forget to log a payment the moment you make it, then lose track of what's actually been settled.",
  Reports: "We know a simple 'what do I owe you' question can turn into ten minutes of digging through old invoices if you don't have one place to look.",
  Banking: "We know most businesses keep money in more than one place — a bank account, a cash drawer, sometimes mobile money too — and each one needs its own accurate balance.",
};
const DEFAULT_EMAIL_WHY_LEAD = "We know manual tracking can take up more time than it should.";

/**
 * tutorial_id -> override, same override-layer pattern as the LinkedIn/
 * Facebook/Shorts maps above. Email genuinely needed this too: the shared
 * Inventory `whyLead` ("we know it's easy to lose track of what's actually
 * left on your shelves") is generic enough to pass for any of these 3, but
 * `EMAIL_BENEFITS_BY_FEATURE_AREA.Inventory` below is not just generic —
 * it's factually wrong for all 3 ("Add a new item in under a minute" /
 * "BantooBooks starts tracking its stock level for you right away" only
 * describes `add-inventory-item`'s actual workflow, not receiving,
 * adjusting, or writing off stock for an item that already exists). Since
 * both maps are keyed by the same lookup, both get an override together
 * for a consistent voice rather than mixing an overridden benefits list
 * with a mismatched generic lead sentence.
 */
const EMAIL_WHY_LEAD_BY_TUTORIAL_ID = {
  "record-a-goods-receipt":
    "We know it's easy for your recorded stock to quietly drift from what's actually on the shelf when a delivery isn't logged carefully.",
  "adjust-inventory":
    "We know your actual stock count doesn't always match what's in BantooBooks — items go missing, get miscounted, or just drift out of sync over time.",
  "write-off-inventory":
    "We know damaged, expired, or lost stock doesn't just disappear from your shelf — if it stays on your books, your inventory value stops reflecting reality.",
};

/**
 * feature_area -> 2 short benefit bullets — what the reader concretely gets
 * out of following the tutorial, paraphrased (never verbatim-quoted) from
 * that tutorial's own `goal`/`expected_result`.
 */
const EMAIL_BENEFITS_BY_FEATURE_AREA = {
  Customers: [
    "Add a new customer in under a minute",
    "See their balance and full history in one place, automatically",
  ],
  Suppliers: [
    "Add a new supplier in under a minute",
    "Track everything you've bought from them and paid them, in one place",
  ],
  "Sales & Invoicing": [
    "Create an invoice in a couple of minutes",
    "Your customer's balance updates automatically, so you always know who owes you",
  ],
  Receipts: [
    "Log a payment in under a minute",
    "The matching invoice flips to paid automatically — no extra steps",
  ],
  Inventory: [
    "Add a new item in under a minute",
    "BantooBooks starts tracking its stock level for you right away",
  ],
  Purchasing: [
    "Record a supplier bill in a couple of minutes",
    "That supplier's balance updates automatically, so you always know what you owe",
  ],
  Payments: [
    "Log a payment to a supplier in under a minute",
    "The matching bill flips to paid automatically — no extra steps",
  ],
  Reports: [
    "Pull up a customer's full statement in seconds",
    "See their running balance and full history, always up to date",
  ],
  Banking: [
    "Add a new bank, cash, or mobile money account in under a minute",
    "Every payment and receipt can be matched to the right account from day one",
  ],
};
const DEFAULT_EMAIL_BENEFITS = [
  "Get it done in just a couple of minutes",
  "BantooBooks keeps track of it for you automatically",
];

/** tutorial_id -> override, paired with `EMAIL_WHY_LEAD_BY_TUTORIAL_ID` above — see that comment for the rationale. */
const EMAIL_BENEFITS_BY_TUTORIAL_ID = {
  "record-a-goods-receipt": [
    "Log a delivery from a supplier in a couple of minutes",
    "Your stock count and what you owe that supplier update together, automatically",
  ],
  "adjust-inventory": [
    "Correct an item's stock count in a couple of clicks",
    "Your reason is saved alongside the adjustment, so the history stays clear",
  ],
  "write-off-inventory": [
    "Write off damaged, expired, or lost stock in a couple of clicks",
    "Your inventory value updates automatically to reflect only what's sellable",
  ],
};

function buildEmail(data) {
  const noun = seoNounPhrase(data);
  const action = primaryActionWord(data);
  // Deliberately its own, plainer register than youtube.md's title logic —
  // no "(Complete Guide)"/duration-modifier suffixes here, just a short,
  // benefit-oriented subject a real support inbox would send. Uses
  // `.toLowerCase()` (not the `lower()` helper, which only fixes the first
  // character) since `noun` can be a multi-word Title Case phrase like
  // "Customer Receipt" that needs every word lowercased for a subject line.
  const subject = `A faster way to ${action.toLowerCase()} ${pluralize(noun).toLowerCase()} in BantooBooks`;

  const whyLead = EMAIL_WHY_LEAD_BY_TUTORIAL_ID[data.tutorial_id] || EMAIL_WHY_LEAD_BY_FEATURE_AREA[data.feature_area] || DEFAULT_EMAIL_WHY_LEAD;
  const whyFact = firstSentence(extractFirstArticleParagraph(data.help_center_article) || data.expected_result);
  const benefits = EMAIL_BENEFITS_BY_TUTORIAL_ID[data.tutorial_id] || EMAIL_BENEFITS_BY_FEATURE_AREA[data.feature_area] || DEFAULT_EMAIL_BENEFITS;
  const canonicalUrl = buildCanonicalUrl(data.tutorial_id);
  const related = buildRelatedTutorials(data);

  const bodyLines = [];
  bodyLines.push("Hi there,");
  bodyLines.push("");
  bodyLines.push(`${whyLead} ${whyFact}`);
  bodyLines.push("");
  bodyLines.push("Here's what you'll get out of it:");
  bodyLines.push("");
  for (const b of benefits) bodyLines.push(`- ${b}`);
  bodyLines.push("");
  bodyLines.push(`**Help article:** ${canonicalUrl}`);
  bodyLines.push(`**Watch the video:** ${EMAIL_VIDEO_PLACEHOLDER}`);
  bodyLines.push("");
  if (related.length > 0) {
    bodyLines.push("**You might also like:**");
    for (const t of related) bodyLines.push(`- ${t.title} — ${t.canonicalUrl}`);
    bodyLines.push("");
  }
  bodyLines.push(EMAIL_SIGNOFF);

  const bodyWords = wordCount(bodyLines.join(" "));

  const lines = [];
  lines.push(`# Email Newsletter Snippet — ${data.title}`);
  lines.push("");
  lines.push("## Subject line");
  lines.push("");
  lines.push(subject);
  lines.push("");
  lines.push("## Body");
  lines.push("");
  lines.push(`**Word count:** ${bodyWords} words (target: under 250 — body only, the subject line isn't counted)`);
  lines.push("");
  lines.push(...bodyLines);
  lines.push("");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// seo.json — enterprise-grade SEO/structured-data package: length-aware meta
// title/description, tiered keyword phrases, Open Graph + Twitter Card
// blocks, an extended schema.org HowTo JSON-LD (totalTime/supply/tool/
// publisher), a canonical URL, a hand-curated related-tutorials adjacency
// map, an AI-search-optimization block (summary/retrieval-answer/key facts),
// and rich-snippet fields — all still pure functions of `data`, reusing the
// same keyword extractor / entity-noun inference / region inference / word-
// boundary truncation / step-timing heuristic built for the other builders
// rather than re-implementing any of it.
// ---------------------------------------------------------------------------

const SEO_IMAGE_PLACEHOLDER = "TODO: add a 1200x630 thumbnail image URL for this tutorial";
const SEO_LOGO_PLACEHOLDER = "TODO: add the BantooBooks logo image URL (schema.org ImageObject, recommended 600x60 minimum)";

/**
 * Canonical URL rule (documented once, here, per the task's "be consistent
 * and document the rule" instruction): drop the tutorial_id's leading
 * filler verb phrase — create-a-/create-/add-a-/add-an-/add-/record-a-/
 * record- — so the URL reads as a clean noun phrase rather than repeating
 * the verb that's already implied by being under `/help/`. Examples:
 *   create-a-customer        -> /help/customer
 *   create-a-sales-invoice   -> /help/sales-invoice
 *   record-customer-receipt  -> /help/customer-receipt
 *   add-inventory-item       -> /help/inventory-item
 */
const CANONICAL_BASE_URL = "https://www.bantoobooks.com/help";
const CANONICAL_SLUG_PREFIX_RE = /^(create-a-|create-an-|create-|add-a-|add-an-|add-|record-a-|record-)/;
function canonicalSlug(tutorialId) {
  const id = String(tutorialId || "");
  return id.replace(CANONICAL_SLUG_PREFIX_RE, "") || id;
}
function buildCanonicalUrl(tutorialId) {
  return `${CANONICAL_BASE_URL}/${canonicalSlug(tutorialId)}`;
}

/**
 * `${action} ${noun} BantooBooks`-style primary keyword: the entity noun
 * comes from a small feature-area phrase map (fuller/more natural than the
 * single-word `inferEntityNoun()`, e.g. "Sales Invoice" rather than just
 * "invoice") with `inferEntityNoun()` itself as the fallback for any
 * unmapped feature area; the action verb is the tutorial_id's own leading
 * word (never hardcoded per tutorial), so this generalizes to a 6th
 * tutorial automatically.
 */
const SEO_NOUN_PHRASE_BY_FEATURE_AREA = {
  Customers: "Customer",
  Suppliers: "Supplier",
  "Sales & Invoicing": "Sales Invoice",
  Receipts: "Customer Receipt",
  Inventory: "Inventory Item",
};
/**
 * Checked BEFORE `SEO_NOUN_PHRASE_BY_FEATURE_AREA` — a feature_area now
 * commonly hosts several distinct document types (e.g. "Sales & Invoicing"
 * covers sales invoices, credit notes, and cash sales; "Inventory" covers
 * new items, goods receipts, adjustments, and write-offs), so a single
 * feature-area-wide noun would otherwise mislabel most of them (e.g.
 * calling a credit note a "Sales Invoice", or a goods receipt an
 * "Inventory Item"). Matched against the tutorial's own tutorial_id/title,
 * most-specific-first, since some phrases are substrings of others (e.g.
 * "purchase invoice" must be checked before a bare "invoice" fallback).
 */
const SEO_NOUN_PHRASE_KEYWORDS = [
  { pattern: /credit note/i, noun: "Credit Note" },
  { pattern: /debit note/i, noun: "Debit Note" },
  { pattern: /purchase invoice/i, noun: "Purchase Invoice" },
  { pattern: /goods receipt/i, noun: "Goods Receipt" },
  { pattern: /refund receipt/i, noun: "Refund Receipt" },
  { pattern: /cash sale/i, noun: "Cash Sale" },
  { pattern: /sales invoice/i, noun: "Sales Invoice" },
  { pattern: /supplier payment/i, noun: "Supplier Payment" },
  { pattern: /low.?stock|reorder/i, noun: "Reorder Suggestion" },
  { pattern: /write.?off/i, noun: "Inventory Write-off" },
  { pattern: /adjust/i, noun: "Inventory Adjustment" },
  { pattern: /bank.*account|cash account/i, noun: "Bank Account" },
  { pattern: /customer statement/i, noun: "Customer Statement" },
  { pattern: /customer receipt/i, noun: "Customer Receipt" },
  { pattern: /inventory item/i, noun: "Inventory Item" },
];
function seoNounPhrase(data) {
  // Strip possessives ("Customer's Statement" -> "Customer Statement")
  // before matching — otherwise a title like "View a Customer's Statement"
  // fails every two-word pattern that assumes a bare space between the two
  // nouns (see the identical fix in `normalizeLabel()` above).
  const haystack = `${data.tutorial_id || ""} ${data.title || ""}`.replace(/'s\b/g, "");
  for (const { pattern, noun } of SEO_NOUN_PHRASE_KEYWORDS) {
    if (pattern.test(haystack)) return noun;
  }
  return SEO_NOUN_PHRASE_BY_FEATURE_AREA[data.feature_area] || titleCaseWords(inferEntityNoun(data) || "Entry");
}
function primaryActionWord(data) {
  const first = String(data.tutorial_id || "").split("-")[0];
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : "Use";
}
function articleFor(noun) {
  return /^[aeiou]/i.test(noun) ? "an" : "a";
}
function pluralize(word) {
  return /[sxz]$|[cs]h$/i.test(word) ? `${word}es` : `${word}s`;
}

/**
 * Same country-detection pattern as `inferRegionHashtags()` (own
 * `test_data.country` + `demo_company`, never invented) but returning a
 * plain adjective for use inside a keyword phrase rather than a `#hashtag`.
 */
const REGION_ADJECTIVE_BY_COUNTRY = { cameroon: "Cameroonian" };
const DEFAULT_REGION_ADJECTIVE = "African";
function regionAdjective(data) {
  const country = (data.test_data && data.test_data.country) || "";
  const haystack = `${country} ${data.demo_company || ""}`.toLowerCase();
  for (const [key, adjective] of Object.entries(REGION_ADJECTIVE_BY_COUNTRY)) {
    if (haystack.includes(key)) return adjective;
  }
  return DEFAULT_REGION_ADJECTIVE;
}

/** feature_area -> 2 topic phrases for secondaryKeywords, generic-but-grounded fallback for unmapped areas. */
const SEO_TOPIC_PHRASES_BY_FEATURE_AREA = {
  Customers: ["Customer Tracking Software", "Accounts Receivable"],
  Suppliers: ["Supplier Tracking Software", "Accounts Payable"],
  "Sales & Invoicing": ["Invoicing Software", "Sales Tracking"],
  Receipts: ["Payment Tracking Software", "Invoice Reconciliation"],
  Inventory: ["Stock Management Software", "Inventory Tracking"],
  Purchasing: ["Accounts Payable Software", "Supplier Bill Tracking"],
  Payments: ["Accounts Payable Software", "Supplier Payment Tracking"],
  Reports: ["Business Reporting Software", "Financial Statements"],
  Banking: ["Bank Reconciliation Software", "Cash Management"],
};
const DEFAULT_SEO_TOPIC_PHRASES = ["Small Business Accounting Software", "Bookkeeping App"];

const GENERIC_SECONDARY_FALLBACKS = [
  "BantooBooks Accounting",
  "Small Business Bookkeeping",
  "Accounting App Cameroon",
  "Business Management Software",
];
const GENERIC_LONGTAIL_FALLBACKS = [
  "A simpler way to manage a small business in BantooBooks",
  "Simple accounting software for African SMEs",
  "How BantooBooks helps small businesses stay organized",
];
const GENERIC_RELATED_FALLBACKS = [
  "bantoobooks accounting app",
  "sme bookkeeping software",
  "small business finance app cameroon",
];

/** Adds unique (case-insensitive), truthy candidates from `pool` into `used`/`out` until `out.length >= min` or the pool runs out. */
function padFromPool(out, used, min, pool) {
  for (const candidate of pool) {
    if (out.length >= min) break;
    const key = candidate.toLowerCase();
    if (used.has(key)) continue;
    used.add(key);
    out.push(candidate);
  }
}
/** Takes candidates in priority order, skipping falsy values and anything already in `used` (case-insensitive), capped at `max`; records what it keeps into `used`. */
function dedupeAgainstUsed(candidates, used, max) {
  const out = [];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const key = candidate.toLowerCase();
    if (used.has(key)) continue;
    used.add(key);
    out.push(candidate);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Builds all 4 keyword tiers together (rather than 4 independent functions)
 * so they can share one `used` de-dupe set — the task's "no duplicate
 * keyword/phrase appears across tiers" requirement — while guaranteeing
 * every tier lands with 3-5 entries via `padFromPool()` fallbacks, never an
 * empty array.
 */
function buildKeywordTiers(data) {
  const used = new Set();
  const action = primaryActionWord(data);
  const noun = seoNounPhrase(data);
  // Full lowercase, not the sentence-fragment `lower()` helper (which only
  // lowercases the first character) — needed here because `noun` can be a
  // multi-word phrase ("Sales Invoice"), and `lower()` would otherwise
  // leave "Invoice" capitalized mid-phrase (e.g. "sales Invoice").
  const lowerNoun = noun.toLowerCase();
  const article = articleFor(noun);
  const region = regionAdjective(data);
  const steps = data.step_by_step_actions || [];
  const testDataKeys = Object.keys(data.test_data || {});

  const primaryKeyword = `${action} ${noun} BantooBooks`;
  used.add(primaryKeyword.toLowerCase());

  // One grounded, tutorial-specific phrase from an actual step (not just
  // feature-area boilerplate) — reuses `summarizeStepForChapter()` (built
  // for youtube.md's chapter titles) as the phrase-assembly building block
  // rather than a 3rd short-phrase algorithm; step[1] (not step[0], which
  // tends to be a generic "click the + button" opener) usually names the
  // actual field/entity being created. Excluded when it's just a bare
  // "Verb + field-name" UI-instruction fragment (e.g. "Enter Name", "Open
  // Customer") — real people search for "create customer," never "enter
  // name," so a chapter-title-shaped imperative fragment isn't a genuine
  // keyword phrase, even though it's a perfectly good chapter title.
  const groundedStepPhraseRaw = steps.length > 1 ? summarizeStepForChapter(steps[1], testDataKeys) : null;
  const groundedStepPhrase = groundedStepPhraseRaw && !isImperativeUiFragment(groundedStepPhraseRaw) ? groundedStepPhraseRaw : null;

  const secondaryKeywords = dedupeAgainstUsed(
    [
      `${action} ${noun}`,
      groundedStepPhrase,
      `${noun} Management`,
      ...(SEO_TOPIC_PHRASES_BY_FEATURE_AREA[data.feature_area] || DEFAULT_SEO_TOPIC_PHRASES),
      `BantooBooks ${data.feature_area}`,
    ],
    used,
    5,
  );
  padFromPool(secondaryKeywords, used, 3, GENERIC_SECONDARY_FALLBACKS);

  const longTailKeywords = dedupeAgainstUsed(
    [
      `How to ${lower(action)} ${article} ${lowerNoun} in BantooBooks`,
      `${sentenceCase(lowerNoun)} management for small businesses`,
      `Accounting software for ${region} businesses`,
      `Track ${pluralize(lowerNoun)} in BantooBooks`,
    ],
    used,
    5,
  );
  padFromPool(longTailKeywords, used, 3, GENERIC_LONGTAIL_FALLBACKS);

  const relatedSearchPhrases = dedupeAgainstUsed(
    [
      `${lowerNoun} tracking app`,
      `${lowerNoun} software Cameroon`,
      `small business ${lowerNoun} app`,
      `bantoobooks ${lowerNoun} tutorial`,
    ],
    used,
    5,
  );
  padFromPool(relatedSearchPhrases, used, 3, GENERIC_RELATED_FALLBACKS);

  return { primaryKeyword, secondaryKeywords, longTailKeywords, relatedSearchPhrases };
}

/**
 * feature_area -> 50-60-char-window suffix candidates for the meta title,
 * tried longest/most-specific first; the first candidate whose total length
 * lands in [50, 60] wins, so the exact suffix chosen is deterministic per
 * tutorial without needing per-tutorial hardcoding. `(Full Guide)` /
 * `(Guide)` are always available as the last-resort default, which is also
 * what unmapped feature areas get.
 */
const META_TITLE_SUFFIXES_BY_FEATURE_AREA = {
  Customers: ["(Customer Management Guide)", "(Full Guide)", "(Guide)"],
  Suppliers: ["(Supplier Management Guide)", "(Full Guide)", "(Guide)"],
  "Sales & Invoicing": ["(Invoicing Guide)", "(Full Guide)", "(Guide)"],
  Receipts: ["(Payment Tracking Guide)", "(Full Guide)", "(Guide)"],
  Inventory: ["(Inventory Management Guide)", "(Stock Guide)", "(Guide)"],
  Purchasing: ["(Purchasing Guide)", "(Full Guide)", "(Guide)"],
  Payments: ["(Supplier Payment Guide)", "(Full Guide)", "(Guide)"],
  Reports: ["(Customer Reports Guide)", "(Full Guide)", "(Guide)"],
  Banking: ["(Banking Setup Guide)", "(Full Guide)", "(Guide)"],
};
const DEFAULT_META_TITLE_SUFFIXES = ["(Full Guide)", "(Guide)"];
function buildSeoMetaTitle(data) {
  const base = data.short_youtube_title || data.title;
  const action = stripBantooBooksSuffix(base.replace(/^how to\s+/i, ""));
  const core = `How to ${action} in BantooBooks`;
  const suffixes = META_TITLE_SUFFIXES_BY_FEATURE_AREA[data.feature_area] || DEFAULT_META_TITLE_SUFFIXES;
  for (const suffix of suffixes) {
    const candidate = `${core} ${suffix}`;
    if (candidate.length >= 50 && candidate.length <= 60) return candidate;
  }
  // Nothing landed in the ideal window (e.g. a future tutorial with an
  // unusually long/short action phrase): fall back to the shortest default
  // suffix, then clamp on a word boundary so it's never cut mid-word.
  const padded = `${core} ${DEFAULT_META_TITLE_SUFFIXES[DEFAULT_META_TITLE_SUFFIXES.length - 1]}`;
  return padded.length <= 60 ? padded : truncateAtWordBoundary(core, 60);
}

/**
 * `${goal's first sentence}${subtle CTA}` — the CTA candidates are tried
 * longest-first so the pairing that lands the *total* in the 140-160 window
 * wins; both read as calm, editorial invitations (matching the tone
 * established for `linkedin.md`), never a hard "start your free trial"
 * sell. Falls back to the shortest CTA, word-boundary-clamped, if a future
 * tutorial's goal sentence doesn't pair neatly with either.
 */
const META_DESCRIPTION_CTA_CANDIDATES = [
  " Get the full walkthrough in the BantooBooks help center.",
  " Learn how in the BantooBooks help center.",
  " See how in BantooBooks.",
];
function buildSeoMetaDescription(data) {
  const goalSentence = firstSentence(data.goal);
  for (const cta of META_DESCRIPTION_CTA_CANDIDATES) {
    const candidate = goalSentence + cta;
    if (candidate.length >= 140 && candidate.length <= 160) return candidate;
  }
  const fallback = goalSentence + META_DESCRIPTION_CTA_CANDIDATES[META_DESCRIPTION_CTA_CANDIDATES.length - 1];
  return fallback.length <= 160 ? fallback : truncateAtWordBoundary(fallback, 160);
}

/** Strips a parenthetical aside and anything after a connective clause, leaving a short noun phrase — e.g. "A BantooBooks account with access to an organization (e.g. ...)." -> "A BantooBooks account". */
function shortenPrerequisite(text) {
  const noParens = String(text || "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const clause = noParens.split(/\s+with\s+|\s+so\s+|\s+for\s+you\s+/i)[0];
  return stripTrailingPeriod(truncateAtWordBoundary(clause, 70)).trim();
}

/** "BantooBooks" + any specific account/record/feature actually named in this tutorial's own prerequisites — never invented. */
const SEO_TOOL_PATTERNS = [
  { re: /bank or cash account/i, tool: "Bank or cash account" },
  { re: /income account/i, tool: "Income account" },
  { re: /\binventory item\b/i, tool: "Inventory item" },
  { re: /at least one customer|existing customer/i, tool: "Customer record" },
  { re: /at least one supplier|existing supplier/i, tool: "Supplier record" },
  { re: /sales invoice/i, tool: "Sales invoice" },
];
function inferSeoTools(data) {
  const haystack = (data.prerequisites || []).join(" ");
  const tools = ["BantooBooks"];
  for (const { re, tool } of SEO_TOOL_PATTERNS) {
    if (re.test(haystack) && !tools.includes(tool)) tools.push(tool);
  }
  return tools;
}

/** ISO 8601 duration (e.g. "PT2M", "PT90S", "PT2M30S") from a whole number of seconds. */
function toIso8601Duration(totalSeconds) {
  const total = Math.max(1, Math.round(totalSeconds));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes === 0) return `PT${seconds}S`;
  if (seconds === 0) return `PT${minutes}M`;
  return `PT${minutes}M${seconds}S`;
}
/** Human-readable rounded-up estimate ("Under 2 minutes") from the same per-step timing heuristic used for youtube.md's title/chapters. */
function humanEstimatedTime(totalSeconds) {
  const minutes = Math.max(1, Math.ceil(totalSeconds / 60));
  return `Under ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/** Self-contained, one-paragraph "how do I do X in BantooBooks" answer for a RAG/chat-style retrieval snippet — reads as a complete answer on its own, not a fragment. */
function buildRetrievalAnswer(data) {
  const action = primaryActionWord(data);
  const noun = seoNounPhrase(data);
  const article = articleFor(noun);
  return `To ${lower(action)} ${article} ${noun.toLowerCase()} in BantooBooks, ${lower(data.goal)} Once you've done this, ${lower(data.expected_result)}`;
}

/**
 * 4-6 short, factual bullet strings for the AI-search block. Two generic
 * facts (step count, estimated time) plus the required/optional field
 * counts from `classifyTestDataFields()` (already built for faq.md) are
 * always available; a handful of feature-area-specific facts are only
 * added when this tutorial's own `expected_result`/steps text actually
 * states them — never invented — so a tutorial that doesn't exhibit a given
 * behavior simply doesn't get that bullet.
 */
const DIFFICULTY_STEP_THRESHOLD = 10; // <= 10 steps -> "Beginner", otherwise "Intermediate".
function keyFactStockStartsAtZero(data) {
  if (!/0 units on hand/i.test(data.expected_result || "")) return null;
  return "New inventory items start at 0 units on hand until you record a purchase or stock adjustment.";
}
function keyFactInvoiceStartsUnpaid(data) {
  if (!/unpaid/i.test(data.expected_result || "")) return null;
  // Purchasing's "invoice" is a bill owed *to* a supplier, settled by
  // recording a payment — not a sales invoice settled by a receipt from a
  // customer. Both genuinely start life as "Unpaid", so the fact still
  // applies, just with the correct document/settlement-action terminology
  // for this feature area instead of always assuming Sales & Invoicing.
  if (data.feature_area === "Purchasing") {
    return 'New purchase invoices (bills) start with an "Unpaid" status until a payment is recorded against them.';
  }
  return 'New sales invoices start with an "Unpaid" status until a receipt is recorded against them.';
}
function keyFactReceiptMarksInvoicePaid(data) {
  if (!/paid/i.test(data.expected_result || "") || !/invoice/i.test(data.expected_result || "")) return null;
  if (data.feature_area === "Purchasing") {
    return 'Recording a payment against a purchase invoice automatically updates its status to "Paid."';
  }
  return 'Recording a receipt against an invoice automatically updates that invoice\'s status to "Paid."';
}
function keyFactDuplicateCheck(data) {
  const steps = data.step_by_step_actions || [];
  if (!steps.some((s) => /existing|duplicate/i.test(s.action || ""))) return null;
  return "BantooBooks checks for a possible existing/duplicate contact before saving a new one.";
}
const SEO_KEY_FACT_BUILDERS = [keyFactStockStartsAtZero, keyFactInvoiceStartsUnpaid, keyFactReceiptMarksInvoicePaid, keyFactDuplicateCheck];
function buildKeyFacts(data, totalSeconds) {
  const stepCount = (data.step_by_step_actions || []).length;
  const { required, optional } = classifyTestDataFields(data);
  const facts = [
    `Takes ${stepCount} step${stepCount === 1 ? "" : "s"} from start to finish.`,
    `${humanEstimatedTime(totalSeconds)} to complete.`,
    `Only ${required.length} field${required.length === 1 ? " is" : "s are"} required to get started.`,
  ];
  if (optional.length > 0) {
    facts.push(`${optional.length} additional field${optional.length === 1 ? " is" : "s are"} optional and can be filled in later.`);
  }
  for (const build of SEO_KEY_FACT_BUILDERS) {
    const fact = build(data);
    if (fact) facts.push(fact);
  }
  facts.push(`Built for: ${data.audience}.`);
  return facts.slice(0, 6);
}

/**
 * Hand-curated "what to do next" map — deliberately explicit rather than a
 * generic algorithm, since 5 tutorials is small enough to hand-sequence
 * sensibly (e.g. create-a-customer naturally leads to invoicing them, then
 * recording their payment). A future 6th+ tutorial not yet added here falls
 * back to "other tutorials in the same feature_area" (still a genuine
 * relationship), and — if even that finds nothing, which happens for a
 * feature_area with only one tutorial so far (e.g. a newly-introduced area
 * like Reports/Payments/Banking) — to DEFAULT_RELATED_FALLBACK below rather
 * than an empty array. seo.json's relatedTutorials is real published SEO
 * metadata, not a debug/optional field, so it must never be empty; "no
 * suggestions" is not an acceptable state for it the way it might be for an
 * internal-only field.
 */
const RELATED_TUTORIALS_MAP = {
  "create-a-customer": ["create-a-sales-invoice", "record-customer-receipt"],
  "create-a-supplier": ["add-inventory-item", "create-a-sales-invoice"],
  "create-a-sales-invoice": ["record-customer-receipt", "create-a-customer"],
  "record-customer-receipt": ["create-a-sales-invoice", "create-a-customer"],
  "add-inventory-item": ["create-a-sales-invoice", "create-a-customer"],
};

/**
 * Last-resort fallback when a tutorial has neither an explicit
 * RELATED_TUTORIALS_MAP entry nor any other tutorial sharing its
 * feature_area — the 3 most foundational, broadly-relevant workflows in the
 * whole catalog, useful to literally any BantooBooks user regardless of
 * which feature area they came from.
 */
const DEFAULT_RELATED_FALLBACK = ["create-a-customer", "create-a-sales-invoice", "add-inventory-item"];

const TUTORIAL_FILENAME_RE = /^\d{3}-[a-z0-9-]+\.md$/;
const TUTORIALS_DIR = path.resolve(__dirname, "..", "..", "tutorials");
let _tutorialIndexCache = null;
/**
 * `{tutorial_id -> {tutorial_id, title, feature_area, canonicalUrl}}` for
 * every tutorial, built by independently re-reading tutorials/*.md (see the
 * comment on the fs/path/parseFrontmatter requires above). Memoized since
 * it's the same on-disk files for every tutorial built in a single run.
 * Returns an empty index (rather than throwing) if the tutorials directory
 * can't be read, so `buildRelatedTutorials()` degrades to its own
 * documented "no suggestions" fallback instead of crashing the whole build.
 */
function getTutorialIndex() {
  if (_tutorialIndexCache) return _tutorialIndexCache;
  const index = new Map();
  let filenames = [];
  try {
    filenames = fs.readdirSync(TUTORIALS_DIR).filter((f) => TUTORIAL_FILENAME_RE.test(f));
  } catch (err) {
    return index;
  }
  for (const filename of filenames) {
    const raw = fs.readFileSync(path.join(TUTORIALS_DIR, filename), "utf8");
    const { data } = parseFrontmatter(raw);
    index.set(data.tutorial_id, {
      tutorial_id: data.tutorial_id,
      title: data.title,
      feature_area: data.feature_area,
      canonicalUrl: buildCanonicalUrl(data.tutorial_id),
    });
  }
  _tutorialIndexCache = index;
  return index;
}
function buildRelatedTutorials(data) {
  const index = getTutorialIndex();
  const explicitIds = RELATED_TUTORIALS_MAP[data.tutorial_id];
  const sameFeatureAreaIds = () =>
    [...index.values()]
      .filter((t) => t.tutorial_id !== data.tutorial_id && t.feature_area === data.feature_area)
      .map((t) => t.tutorial_id);
  let ids = explicitIds || sameFeatureAreaIds();
  if (ids.length === 0) {
    ids = DEFAULT_RELATED_FALLBACK.filter((id) => id !== data.tutorial_id);
  }
  return ids
    .map((id) => index.get(id))
    .filter(Boolean)
    .slice(0, 3)
    .map((t) => ({ tutorial_id: t.tutorial_id, title: t.title, canonicalUrl: t.canonicalUrl }));
}

function buildSeo(data) {
  const metaTitle = buildSeoMetaTitle(data);
  const metaDescription = buildSeoMetaDescription(data);
  const { primaryKeyword, secondaryKeywords, longTailKeywords, relatedSearchPhrases } = buildKeywordTiers(data);
  const canonicalUrl = buildCanonicalUrl(data.tutorial_id);
  const { totalSeconds } = computeYoutubeChapters(data);
  const stepCount = (data.step_by_step_actions || []).length;
  const supply = (data.prerequisites || []).map(shortenPrerequisite).filter(Boolean);
  const tools = inferSeoTools(data);

  // `type: "article"` rather than `video.other`: this canonical URL points
  // at the written help-center article (see `canonicalUrl` above), which is
  // what this seo.json actually describes — the YouTube upload gets its own
  // metadata from youtube.md, with its own real hosted-video URL once
  // published, which is the correct place for a `video.*` OG type.
  const openGraph = {
    title: metaTitle,
    description: metaDescription,
    type: "article",
    image: SEO_IMAGE_PLACEHOLDER,
    url: canonicalUrl,
  };
  const twitterCard = {
    card: "summary_large_image",
    title: metaTitle,
    description: truncateAtWordBoundary(metaDescription, 200),
    image: SEO_IMAGE_PLACEHOLDER,
  };
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: data.title,
    description: data.goal,
    // A proper schema.org `Thing`, not a bare string — `Thing` is the safe,
    // universal supertype here since a feature_area value like "Sales &
    // Invoicing" doesn't map cleanly onto any single more specific
    // schema.org type.
    about: { "@type": "Thing", name: data.feature_area },
    url: canonicalUrl,
    image: SEO_IMAGE_PLACEHOLDER,
    totalTime: toIso8601Duration(totalSeconds),
    supply: supply.map((s) => ({ "@type": "HowToSupply", name: s })),
    tool: tools.map((t) => ({ "@type": "HowToTool", name: t })),
    publisher: { "@type": "Organization", name: "BantooBooks", url: YOUTUBE_BASE_URL, logo: SEO_LOGO_PLACEHOLDER },
    step: (data.step_by_step_actions || []).map((s) => ({
      "@type": "HowToStep",
      position: s.step,
      name: `Step ${s.step}`,
      text: s.action,
    })),
  };
  const aiSearchOptimization = {
    summaryParagraph: `${data.goal} ${firstSentence(data.expected_result)}`,
    retrievalAnswer: buildRetrievalAnswer(data),
    keyFacts: buildKeyFacts(data, totalSeconds),
  };
  const richSnippet = {
    estimatedTime: humanEstimatedTime(totalSeconds),
    difficulty: stepCount <= DIFFICULTY_STEP_THRESHOLD ? "Beginner" : "Intermediate",
    audience: data.audience,
    featureArea: data.feature_area,
  };
  const relatedTutorials = buildRelatedTutorials(data);

  return {
    metaTitle,
    metaDescription,
    canonicalUrl,
    primaryKeyword,
    secondaryKeywords,
    longTailKeywords,
    relatedSearchPhrases,
    openGraph,
    twitterCard,
    jsonLd,
    aiSearchOptimization,
    richSnippet,
    relatedTutorials,
  };
}

// ---------------------------------------------------------------------------
// Central asset-type registry — the single source of truth for "what does
// this generator write per tutorial". `generate-tutorial-assets.js`'s
// file-writing loop and `buildMetadata()`'s `files[]` table of contents are
// BOTH derived from this list, so they can't silently drift apart: add a new
// asset type here (with its builder + one-line description) and it's
// automatically written to disk *and* listed in every metadata.json.
// `metadata.json` itself is deliberately not in this list — it describes the
// *other* files in the folder, so it can't very well describe itself.
// ---------------------------------------------------------------------------
const ASSET_TYPES = [
  { file: "help.md", kind: "markdown", build: buildHelp, description: "Standalone help-center article (steps + expected result)." },
  { file: "faq.md", kind: "markdown", build: buildFaq, description: "5-9 Q&As, feature-area-aware and deterministically derived from this tutorial's fields." },
  { file: "youtube.md", kind: "markdown", build: buildYoutube, description: "Publish-ready YouTube package: title variant, full description with CTA/links, hashtags, and short chapter titles." },
  { file: "linkedin.md", kind: "markdown", build: buildLinkedin, description: "Founder-voice LinkedIn post: a relatable business-pain-point story, not a feature announcement, with a reflective CTA and 3-5 specific hashtags." },
  {
    file: "facebook.md",
    kind: "markdown",
    build: buildFacebook,
    description: "Short, conversational Facebook post for a real shop owner: problem-question hook, cost, BantooBooks fix, and a friendly CTA.",
  },
  { file: "twitter.md", kind: "markdown", build: buildTwitter, description: "X (Twitter) post plus two alternate variants, all under 280 chars." },
  {
    file: "email.md",
    kind: "markdown",
    build: buildEmail,
    description: "Warm, under-250-word Customer Success email: subject, why-it-matters + benefits, and 3 links (help article, video, related tutorials).",
  },
  {
    file: "shorts.md",
    kind: "markdown",
    build: buildShorts,
    description: "30-45s vertical-video (Shorts/Reels/TikTok) script: Hook, Problem, Fast Solution (2-3 essential actions), Result, and CTA.",
  },
  { file: "synthesia.md", kind: "markdown", build: buildSynthesia, description: "Scene-numbered Synthesia narration script with timing estimates." },
  { file: "guidde.md", kind: "markdown", build: buildGuidde, description: "Checkbox recording checklist for whoever records this in Guidde." },
  { file: "seo.json", kind: "json", build: buildSeo, description: "Enterprise SEO package: meta title/description, tiered keywords, Open Graph/Twitter Card, extended schema.org HowTo JSON-LD, AI-search block, rich snippet, and related tutorials." },
];

// ---------------------------------------------------------------------------
// (17)(18) metadata.json — thumbnail title, CTA, + table of contents
// ---------------------------------------------------------------------------
function buildMetadata(data, generatedAtIso) {
  const thumbnailTitle = suggestThumbnailTitle(data);
  const suggestedCta = suggestCta(data);
  const files = ASSET_TYPES.map((a) => ({ file: a.file, description: a.description })).sort((a, b) =>
    a.file < b.file ? -1 : a.file > b.file ? 1 : 0,
  );

  return {
    tutorial_id: data.tutorial_id,
    title: data.title,
    feature_area: data.feature_area,
    audience: data.audience,
    generatedAt: generatedAtIso,
    suggestedThumbnailTitle: thumbnailTitle,
    suggestedCTA: suggestedCta,
    files,
  };
}

/** Strips generic filler ("How to " / " in BantooBooks") and upper-cases. */
function suggestThumbnailTitle(data) {
  const base = data.short_youtube_title || data.title;
  const stripped = stripBantooBooksSuffix(base.replace(/^how to\s+/i, ""));
  return truncate(stripped, 40).toUpperCase();
}

/** Generic, feature-area-agnostic CTA built directly from `goal`. */
function suggestCta(data) {
  const goal = data.goal.replace(/\.$/, "");
  return `Ready to try it? ${goal} — right now, in BantooBooks.`;
}

// ---------------------------------------------------------------------------
// Small local string helpers
// ---------------------------------------------------------------------------
function lower(text) {
  const t = (text || "").trim();
  return t.charAt(0).toLowerCase() + t.slice(1);
}
function stripTrailingPeriod(text) {
  return (text || "").replace(/\.$/, "");
}
/** Removes a redundant trailing " in BantooBooks" so it isn't said twice next to the brand name. */
function stripBantooBooksSuffix(text) {
  return (text || "").replace(/\s+in bantoobooks$/i, "").trim();
}
function firstSentence(text) {
  const t = (text || "").trim();
  const m = t.match(/^.*?[.!?](?:\s|$)/);
  return (m ? m[0] : t).trim();
}
module.exports = {
  buildGuidde,
  buildSynthesia,
  buildHelp,
  buildFaq,
  buildYoutube,
  buildShorts,
  buildLinkedin,
  buildFacebook,
  buildTwitter,
  buildEmail,
  buildSeo,
  buildMetadata,
  ASSET_TYPES,
  // exported for verify.js / unit-style sanity checks
  buildFaqQuestions,
  faqFromAudience,
  faqFromPrerequisites,
  faqFromGettingStarted,
  faqFromExpectedResult,
  faqFromFeatureArea,
  faqFromDuplicateHandling,
  faqFromRequiredFields,
  faqFromNotableOptional,
  faqFromEditability,
  faqFromInvoiceLifecycle,
  faqFromBillLifecycle,
  faqFromReceiptSettlement,
  faqFromStockStartsAtZero,
  faqFromMoneyDirectionTerminology,
  GENERIC_OUTCOME_QUESTION,
  // exported so verify.js can drive its checks off the *exact* same
  // feature_area -> builder mapping the generator itself uses, instead of
  // maintaining a second, independently-hardcoded list of feature areas
  // that would silently drift out of sync as new areas/builders are added.
  OUTCOME_BUILDER_BY_FEATURE_AREA,
  FEATURE_AREA_EXTRA_BUILDERS,
  inferEntityNoun,
  classifyTestDataFields,
};
