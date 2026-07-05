import { describe, expect, it } from "vitest";

import {
  MATCH_HIGH,
  MATCH_MEDIUM,
  bucketFor,
  normalizeText,
  rankMatches,
  similarity,
} from "@/lib/bantoo/match";

function pct(query: string, target: string): number {
  return Math.round(similarity(query, target) * 100);
}

describe("normalizeText", () => {
  it("lowercases, strips accents and punctuation", () => {
    expect(normalizeText("Épicerie du Marché!")).toBe("epicerie du marche");
    expect(normalizeText("  Elhaji   Adoum  ")).toBe("elhaji adoum");
  });
});

describe("similarity strategies", () => {
  it("scores an exact match 100", () => {
    expect(pct("Elhaji Adoum", "Elhaji Adoum")).toBe(100);
  });

  it("is case-insensitive", () => {
    expect(pct("elhaji adoum", "Elhaji Adoum")).toBe(100);
  });

  it("is accent/diacritic-insensitive", () => {
    expect(pct("Epicerie", "Épicerie")).toBe(100);
    expect(pct("epicerie centrale", "Épicerie Centrale")).toBe(100);
  });

  it("tolerates typos (fuzzy) with a solid but non-exact score", () => {
    const score = pct("elhaj adom", "Elhaji Adoum");
    expect(score).toBeGreaterThanOrEqual(MATCH_MEDIUM);
    expect(score).toBeLessThan(100);
  });

  it("scores token-subset (partial) matches high", () => {
    // "Pampers midi" → "Pampers Diapers Midi x4": all query tokens present.
    expect(pct("Pampers midi", "Pampers Diapers Midi x4")).toBeGreaterThanOrEqual(MATCH_HIGH);
  });

  it("scores unrelated strings low", () => {
    expect(pct("rice", "Elhaji Adoum")).toBeLessThan(MATCH_MEDIUM);
  });
});

describe("bucketFor boundaries", () => {
  it("classifies at the documented thresholds", () => {
    expect(bucketFor(100)).toBe("high");
    expect(bucketFor(90)).toBe("high");
    expect(bucketFor(89)).toBe("medium");
    expect(bucketFor(60)).toBe("medium");
    expect(bucketFor(59)).toBe("low");
    expect(bucketFor(0)).toBe("low");
  });
});

describe("rankMatches", () => {
  const suppliers = [
    { id: "s1", label: "Elhaji Adoum" },
    { id: "s2", label: "Adamou Trading" },
    { id: "s3", label: "Mahamat Store" },
  ];

  it("returns the correct top candidate for a typo query", () => {
    const ranked = rankMatches("elhaj adom", suppliers);
    expect(ranked[0]?.id).toBe("s1");
    expect(ranked[0]?.bucket).not.toBe("low");
  });

  it("auto-select bucket for a strong partial product match", () => {
    const products = [
      { id: "p1", label: "PRD-1 — Pampers Diapers Midi x4", text: "Pampers Diapers Midi x4 PRD-1" },
      { id: "p2", label: "PRD-2 — Rice 25kg", text: "Rice 25kg PRD-2" },
    ];
    const ranked = rankMatches("Pampers midi", products);
    expect(ranked[0]?.id).toBe("p1");
    expect(ranked[0]?.bucket).toBe("high");
  });

  it("sorts by score descending and drops weak matches", () => {
    const ranked = rankMatches("adamou", suppliers);
    expect(ranked[0]?.id).toBe("s2");
    expect(ranked.every((c, i) => i === 0 || c.score <= ranked[i - 1].score)).toBe(true);
  });

  it("returns nothing for an empty query", () => {
    expect(rankMatches("", suppliers)).toEqual([]);
  });
});
