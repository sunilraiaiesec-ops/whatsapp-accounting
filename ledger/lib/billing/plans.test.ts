import { describe, expect, it } from "vitest";

import { PLANS, getPlanLimits, formatBytes, WARNING_THRESHOLD_RATIO, TRIAL_LENGTH_DAYS } from "@/lib/billing/plans";

describe("plans config", () => {
  it("FREE plan has finite, small limits on every countable resource", () => {
    const free = getPlanLimits("FREE");
    expect(free.maxUsers).toBe(2);
    expect(free.maxInvoicesPerMonth).toBe(20);
    expect(free.maxInventoryItems).toBe(50);
    expect(free.maxCustomers).toBe(50);
    expect(free.maxSuppliers).toBe(20);
    expect(free.aiCreditsPerMonth).toBe(10);
    expect(free.storageBytes).toBeGreaterThan(0);
    expect(Object.values(free.features).every((v) => v === false)).toBe(true);
  });

  it("BUSINESS plan is effectively unlimited on every countable resource but still meters AI/storage", () => {
    const business = getPlanLimits("BUSINESS");
    expect(business.maxUsers).not.toBeNull();
    expect(business.maxInvoicesPerMonth).toBeNull();
    expect(business.maxInventoryItems).toBeNull();
    expect(business.maxCustomers).toBeNull();
    expect(business.maxSuppliers).toBeNull();
    expect(business.aiCreditsPerMonth).toBeGreaterThan(free().aiCreditsPerMonth);
    expect(business.storageBytes).toBeGreaterThan(free().storageBytes);
    expect(Object.values(business.features).every((v) => v === true)).toBe(true);
  });

  it("ENTERPRISE plan has no finite countable limits and the most generous AI/storage", () => {
    const enterprise = getPlanLimits("ENTERPRISE");
    expect(enterprise.maxUsers).toBeNull();
    expect(enterprise.aiCreditsPerMonth).toBeGreaterThan(getPlanLimits("BUSINESS").aiCreditsPerMonth);
    expect(enterprise.storageBytes).toBeGreaterThan(getPlanLimits("BUSINESS").storageBytes);
  });

  it("every plan is present in the PLANS map keyed by its own id", () => {
    for (const id of ["FREE", "BUSINESS", "ENTERPRISE"] as const) {
      expect(PLANS[id].id).toBe(id);
    }
  });

  it("warning threshold is between 0 and 1", () => {
    expect(WARNING_THRESHOLD_RATIO).toBeGreaterThan(0);
    expect(WARNING_THRESHOLD_RATIO).toBeLessThan(1);
  });

  it("trial length is a positive number of days", () => {
    expect(TRIAL_LENGTH_DAYS).toBeGreaterThan(0);
  });

  function free() {
    return getPlanLimits("FREE");
  }
});

describe("formatBytes", () => {
  it("formats bytes, KB, MB, GB with sensible precision", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(500 * 1024 * 1024)).toBe("500 MB");
    expect(formatBytes(10 * 1024 * 1024 * 1024)).toBe("10 GB");
  });
});
