import type { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks: no DB / network. -------------------------------------------------
const partnerFindUnique = vi.fn();
const referralCreate = vi.fn();
const referralFindMany = vi.fn();
const paymentRecordAggregate = vi.fn();
const commissionFindUnique = vi.fn();
const commissionCreate = vi.fn();
const commissionUpdate = vi.fn();
const commissionFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    partner: { findUnique: partnerFindUnique },
    referral: { findMany: referralFindMany, create: referralCreate },
    paymentRecord: { aggregate: paymentRecordAggregate },
    commission: {
      findUnique: commissionFindUnique,
      create: commissionCreate,
      update: commissionUpdate,
      findMany: commissionFindMany,
    },
  },
}));

const {
  attributeReferralWithin,
  computeAndUpsertCommissionsForMonth,
  getPartnerDashboardData,
  exportCommissionsCsv,
  PartnerError,
} = await import("@/lib/billing/partners");

// Minimal stand-in for Prisma.PrismaClientKnownRequestError — we only ever
// check `.code`, so a plain object with the right shape is enough and keeps
// this test free of any real Prisma/DB dependency.
function uniqueConstraintError(): Error & { code: string } {
  const err = new Error("Unique constraint failed") as Error & { code: string };
  err.code = "P2002";
  return err;
}

beforeEach(() => {
  partnerFindUnique.mockReset();
  referralCreate.mockReset();
  referralFindMany.mockReset().mockResolvedValue([]);
  paymentRecordAggregate.mockReset().mockResolvedValue({ _sum: { amountMinorUnits: null } });
  commissionFindUnique.mockReset().mockResolvedValue(null);
  commissionCreate.mockReset();
  commissionUpdate.mockReset();
  commissionFindMany.mockReset().mockResolvedValue([]);
});

describe("attributeReferralWithin", () => {
  // attributeReferralWithin takes the transaction client directly, so tests
  // pass a tiny fake `tx` rather than going through the mocked `prisma`
  // singleton — it never touches `prisma` itself.
  function fakeTx(overrides: { partner?: unknown; referralCreateImpl?: () => Promise<unknown> } = {}) {
    return {
      partner: { findUnique: vi.fn().mockResolvedValue(overrides.partner ?? null) },
      referral: { create: vi.fn(overrides.referralCreateImpl ?? (() => Promise.resolve({}))) },
    } as unknown as Prisma.TransactionClient;
  }

  it("creates a Referral when the code matches a known partner", async () => {
    const tx = fakeTx({ partner: { id: "partner_1", referralCode: "ALICE1234" } });

    await attributeReferralWithin(tx, "org_1", "alice1234");

    expect(tx.partner.findUnique).toHaveBeenCalledWith({ where: { referralCode: "ALICE1234" } });
    expect(tx.referral.create).toHaveBeenCalledWith({ data: { orgId: "org_1", partnerId: "partner_1" } });
  });

  it("is a silent no-op for an unknown/stale referral code — never throws", async () => {
    const tx = fakeTx({ partner: null });

    await expect(attributeReferralWithin(tx, "org_1", "DOES_NOT_EXIST")).resolves.toBeUndefined();
    expect(tx.referral.create).not.toHaveBeenCalled();
  });

  it("swallows a duplicate-key race on Referral.orgId without throwing", async () => {
    const tx = fakeTx({
      partner: { id: "partner_1", referralCode: "ALICE1234" },
      referralCreateImpl: () => Promise.reject(uniqueConstraintError()),
    });

    await expect(attributeReferralWithin(tx, "org_1", "ALICE1234")).resolves.toBeUndefined();
  });

  it("is a silent no-op for an empty/blank code", async () => {
    const tx = fakeTx();
    await expect(attributeReferralWithin(tx, "org_1", "   ")).resolves.toBeUndefined();
    expect(tx.partner.findUnique).not.toHaveBeenCalled();
  });
});

