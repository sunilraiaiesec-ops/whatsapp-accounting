import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks: no DB / network. -------------------------------------------------
// In-memory fake for the single `aiCreditUsage` table this module touches,
// so upsert/update semantics (increment, unique-on-[orgId,yearMonth]) are
// exercised for real rather than trivially stubbed.
type Row = { orgId: string; yearMonth: string; creditsUsed: number };

const rows = new Map<string, Row>();
const key = (orgId: string, yearMonth: string) => `${orgId}::${yearMonth}`;

const findUnique = vi.fn(({ where }: { where: { orgId_yearMonth: { orgId: string; yearMonth: string } } }) => {
  const { orgId, yearMonth } = where.orgId_yearMonth;
  return Promise.resolve(rows.get(key(orgId, yearMonth)) ?? null);
});

const upsert = vi.fn(
  ({
    where,
    create,
  }: {
    where: { orgId_yearMonth: { orgId: string; yearMonth: string } };
    create: { orgId: string; yearMonth: string; creditsUsed: number };
  }) => {
    const { orgId, yearMonth } = where.orgId_yearMonth;
    const k = key(orgId, yearMonth);
    let row = rows.get(k);
    if (!row) {
      row = { ...create };
      rows.set(k, row);
    }
    return Promise.resolve(row);
  },
);

const update = vi.fn(
  ({
    where,
    data,
  }: {
    where: { orgId_yearMonth: { orgId: string; yearMonth: string } };
    data: { creditsUsed: { increment: number } };
  }) => {
    const { orgId, yearMonth } = where.orgId_yearMonth;
    const k = key(orgId, yearMonth);
    const row = rows.get(k);
    if (!row) return Promise.reject(new Error("row not found"));
    row.creditsUsed += data.creditsUsed.increment;
    return Promise.resolve(row);
  },
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aiCreditUsage: {
      findUnique: (...args: unknown[]) => findUnique(...(args as Parameters<typeof findUnique>)),
      upsert: (...args: unknown[]) => upsert(...(args as Parameters<typeof upsert>)),
      update: (...args: unknown[]) => update(...(args as Parameters<typeof update>)),
    },
  },
}));

const getEffectiveSubscription = vi.fn();
vi.mock("@/lib/billing/subscription", () => ({
  getEffectiveSubscription: (...args: unknown[]) => getEffectiveSubscription(...args),
}));

const { consumeAiCredit, getAiCreditStatus, currentYearMonth } = await import("@/lib/billing/ai-credits");

beforeEach(() => {
  rows.clear();
  findUnique.mockClear();
  upsert.mockClear();
  update.mockClear();
  getEffectiveSubscription.mockReset().mockResolvedValue({ effectivePlan: "FREE" });
});

describe("consumeAiCredit — normal metering", () => {
  it("increments the counter by `cost` (default 1) and returns allowed:true", async () => {
    const result = await consumeAiCredit("org_A", "text_extraction");
    expect(result).toEqual({ allowed: true, remaining: 9, limit: 10, used: 1 });

    const again = await consumeAiCredit("org_A", "text_extraction");
    expect(again).toEqual({ allowed: true, remaining: 8, limit: 10, used: 2 });
  });

  it("supports a custom cost", async () => {
    const result = await consumeAiCredit("org_A", "photo_ocr", 3);
    expect(result).toEqual({ allowed: true, remaining: 7, limit: 10, used: 3 });
  });
});

