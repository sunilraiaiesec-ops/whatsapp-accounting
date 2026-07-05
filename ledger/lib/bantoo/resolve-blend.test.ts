import { describe, expect, it } from "vitest";

// Pure-function tests for the entity-matching + pattern-learning blend used in
// resolveExtraction (lib/bantoo/resolve.ts). No DB/network — blendEntity takes
// plain candidate objects.
import { blendEntity } from "@/lib/bantoo/resolve";

describe("blendEntity", () => {
  it("FILL: uses the pattern's own high-confidence candidate when text found nothing", () => {
    const result = blendEntity(undefined, {
      id: "sup_A",
      label: "Supplier A",
      score: 92,
      bucket: "high",
      count: 18,
      reason: "Suggested because Supplier A was used 18 times for this product.",
    });
    expect(result.id).toBe("sup_A");
    expect(result.reason).toContain("18 times");
  });

  it("low confidence pattern suggestion never auto-selects", () => {
    const result = blendEntity(undefined, {
      id: "sup_A",
      label: "Supplier A",
      score: 40,
      bucket: "low",
      count: 1,
      reason: "Suggested because Supplier A was used 1 time for this product.",
    });
    // Still surfaced (reason present, for a "show as an option" affordance),
    // but never auto-selected.
    expect(result.id).toBeNull();
    expect(result.reason).toBeDefined();
  });

  it("BOOST: reinforces a borderline text match that agrees with the pattern, crossing into auto-select", () => {
    const result = blendEntity(
      { id: "sup_A", score: 75 },
      { id: "sup_A", label: "Supplier A", score: 90, bucket: "high", count: 12, reason: "used often" },
    );
    expect(result.score).toBeGreaterThan(75);
    expect(result.id).toBe("sup_A"); // 75 + round(90*0.2)=18 => 93 >= 90
  });

  it("does not override an already-decent (>=60) text match with a different pattern candidate", () => {
    const result = blendEntity(
      { id: "sup_TEXT", score: 65 },
      { id: "sup_PATTERN", label: "Supplier P", score: 95, bucket: "high", count: 20, reason: "used often" },
    );
    // Text's own candidate stands; pattern doesn't hijack an already-reasonable match.
    expect(result.id).toBeNull(); // 65 < 90, so not auto-selected either way, but crucially not sup_PATTERN
    expect(result.score).toBe(65);
  });

  it("with no pattern data at all, behaves like plain text-based auto-select thresholds", () => {
    expect(blendEntity({ id: "x", score: 95 }, undefined).id).toBe("x");
    expect(blendEntity({ id: "x", score: 70 }, undefined).id).toBeNull();
    expect(blendEntity(undefined, undefined).id).toBeNull();
  });
});