describe("computeAndUpsertCommissionsForMonth", () => {
  it("computes 10% of eligible revenue with BigInt-safe math", async () => {
    referralFindMany.mockResolvedValue([
      { orgId: "org_1", partnerId: "partner_1", attributedAt: new Date("2026-01-15") },
    ]);
    paymentRecordAggregate.mockResolvedValue({ _sum: { amountMinorUnits: 123_457n } });
    commissionFindUnique.mockResolvedValue(null);

    const result = await computeAndUpsertCommissionsForMonth("2026-06");

    expect(commissionCreate).toHaveBeenCalledWith({
      data: {
        partnerId: "partner_1",
        orgId: "org_1",
        periodMonth: "2026-06",
        amountMinorUnits: 12_345n, // floor(123457 * 10 / 100), integer division only
        status: "PENDING",
      },
    });
    expect(result).toEqual({ created: 1, updated: 0 });
  });

  it("excludes a referral older than the 12-month commission window", async () => {
    referralFindMany.mockResolvedValue([
      // Attributed 2024-01-01 — by 2026-06 this is well past 12 months.
      { orgId: "org_old", partnerId: "partner_1", attributedAt: new Date("2024-01-01") },
    ]);
    paymentRecordAggregate.mockResolvedValue({ _sum: { amountMinorUnits: 100_000n } });

    const result = await computeAndUpsertCommissionsForMonth("2026-06");

    expect(paymentRecordAggregate).not.toHaveBeenCalled();
    expect(commissionCreate).not.toHaveBeenCalled();
    expect(result).toEqual({ created: 0, updated: 0 });
  });

  it("includes a referral still within its 12-month window", async () => {
    referralFindMany.mockResolvedValue([
      // Attributed 2025-12-01 — 2026-06 is inside the first 12 months.
      { orgId: "org_recent", partnerId: "partner_1", attributedAt: new Date("2025-12-01") },
    ]);
    paymentRecordAggregate.mockResolvedValue({ _sum: { amountMinorUnits: 50_000n } });

    const result = await computeAndUpsertCommissionsForMonth("2026-06");

    expect(commissionCreate).toHaveBeenCalled();
    expect(result.created).toBe(1);
  });

  it("never downgrades an existing APPROVED commission's status back to PENDING", async () => {
    referralFindMany.mockResolvedValue([
      { orgId: "org_1", partnerId: "partner_1", attributedAt: new Date("2026-01-01") },
    ]);
    paymentRecordAggregate.mockResolvedValue({ _sum: { amountMinorUnits: 200_000n } });
    commissionFindUnique.mockResolvedValue({
      id: "commission_1",
      status: "APPROVED",
      amountMinorUnits: 5_000n,
    });

    const result = await computeAndUpsertCommissionsForMonth("2026-06");

    expect(commissionUpdate).toHaveBeenCalledWith({
      where: { id: "commission_1" },
      data: { amountMinorUnits: 20_000n },
    });
    // Status is never part of the update payload — APPROVED is preserved.
    const updateCall = commissionUpdate.mock.calls[0][0];
    expect(updateCall.data).not.toHaveProperty("status");
    expect(result).toEqual({ created: 0, updated: 1 });
  });

  it("never downgrades an existing PAID commission's status back to PENDING", async () => {
    referralFindMany.mockResolvedValue([
      { orgId: "org_1", partnerId: "partner_1", attributedAt: new Date("2026-01-01") },
    ]);
    paymentRecordAggregate.mockResolvedValue({ _sum: { amountMinorUnits: 0n } });
    commissionFindUnique.mockResolvedValue({
      id: "commission_paid",
      status: "PAID",
      amountMinorUnits: 20_000n,
    });

    await computeAndUpsertCommissionsForMonth("2026-06");

    expect(commissionUpdate).toHaveBeenCalledWith({
      where: { id: "commission_paid" },
      data: { amountMinorUnits: 0n },
    });
  });
});

