import { beforeEach, describe, expect, it, vi } from "vitest";

const subscriptionFindUnique = vi.fn();
const subscriptionUpsert = vi.fn();
const subscriptionUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscription: {
      findUnique: subscriptionFindUnique,
      upsert: subscriptionUpsert,
      update: subscriptionUpdate,
    },
  },
}));

const {
  getEffectiveSubscription,
  getTrialBannerInfo,
  trialSubscriptionCreateData,
  setSubscriptionPlanAndStatus,
} = await import("@/lib/billing/subscription");

function sub(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "sub_1",
    orgId: "org_1",
    plan: "BUSINESS",
    status: "TRIALING",
    trialStartAt: new Date("2026-06-01T00:00:00Z"),
    trialEndsAt: new Date("2026-06-15T00:00:00Z"),
    currentPeriodStart: null,
    currentPeriodEnd: null,
    provider: null,
    providerCustomerId: null,
    providerSubscriptionId: null,
    createdAt: new Date("2026-06-01T00:00:00Z"),
    updatedAt: new Date("2026-06-01T00:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  subscriptionFindUnique.mockReset();
  subscriptionUpsert.mockReset();
  subscriptionUpdate.mockReset();
});

describe("trialSubscriptionCreateData", () => {
  it("starts a TRIALING BUSINESS trial ending 14 days out", () => {
    const now = new Date("2026-07-01T00:00:00Z");
    const data = trialSubscriptionCreateData(now);
    expect(data.plan).toBe("BUSINESS");
    expect(data.status).toBe("TRIALING");
    expect(data.trialStartAt).toEqual(now);
    expect((data.trialEndsAt as Date).getTime() - now.getTime()).toBe(14 * 24 * 60 * 60 * 1000);
  });
});

describe("getEffectiveSubscription", () => {
  it("honors the BUSINESS trial plan while trialEndsAt is in the future", async () => {
    subscriptionFindUnique.mockResolvedValue(sub());
    const now = new Date("2026-06-10T00:00:00Z"); // before trialEndsAt
    const result = await getEffectiveSubscription("org_1", now);
    expect(result.effectivePlan).toBe("BUSINESS");
    expect(result.trialExpired).toBe(false);
  });

  it("lazily downgrades an expired trial to FREE/FREE without touching business data", async () => {
    subscriptionFindUnique.mockResolvedValue(sub());
    subscriptionUpdate.mockResolvedValue(sub({ plan: "FREE", status: "FREE" }));
    const now = new Date("2026-07-01T00:00:00Z"); // after trialEndsAt
    const result = await getEffectiveSubscription("org_1", now);
    expect(result.effectivePlan).toBe("FREE");
    expect(result.trialExpired).toBe(true);
    expect(subscriptionUpdate).toHaveBeenCalledWith({
      where: { orgId: "org_1" },
      data: { plan: "FREE", status: "FREE" },
    });
    expect(result.readOnlyAccessAllowed).toBe(true);
  });

  it("honors an ACTIVE paid subscription's configured plan", async () => {
    subscriptionFindUnique.mockResolvedValue(sub({ status: "ACTIVE", plan: "ENTERPRISE" }));
    const result = await getEffectiveSubscription("org_1");
    expect(result.effectivePlan).toBe("ENTERPRISE");
  });

  it("falls back to FREE for a CANCELED subscription", async () => {
    subscriptionFindUnique.mockResolvedValue(sub({ status: "CANCELED", plan: "BUSINESS" }));
    const result = await getEffectiveSubscription("org_1");
    expect(result.effectivePlan).toBe("FREE");
  });

  it("creates a fresh trial for an org with no Subscription row yet (legacy org)", async () => {
    subscriptionFindUnique.mockResolvedValue(null);
    subscriptionUpsert.mockResolvedValue(sub());
    const now = new Date("2026-06-10T00:00:00Z"); // before this fixture's trialEndsAt
    const result = await getEffectiveSubscription("org_1", now);
    expect(subscriptionUpsert).toHaveBeenCalled();
    expect(result.effectivePlan).toBe("BUSINESS");
  });
});

describe("getTrialBannerInfo", () => {
  it("returns days-left info while trialing", async () => {
    subscriptionFindUnique.mockResolvedValue(
      sub({ trialEndsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) }),
    );
    const info = await getTrialBannerInfo("org_1");
    expect(info).not.toBeNull();
    expect(info!.daysLeft).toBeGreaterThanOrEqual(2);
    expect(info!.expired).toBe(false);
  });

  it("returns null once no longer meaningfully on trial (e.g. ACTIVE)", async () => {
    subscriptionFindUnique.mockResolvedValue(sub({ status: "ACTIVE" }));
    const info = await getTrialBannerInfo("org_1");
    expect(info).toBeNull();
  });
});

describe("setSubscriptionPlanAndStatus", () => {
  it("updates plan/status via the single mutation path", async () => {
    subscriptionFindUnique.mockResolvedValue(sub());
    subscriptionUpdate.mockResolvedValue(sub({ plan: "ENTERPRISE", status: "ACTIVE" }));
    const result = await setSubscriptionPlanAndStatus("org_1", { plan: "ENTERPRISE", status: "ACTIVE" });
    expect(result.plan).toBe("ENTERPRISE");
    expect(subscriptionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: "org_1" } }),
    );
  });
});
