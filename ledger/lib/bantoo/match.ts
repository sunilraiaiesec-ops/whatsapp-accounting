import type { MatchBucket, MatchCandidate } from "@/lib/bantoo/types";

// ---------------------------------------------------------------------------
// Ask Bantoo fuzzy matching engine.
//
// A small, dependency-free matcher that scores how well a free-text query (from
// AI extraction OR the rule-based fallback) matches an org's existing master
// data. Scores are 0–100 and combine several strategies so typos, accents,
// casing and partial/token matches all resolve to the right record:
//   - exact / case-insensitive / accent-insensitive (via normalize)
//   - substring containment
//   - per-token exact coverage (subset match, e.g. "Pampers midi")
//   - per-token + whole-string fuzzy (Dice bigram + Levenshtein ratio) for typos
//
// The score drives confidence buckets (see bucketFor): high → auto-select,
// medium → offer best + alternatives + "create new", low → leave empty.
// ---------------------------------------------------------------------------

// >= HIGH: confident enough to auto-select the existing record.
// >= MEDIUM (and < HIGH): show best match highlighted + alternatives.
// < MEDIUM: no reliable match; leave empty and allow creating a new record.
export const MATCH_HIGH = 90;
export const MATCH_MEDIUM = 60;

export function bucketFor(score: number): MatchBucket {
  if (score >= MATCH_HIGH) return "high";
  if (score >= MATCH_MEDIUM) return "medium";
  return "low";
}

// Lowercase, strip diacritics (NFD + combining marks), drop punctuation and
// collapse whitespace. "Épicerie" → "epicerie", "Elhaji" → "elhaji".
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return s.split(" ").filter(Boolean);
}

// Sørensen–Dice coefficient over character bigrams (0..1). Good at catching
// transpositions and shared substrings independent of length.
function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i += 1) {
    const bg = a.slice(i, i + 2);
    bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1);
  }
  let intersection = 0;
  for (let i = 0; i < b.length - 1; i += 1) {
    const bg = b.slice(i, i + 2);
    const count = bigrams.get(bg) ?? 0;
    if (count > 0) {
      bigrams.set(bg, count - 1);
      intersection += 1;
    }
  }
  return (2 * intersection) / (a.length - 1 + (b.length - 1));
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

// Normalized edit-distance similarity (0..1).
function levenshteinRatio(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

// Similarity between two single tokens (0..1): exact, else the stronger of
// Dice / Levenshtein so short typos ("adom" vs "adoum") still score well.
function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  return Math.max(diceCoefficient(a, b), levenshteinRatio(a, b));
}

// Core similarity between a query and a candidate string, returned as 0..1.
export function similarity(query: string, target: string): number {
  const nq = normalizeText(query);
  const nt = normalizeText(target);
  if (!nq || !nt) return 0;
  if (nq === nt) return 1; // exact / case- / accent-insensitive

  const qt = tokens(nq);
  const tt = tokens(nt);

  // Substring containment (e.g. "elhaji" within "elhaji adoum").
  const contains = nt.includes(nq) || nq.includes(nt) ? 0.9 : 0;

  // Per-token analysis: how many query tokens are covered, and how well.
  const tset = new Set(tt);
  let exactMatched = 0;
  let fuzzySum = 0;
  for (const q of qt) {
    if (tset.has(q)) {
      exactMatched += 1;
      fuzzySum += 1;
      continue;
    }
    let best = 0;
    for (const t of tt) best = Math.max(best, tokenSimilarity(q, t));
    fuzzySum += best;
  }
  const exactCoverage = qt.length ? exactMatched / qt.length : 0;
  const tokenAvg = qt.length ? fuzzySum / qt.length : 0;

  // Whole-string fuzzy (spaces removed so token order/count doesn't dominate).
  const strippedQ = nq.replace(/\s+/g, "");
  const strippedT = nt.replace(/\s+/g, "");
  const whole = Math.max(diceCoefficient(strippedQ, strippedT), levenshteinRatio(nq, nt));

  let score = Math.max(contains, whole, tokenAvg);

  // Subset match: every query token appears EXACTLY in the target
  // (e.g. "Pampers midi" → "Pampers Diapers Midi x4"). This is a strong,
  // deliberate signal, so it is allowed to reach the auto-select bucket. Fuzzy
  // (typo) matches deliberately do NOT get this boost — they stay selectable.
  if (exactCoverage === 1 && qt.length > 0) {
    score = Math.max(score, 0.9 + 0.1 * Math.min(1, qt.length / tt.length));
  }

  return Math.max(0, Math.min(1, score));
}

export type RankInput = {
  id: string;
  label: string;
  // Text used for scoring (defaults to `label`). For products this can combine
  // name + code so a code query still matches.
  text?: string;
  sub?: string;
};

export type RankOptions = {
  // Drop candidates below this 0–100 score (keeps dropdowns tidy).
  floor?: number;
  limit?: number;
};

// Rank candidates for a query, returning them sorted by descending score with a
// 0–100 score and a confidence bucket attached.
export function rankMatches(
  query: string,
  candidates: RankInput[],
  options: RankOptions = {},
): MatchCandidate[] {
  const floor = options.floor ?? 35;
  const limit = options.limit ?? 8;
  const q = query.trim();
  if (!q) return [];

  return candidates
    .map((c) => {
      const score = Math.round(similarity(q, c.text ?? c.label) * 100);
      return { id: c.id, label: c.label, sub: c.sub, score, bucket: bucketFor(score) };
    })
    .filter((c) => c.score >= floor)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