describe("getPartnerDashboardData — isolation", () => {
  it("returns only the given partner's own referrals and commissions, never another partner's or a non-referred org's", async () => {
    partnerFindUnique.mockImplementation(({ where }: { where: { id: string } }) => {
      if (where.id === "partner_A") {
        return Promise.resolve({ id: "partner_A", name: "Partner A", email: "a@example.com", referralCode: "AAAA1234" });
      }
      if (where.id === "partner_B") {
        return Promise.resolve({ id: "partner_B", name: "Partner B", email: "b@example.com", referralCode: "BBBB1234" });
      }
      return Promise.resolve(null);
    });

    referralFindMany.mockImplementation(({ where }: { where: { partnerId: string } }) => {
      if (where.partnerId === "partner_A") {
        return Promise.resolve([
          {
            attributedAt: new Date("2026-01-01"),
            org: { id: "org_A1", name: "Org A1", createdAt: new Date("2026-01-01"), subscription: { plan: "BUSINESS", status: "ACTIVE" } },
          },
        ]);
      }
      // Partner B's own referral — must never leak into Partner A's result.
      return Promise.resolve([
        {
          attributedAt: new Date("2026-02-01"),
          org: { id: "org_B1", name: "Org B1", createdAt: new Date("2026-02-01"), subscription: { plan: "FREE", status: "FREE" } },
        },
      ]);
    });

    commissionFindMany.mockImplementation(({ where }: { where: { partnerId: string } }) => {
      if (where.partnerId === "partner_A") {
        return Promise.resolve([
          { id: "c_A1", orgId: "org_A1", periodMonth: "2026-06", amountMinorUnits: 1_000n, status: "PENDING", org: { name: "Org A1" } },
        ]);
      }
      return Promise.resolve([
        { id: "c_B1", orgId: "org_B1", periodMonth: "2026-06", amountMinorUnits: 9_999n, status: "PAID", org: { name: "Org B1" } },
      ]);
    });

    const dataA = await getPartnerDashboardData("partner_A");

    expect(dataA.partner.id).toBe("partner_A");
    expect(dataA.referredBusinesses).toHaveLength(1);
    expect(dataA.referredBusinesses[0].orgId).toBe("org_A1");
    expect(dataA.payoutHistory).toHaveLength(1);
    expect(dataA.payoutHistory[0].id).toBe("c_A1");

    // Explicitly assert none of Partner B's data appears anywhere.
    expect(dataA.referredBusinesses.some((b) => b.orgId === "org_B1")).toBe(false);
    expect(dataA.payoutHistory.some((p) => p.id === "c_B1")).toBe(false);
    const serialized = JSON.stringify(dataA, (_key, value) => (typeof value === "bigint" ? value.toString() : value));
    expect(serialized).not.toContain("org_B1");
    expect(serialized).not.toContain("Partner B");

    // And every underlying query was scoped by the requested partnerId.
    expect(referralFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { partnerId: "partner_A" } }),
    );
    expect(commissionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { partnerId: "partner_A" } }),
    );
  });

  it("throws a PartnerError for an unknown partner id rather than returning empty/default data", async () => {
    partnerFindUnique.mockResolvedValue(null);
    await expect(getPartnerDashboardData("nonexistent")).rejects.toThrow(PartnerError);
  });
});

describe("exportCommissionsCsv", () => {
  it("escapes commas and quotes in names", async () => {
    commissionFindMany.mockResolvedValue([
      {
        id: "c_1",
        periodMonth: "2026-06",
        amountMinorUnits: 12_345n,
        status: "PENDING",
        partner: { name: 'Doe, "Jane"', referralCode: "JANE1234" },
        org: { name: "Acme, Inc." },
      },
    ]);

    const csv = await exportCommissionsCsv();
    const lines = csv.split("\n");

    expect(lines[0]).toBe("Partner,Referral code,Business,Period,Amount,Status");
    // Amount (12,345) itself contains a comma from digit-grouping, so it's
    // quoted too — every field with a comma/quote/newline gets quoted.
    expect(lines[1]).toBe('"Doe, ""Jane""",JANE1234,"Acme, Inc.",2026-06,"12,345",PENDING');
  });

  it("scopes to a single partner's commissions when partnerId is given", async () => {
    commissionFindMany.mockResolvedValue([]);
    await exportCommissionsCsv("partner_A");
    expect(commissionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { partnerId: "partner_A" } }),
    );
  });
});
