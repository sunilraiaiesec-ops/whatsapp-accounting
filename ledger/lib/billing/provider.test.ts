import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks: no DB / network. -------------------------------------------------
const setSubscriptionPlanAndStatus = vi.fn();
const getEffectiveSubscription = vi.fn();

vi.mock("@/lib/billing/subscription", () => ({
  setSubscriptionPlanAndStatus: (...args: unknown[]) => setSubscriptionPlanAndStatus(...args),
  getEffectiveSubscription: (...args: unknown[]) => getEffectiveSubscription(...args),
}));

const organizationFindUnique = vi.fn();
const paymentRecordCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: { findUnique: (...args: unknown[]) => organizationFindUnique(...args) },
    paymentRecord: { create: (...args: unknown[]) => paymentRecordCreate(...args) },
  },
}));

const {
  ManualPaymentProvider,
  StripeProvider,
  getPaymentProvider,
  adminSetPlan,
} = await import("@/lib/billing/provider");

const FAKE_SUBSCRIPTION = {
  id: "sub_1",
  orgId: "org_1",
  plan: "BUSINESS",
  status: "ACTIVE",
  trialStartAt: null,
  trialEndsAt: null,
  currentPeriodStart: new Date("2026-07-01T00:00:00Z"),
  currentPeriodEnd: new Date("2026-08-01T00:00:00Z"),
  provider: "manual",
  providerCustomerId: null,
  providerSubscriptionId: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-07-01T00:00:00Z"),
};

beforeEach(() => {
  setSubscriptionPlanAndStatus.mockReset().mockResolvedValue(FAKE_SUBSCRIPTION);
  getEffectiveSubscription.mockReset().mockResolvedValue({
    subscription: FAKE_SUBSCRIPTION,
    effectivePlan: "BUSINESS",
    trialExpired: false,
    readOnlyAccessAllowed: true,
  });
  organizationFindUnique.mockReset().mockResolvedValue({ baseCurrency: "XAF" });
  paymentRecordCreate.mockReset().mockImplementation(({ data }: { data: unknown }) =>
    Promise.resolve({ id: "pay_1", ...(data as object) }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete process.env.STRIPE_SECRET_KEY;
});

describe("adminSetPlan — recording a payment", () => {
  it("calls setSubscriptionPlanAndStatus with the right plan/status/provider", async () => {
    await adminSetPlan("org_1", {
      plan: "BUSINESS",
      status: "ACTIVE",
      amountMinorUnits: 25_000n,
      now: new Date("2026-07-05T00:00:00Z"),
    });

    expect(setSubscriptionPlanAndStatus).toHaveBeenCalledWith(
      "org_1",
      expect.objectContaining({
        plan: "BUSINESS",
        status: "ACTIVE",
        provider: "manual",
        currentPeriodStart: new Date("2026-07-05T00:00:00Z"),
      }),
    );
  });

  it("writes a PaymentRecord with the right amount/period/org/status when amountMinorUnits + status ACTIVE are given", async () => {
    const now = new Date("2026-07-05T00:00:00Z");
    const result = await adminSetPlan("org_1", {
      plan: "BUSINESS",
      status: "ACTIVE",
      amountMinorUnits: 25_000n,
      periodMonths: 1,
      now,
    });

    expect(paymentRecordCreate).toHaveBeenCalledTimes(1);
    const args = paymentRecordCreate.mock.calls[0][0];
    expect(args.data).toMatchObject({
      orgId: "org_1",
      amountMinorUnits: 25_000n,
      currency: "XAF",
      provider: "manual",
      status: "SUCCEEDED",
      periodStart: now,
      periodEnd: new Date("2026-08-05T00:00:00Z"),
    });
    expect(result.paymentRecord).not.toBeNull();
  });

  it("spans the period by periodMonths from `now`", async () => {
    const now = new Date("2026-01-15T00:00:00Z");
    await adminSetPlan("org_1", {
      plan: "ENTERPRISE",
      status: "ACTIVE",
      amountMinorUnits: 100_000n,
      periodMonths: 12,
      now,
    });

    const args = paymentRecordCreate.mock.calls[0][0];
    expect(args.data.periodStart).toEqual(now);
    expect(args.data.periodEnd).toEqual(new Date("2027-01-15T00:00:00Z"));
  });
});

describe("adminSetPlan — status change without a payment", () => {
  it("does NOT write a PaymentRecord when amountMinorUnits is not given", async () => {
    const result = await adminSetPlan("org_1", { plan: "BUSINESS", status: "ACTIVE" });
    expect(paymentRecordCreate).not.toHaveBeenCalled();
    expect(result.paymentRecord).toBeNull();
  });

  it("does NOT write a PaymentRecord for a non-ACTIVE status even with an amount given", async () => {
    const result = await adminSetPlan("org_1", {
      plan: "FREE",
      status: "PAST_DUE",
      amountMinorUnits: 5_000n,
    });
    expect(paymentRecordCreate).not.toHaveBeenCalled();
    expect(result.paymentRecord).toBeNull();
  });
});

describe("ManualPaymentProvider", () => {
  it("cancelSubscription sets plan FREE / status CANCELED", async () => {
    const provider = new ManualPaymentProvider();
    await provider.cancelSubscription("org_1");
    expect(setSubscriptionPlanAndStatus).toHaveBeenCalledWith("org_1", {
      plan: "FREE",
      status: "CANCELED",
    });
  });

  it("getSubscriptionStatus delegates to getEffectiveSubscription", async () => {
    const provider = new ManualPaymentProvider();
    const status = await provider.getSubscriptionStatus("org_1");
    expect(getEffectiveSubscription).toHaveBeenCalledWith("org_1");
    expect(status).toEqual({
      plan: "BUSINESS",
      status: "ACTIVE",
      effectivePlan: "BUSINESS",
      currentPeriodEnd: FAKE_SUBSCRIPTION.currentPeriodEnd,
    });
  });

  it("createCheckoutSession throws a clear 'use the admin panel' error", async () => {
    const provider = new ManualPaymentProvider();
    await expect(
      provider.createCheckoutSession({
        orgId: "org_1",
        plan: "BUSINESS",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      }),
    ).rejects.toThrow(/admin panel/i);
  });

  it("adminSetPlan instance method delegates to the standalone function", async () => {
    const provider = new ManualPaymentProvider();
    await provider.adminSetPlan("org_1", { plan: "BUSINESS", status: "ACTIVE" });
    expect(setSubscriptionPlanAndStatus).toHaveBeenCalled();
  });
});

describe("StripeProvider — documented stub", () => {
  it("every method throws a clear not-implemented error", async () => {
    const provider = new StripeProvider();
    await expect(
      provider.createCheckoutSession({
        orgId: "org_1",
        plan: "BUSINESS",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      }),
    ).rejects.toThrow(/not yet implemented/i);
    await expect(provider.getSubscriptionStatus("org_1")).rejects.toThrow(/not yet implemented/i);
    await expect(provider.cancelSubscription("org_1")).rejects.toThrow(/not yet implemented/i);
  });
});

describe("getPaymentProvider", () => {
  it("returns ManualPaymentProvider by default (no STRIPE_SECRET_KEY)", () => {
    delete process.env.STRIPE_SECRET_KEY;
    const provider = getPaymentProvider();
    expect(provider).toBeInstanceOf(ManualPaymentProvider);
    expect(provider.name).toBe("manual");
  });

  it("returns StripeProvider when STRIPE_SECRET_KEY is set", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake");
    const provider = getPaymentProvider();
    expect(provider).toBeInstanceOf(StripeProvider);
    expect(provider.name).toBe("stripe");
  });
});
