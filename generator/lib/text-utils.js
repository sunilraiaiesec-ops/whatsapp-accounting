"use strict";

/**
 * Small deterministic text helpers shared by the builders. No randomness,
 * no locale/timezone-dependent formatting except the single `nowIso()` used
 * for `metadata.json.generatedAt` (the one field allowed to differ between
 * runs — see generator/README.md).
 */

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "in", "on", "for", "to", "with",
  "your", "you", "this", "that", "these", "those", "is", "are", "was", "were",
  "be", "been", "it", "its", "as", "so", "at", "by", "from", "into", "up",
  "out", "if", "then", "than", "not", "no", "yes", "do", "does", "did",
  "can", "will", "just", "how", "what", "who", "when", "where", "why",
  "their", "them", "they", "we", "our", "us", "i", "my", "me", "he", "she",
  "his", "her", "have", "has", "had", "get", "gets", "goes", "go", "one",
  "some", "any", "all", "also", "already", "now", "here", "there", "each",
  // Generic filler that survives the length/dedup filters below but adds no
  // searchable/domain value on its own (e.g. "start"/"new"/"add" show up in
  // almost every tutorial's goal sentence regardless of feature area).
  "start", "started", "starting", "new", "add", "added", "adding",
]);

/** Counts whitespace-delimited words. Deterministic, locale-independent. */
function wordCount(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/** Estimated spoken seconds for a word count at a fixed words-per-minute rate. */
function estimateSeconds(words, wpm = 150) {
  return Math.round((words / wpm) * 60);
}

/** Formats a whole number of seconds as `M:SS`. */
function formatMmSs(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

/** Truncates to at most `max` chars on a word boundary, appending an ellipsis. */
function truncate(text, max) {
  const clean = (text || "").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const safe = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return safe.trimEnd() + "…";
}

/**
 * Truncates to at most `max` chars, always cutting at the last whitespace
 * boundary at or before the limit — unlike `truncate()`, there is no
 * "only trim to a word boundary if it isn't too far back" threshold, so this
 * never lands mid-word (the one exception being a single "word" longer than
 * the entire budget, which has no boundary to cut at). Used anywhere a
 * mid-word cut would look obviously broken (YouTube chapter labels, SEO meta
 * descriptions) rather than just visually a bit short.
 */
function truncateAtWordBoundary(text, max) {
  const clean = (text || "").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const safe = lastSpace > -1 ? cut.slice(0, lastSpace) : cut;
  return safe.trimEnd() + "…";
}

/**
 * Lowercases, strips punctuation, splits on whitespace, drops stopwords and
 * very short tokens, dedupes preserving first-seen order, caps the result.
 * Used identically for SEO keywords and hashtag derivation so both stay
 * consistent with each other.
 */
function extractKeywords(texts, max = 12) {
  const seen = new Set();
  const out = [];
  for (const text of texts) {
    const tokens = String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9&\s-]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    for (const tok of tokens) {
      const word = tok.replace(/^-+|-+$/g, "");
      if (word.length < 3) continue;
      if (STOPWORDS.has(word)) continue;
      if (seen.has(word)) continue;
      seen.add(word);
      out.push(word);
      if (out.length >= max) return out;
    }
  }
  return out;
}

/** Converts a keyword/word into a `#CamelCase` hashtag token. */
function toHashtag(word) {
  return (
    "#" +
    word
      .split(/[\s&-]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join("")
  );
}

/** Splits a `|` block scalar's text into paragraphs (blank-line separated). */
function splitParagraphs(text) {
  return String(text || "")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * Splits guidde_recording_notes into checklist-ready segments. Every existing
 * tutorial writes this field as consecutive `Label: sentence...` topics
 * (Zoom level / Blur/avoid / Pacing / Click precision) that hard-wrap across
 * source lines. We normalize whitespace first (so wrapped lines rejoin into
 * one line per topic) and then split right before each known label. If a
 * future tutorial doesn't use any of those labels, we fall back to
 * splitting on sentence boundaries so the checklist still gets *something*
 * usable instead of one giant paragraph.
 */
const GUIDDE_LABELS = ["Zoom level", "Blur/avoid", "Pacing", "Click precision"];
function splitGuiddeNotes(text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const labelPattern = GUIDDE_LABELS.map((l) => l.replace(/[/]/g, "\\/")).join("|");
  const re = new RegExp(`(?=(?:${labelPattern}):)`, "g");
  const parts = normalized.split(re).map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1) return parts;
  // Fallback: no recognized labels — split on sentence-ending punctuation.
  return normalized
    .split(/(?<=[.!?])\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Bumps every markdown ATX heading in `text` down by `levels` (## -> ###). */
function demoteHeadings(text, levels = 1) {
  const hashes = "#".repeat(levels);
  return String(text || "").replace(/^(#{1,6})(\s)/gm, (_, h, sp) => `${h}${hashes}${sp}`);
}

/**
 * Drops a "Steps" ATX heading section (matched case-insensitively, at any
 * heading level) from a markdown blob, along with everything under it up to
 * (but not including) the next heading at the same or a shallower level.
 * Used to de-duplicate `help_center_article`'s own "## Steps" narrative
 * against `help.md`'s numbered step list, which is already built straight
 * from `step_by_step_actions` and is the more scannable of the two.
 * Collapses any resulting run of blank lines down to a single blank line.
 */
function stripStepsSection(text) {
  const lines = String(text || "").split("\n");
  const out = [];
  let skipping = false;
  let skipLevel = 0;
  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      if (skipping && level <= skipLevel) skipping = false;
      if (!skipping && /^steps$/i.test(heading[2].trim())) {
        skipping = true;
        skipLevel = level;
        continue;
      }
    }
    if (skipping) continue;
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

module.exports = {
  STOPWORDS,
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
};
