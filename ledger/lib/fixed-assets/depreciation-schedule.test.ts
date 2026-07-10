import { describe, expect, it } from "vitest";

import {
  buildDecliningBalanceSchedule,
  buildSchedule,
  buildStraightLineSchedule,
} from "@/lib/fixed-assets/depreciation-schedule";

describe("buildStraightLineSchedule", () => {
  it("splits depreciable amount evenly with the remainder on the last period", () => {
    const periods = buildStraightLineSchedule({
      cost: 1_200_000n,
      salvage: 200_000n,
      usefulLifeMonths: 12,
      placedInServiceDate: new Date("2026-01-15"),
    });

    expect(periods).toHaveLength(12);
    // depreciable = 1,000,000 / 12 = 83,333.33 -> floors to 83,333/month
    expect(periods[0].depreciationAmount).toBe(83_333n);
    expect(periods[10].depreciationAmount).toBe(83_333n);
    // last period absorbs the rounding remainder
    const total = periods.reduce((s, p) => s + p.depreciationAmount, 0n);
    expect(total).toBe(1_000_000n);
    expect(periods[11].accumulatedDepreciationAfter).toBe(1_000_000n);
    expect(periods[11].bookValueAfter).toBe(200_000n); // exactly salvage
  });

  it("never lets book value fall below salvage", () => {
    const periods = buildStraightLineSchedule({
      cost: 100n,
      salvage: 40n,
      usefulLifeMonths: 6,
      placedInServiceDate: new Date("2026-01-01"),
    });
    for (const p of periods) {
      expect(p.bookValueAfter).toBeGreaterThanOrEqual(40n);
    }
    expect(periods.at(-1)!.bookValueAfter).toBe(40n);
  });

  it("produces monthly periods starting from the placed-in-service month", () => {
    const periods = buildStraightLineSchedule({
      cost: 120_000n,
      salvage: 0n,
      usefulLifeMonths: 3,
      placedInServiceDate: new Date("2026-03-20"),
    });
    expect(periods[0].periodStart.toISOString().slice(0, 10)).toBe("2026-03-01");
    expect(periods[0].periodEnd.toISOString().slice(0, 10)).toBe("2026-03-31");
    expect(periods[1].periodStart.toISOString().slice(0, 10)).toBe("2026-04-01");
    expect(periods[2].periodStart.toISOString().slice(0, 10)).toBe("2026-05-01");
  });

  it("marks a fully-depreciable-in-one-shot tiny amount as concentrated in the last period", () => {
    // depreciable (5) < usefulLifeMonths (100) -> monthly floors to 0
    const periods = buildStraightLineSchedule({
      cost: 5n,
      salvage: 0n,
      usefulLifeMonths: 100,
      placedInServiceDate: new Date("2026-01-01"),
    });
    expect(periods.slice(0, 99).every((p) => p.status === "SKIPPED")).toBe(true);
    expect(periods[99].status).toBe("SCHEDULED");
    expect(periods[99].depreciationAmount).toBe(5n);
  });

  it("rejects salvage greater than cost and non-positive useful life", () => {
    expect(() =>
      buildStraightLineSchedule({
        cost: 100n,
        salvage: 200n,
        usefulLifeMonths: 12,
        placedInServiceDate: new Date(),
      }),
    ).toThrow(/salvage/i);
    expect(() =>
      buildStraightLineSchedule({
        cost: 100n,
        salvage: 0n,
        usefulLifeMonths: 0,
        placedInServiceDate: new Date(),
      }),
    ).toThrow(/usefulLifeMonths/i);
  });
});

describe("buildDecliningBalanceSchedule", () => {
  it("defaults to double-declining balance when no rate is supplied", () => {
    // usefulLifeMonths=60 (5 years) -> default annual rate = 200/5 = 40%/yr
    const periods = buildDecliningBalanceSchedule({
      cost: 1_000_000n,
      salvage: 100_000n,
      usefulLifeMonths: 60,
      placedInServiceDate: new Date("2026-01-01"),
    });
    // monthly rate = 40%/12 = 3.3333%; first period ~= 1,000,000 * 0.033333 = 33,333
    expect(periods[0].depreciationAmount).toBe(33_333n);
    expect(periods[0].bookValueAfter).toBe(966_667n);
  });

  it("never lets book value fall below salvage and converges exactly by the last period", () => {
    const periods = buildDecliningBalanceSchedule({
      cost: 1_000_000n,
      salvage: 100_000n,
      usefulLifeMonths: 24,
      placedInServiceDate: new Date("2026-01-01"),
      ratePercent: 50,
    });
    for (const p of periods) {
      expect(p.bookValueAfter).toBeGreaterThanOrEqual(100_000n);
    }
    expect(periods.at(-1)!.bookValueAfter).toBe(100_000n);
    expect(periods.at(-1)!.accumulatedDepreciationAfter).toBe(900_000n);
  });

  it("marks periods after salvage is reached as SKIPPED with a zero amount", () => {
    // Aggressive rate reaches salvage well before useful life ends.
    const periods = buildDecliningBalanceSchedule({
      cost: 1_000_000n,
      salvage: 500_000n,
      usefulLifeMonths: 36,
      placedInServiceDate: new Date("2026-01-01"),
      ratePercent: 200,
    });
    const firstSkipped = periods.findIndex((p) => p.status === "SKIPPED");
    expect(firstSkipped).toBeGreaterThan(0);
    for (const p of periods.slice(firstSkipped)) {
      expect(p.status).toBe("SKIPPED");
      expect(p.depreciationAmount).toBe(0n);
      expect(p.bookValueAfter).toBe(500_000n);
    }
  });
});

describe("buildSchedule", () => {
  it("dispatches to the matching method", () => {
    const params = {
      cost: 100_000n,
      salvage: 0n,
      usefulLifeMonths: 10,
      placedInServiceDate: new Date("2026-01-01"),
    };
    const straight = buildSchedule("STRAIGHT_LINE", params);
    const declining = buildSchedule("DECLINING_BALANCE", params);
    expect(straight[0].depreciationAmount).toBe(10_000n);
    expect(declining[0].depreciationAmount).not.toBe(straight[0].depreciationAmount);
  });
});
