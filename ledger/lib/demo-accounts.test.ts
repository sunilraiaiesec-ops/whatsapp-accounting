import { describe, expect, it, vi, beforeEach } from "vitest";

const membershipFindFirst = vi.fn();
const userFindUnique = vi.fn();
const userFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    membership: {
      findFirst: (...args: unknown[]) => membershipFindFirst(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
      findMany: (...args: unknown[]) => userFindMany(...args),
    },
  },
}));

const {
  isDemoAccountEmail,
  isDemoOrgId,
  resolveDemoOrgByEmail,
  DEMO_COMPANIES,
} = await import("@/lib/demo-accounts");

const CENTRAL_ORG = "org_central_prod_123";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isDemoOrgId", () => {
  it("matches production demo orgs by demo-user email, not lowercase owner role", async () => {
    membershipFindFirst.mockResolvedValue({ id: "mem_1" });
    await expect(isDemoOrgId(CENTRAL_ORG)).resolves.toBe(true);
    expect(membershipFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orgId: CENTRAL_ORG,
          user: { email: { in: expect.arrayContaining(["central.demo@bantoobooks.com"]) } },
        }),
      }),
    );
  });

  it("returns false when no demo user belongs to the org", async () => {
    membershipFindFirst.mockResolvedValue(null);
    await expect(isDemoOrgId("real-customer-org")).resolves.toBe(false);
  });
});

describe("resolveDemoOrgByEmail", () => {
  it("maps central.demo@bantoobooks.com to the live org id", async () => {
    userFindUnique.mockResolvedValue({
      memberships: [
        {
          org: {
            id: CENTRAL_ORG,
            name: "Central Distribution Cameroon SARL",
          },
        },
      ],
    });

    const resolved = await resolveDemoOrgByEmail("central.demo@bantoobooks.com");
    expect(resolved).toEqual({
      orgId: CENTRAL_ORG,
      email: "central.demo@bantoobooks.com",
      orgName: "Central Distribution Cameroon SARL",
      expectedName: "Central Distribution Cameroon SARL",
    });
  });

  it("returns null for non-demo emails", async () => {
    await expect(resolveDemoOrgByEmail("customer@example.com")).resolves.toBeNull();
    expect(userFindUnique).not.toHaveBeenCalled();
  });
});

describe("demo email registry", () => {
  it("lists all three production demo companies", () => {
    expect(DEMO_COMPANIES).toHaveLength(3);
    expect(isDemoAccountEmail("prime.demo@bantoobooks.com")).toBe(true);
  });
});