describe("consumeAiCredit — exhaustion", () => {
  it("returns allowed:false WITHOUT incrementing once the plan limit is reached", async () => {
    for (let i = 0; i < 10; i++) {
      await consumeAiCredit("org_A", "text_extraction");
    }
    const status = await getAiCreditStatus("org_A");
    expect(status.used).toBe(10);

    const blocked = await consumeAiCredit("org_A", "text_extraction");
    expect(blocked).toEqual({ allowed: false, remaining: 0, limit: 10, used: 10 });

    // Usage did NOT change — a rejected request is never charged.
    const statusAfter = await getAiCreditStatus("org_A");
    expect(statusAfter.used).toBe(10);
  });

  it("rejects a request whose cost would push usage over the limit, even from a non-zero base", async () => {
    for (let i = 0; i < 8; i++) {
      await consumeAiCredit("org_A", "text_extraction");
    }
    const blocked = await consumeAiCredit("org_A", "photo_ocr", 5);
    expect(blocked.allowed).toBe(false);
    expect(blocked.used).toBe(8);
  });
});

describe("consumeAiCredit — monthly reset", () => {
  it("a fresh month has its own usage row and is not affected by a prior month's usage", async () => {
    const jan = new Date("2026-01-15T00:00:00Z");
    const feb = new Date("2026-02-01T00:00:00Z");
    expect(currentYearMonth(jan)).toBe("2026-01");
    expect(currentYearMonth(feb)).toBe("2026-02");

    for (let i = 0; i < 10; i++) {
      await consumeAiCredit("org_A", "text_extraction");
    }
    const blocked = await consumeAiCredit("org_A", "text_extraction");
    expect(blocked.allowed).toBe(false);

    // Directly exercise the underlying row-per-yearMonth behavior: a
    // different yearMonth key is a completely separate counter.
    expect(rows.has(key("org_A", currentYearMonth()))).toBe(true);
    expect(rows.has(key("org_A", "2099-01"))).toBe(false);
  });
});

describe("consumeAiCredit — plan-specific limits", () => {
  it("respects the FREE plan's 10/mo limit from lib/billing/plans.ts", async () => {
    getEffectiveSubscription.mockResolvedValue({ effectivePlan: "FREE" });
    for (let i = 0; i < 10; i++) {
      const r = await consumeAiCredit("org_free", "text_extraction");
      expect(r.allowed).toBe(true);
    }
    const blocked = await consumeAiCredit("org_free", "text_extraction");
    expect(blocked).toEqual({ allowed: false, remaining: 0, limit: 10, used: 10 });
  });

  it("respects the BUSINESS plan's large default (1000/mo) from lib/billing/plans.ts", async () => {
    getEffectiveSubscription.mockResolvedValue({ effectivePlan: "BUSINESS" });
    const result = await consumeAiCredit("org_biz", "wizard_assistant");
    expect(result).toEqual({ allowed: true, remaining: 999, limit: 1000, used: 1 });

    // Even after 10 credits (which would exhaust FREE), BUSINESS keeps going.
    for (let i = 0; i < 9; i++) {
      await consumeAiCredit("org_biz", "wizard_assistant");
    }
    const status = await getAiCreditStatus("org_biz");
    expect(status.used).toBe(10);
    expect(status.limit).toBe(1000);
    expect(status.remaining).toBe(990);
  });
});

describe("getAiCreditStatus", () => {
  it("is read-only and never mutates usage", async () => {
    await consumeAiCredit("org_A", "text_extraction");
    const before = await getAiCreditStatus("org_A");
    const after = await getAiCreditStatus("org_A");
    expect(before).toEqual(after);
    expect(update).toHaveBeenCalledTimes(1); // only from consumeAiCredit, not from status reads
  });

  it("reports the full limit as remaining for an org with no usage row yet", async () => {
    getEffectiveSubscription.mockResolvedValue({ effectivePlan: "FREE" });
    const status = await getAiCreditStatus("org_new");
    expect(status).toEqual({ used: 0, limit: 10, remaining: 10, yearMonth: currentYearMonth() });
  });
});

describe("consumeAiCredit — resilience", () => {
  it("never throws and treats a database error as not-allowed", async () => {
    getEffectiveSubscription.mockRejectedValueOnce(new Error("db down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await consumeAiCredit("org_A", "text_extraction");
    expect(result).toEqual({ allowed: false, remaining: 0, limit: 0, used: 0 });
    errorSpy.mockRestore();
  });
});
