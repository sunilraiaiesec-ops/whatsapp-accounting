import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecuteCommandInput } from "@/app/actions/command";

// --- Mocks ---------------------------------------------------------------
// Keep everything in-memory: no real DB, network, or auth. We only exercise
// the org-ownership trust boundary in executeCommand.

const findFirst = vi.fn();
const createReceipt = vi.fn();
const createPayment = vi.fn();
const receiveGoods = vi.fn();
const createParty = vi.fn();

vi.mock("@/lib/auth/current", () => ({
  requireContext: vi.fn(async () => ({
    userId: "user_1",
    orgId: "org_A",
    userName: "Test",
    userEmail: "t@example.com",
    orgName: "Org A",
    baseCurrency: "XAF",
    role: "owner",
    emailVerified: true,
  })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { party: { findFirst } },
}));

// Partial mocks: keep DocumentError (real) so the catch/instanceof path works,
// but stub the write functions so nothing hits the ledger.
vi.mock("@/lib/documents", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/documents")>();
  return { ...actual, createReceipt, createPayment };
});

vi.mock("@/lib/inventory", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/inventory")>();
  return { ...actual, receiveGoods };
});

vi.mock("@/lib/parties", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/parties")>();
  return { ...actual, createParty };
});

const { executeCommand } = await import("@/app/actions/command");

function baseInput(overrides: Partial<ExecuteCommandInput>): ExecuteCommandInput {
  return {
    intent: "create_receipt",
    amount: "1000",
    quantity: "",
    unitCost: "",
    itemId: null,
    partyId: null,
    partyName: "",
    createParty: false,
    partyType: "customer",
    bankAccountId: "bank_1",
    lineAccountId: "line_1",
    date: "2026-01-05",
    description: "",
    ...overrides,
  };
}

beforeEach(() => {
  findFirst.mockReset();
  createReceipt.mockReset();
  createPayment.mockReset();
  receiveGoods.mockReset();
  createParty.mockReset();
});

describe("executeCommand party org-ownership", () => {
  it("accepts a same-org partyId and posts the document", async () => {
    // findFirst is scoped to { id, orgId, type } — resolving means it belongs here.
    findFirst.mockResolvedValue({ id: "party_same" });
    createReceipt.mockResolvedValue({ id: "rec_1", number: "REC-00001" });

    const result = await executeCommand(
      baseInput({ intent: "create_receipt", partyId: "party_same", partyType: "customer" }),
    );

    expect(result).toEqual({ ok: true, href: "/receipts/rec_1", number: "REC-00001" });
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "party_same", orgId: "org_A", type: { in: ["customer", "both"] } },
      select: { id: true },
    });
    expect(createReceipt).toHaveBeenCalledTimes(1);
    expect(createReceipt.mock.calls[0][1]).toMatchObject({ partyId: "party_same" });
  });

  it("rejects a cross-org partyId with a safe, non-leaky error", async () => {
    // findFirst returns null when the id isn't in this org (or doesn't exist).
    findFirst.mockResolvedValue(null);

    const result = await executeCommand(
      baseInput({ intent: "create_payment", partyId: "party_other_org", partyType: "supplier" }),
    );

    expect(result).toEqual({ ok: false, error: "That contact was not found." });
    // Crucially, no write happened with the foreign contact.
    expect(createPayment).not.toHaveBeenCalled();
    expect(createReceipt).not.toHaveBeenCalled();
  });

  it("rejects a cross-org supplier on the goods-receipt path", async () => {
    findFirst.mockResolvedValue(null);

    const result = await executeCommand(
      baseInput({
        intent: "create_goods_receipt",
        itemId: "item_1",
        quantity: "10",
        unitCost: "500",
        partyId: "party_other_org",
        partyType: "supplier",
      }),
    );

    expect(result).toEqual({ ok: false, error: "That contact was not found." });
    expect(receiveGoods).not.toHaveBeenCalled();
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "party_other_org", orgId: "org_A", type: { in: ["supplier", "both"] } },
      select: { id: true },
    });
  });

  it("does not look up a party when none is supplied (null partyId stays allowed)", async () => {
    createReceipt.mockResolvedValue({ id: "rec_2", number: "REC-00002" });

    const result = await executeCommand(
      baseInput({ intent: "create_receipt", partyId: null }),
    );

    expect(result).toEqual({ ok: true, href: "/receipts/rec_2", number: "REC-00002" });
    expect(findFirst).not.toHaveBeenCalled();
    expect(createReceipt.mock.calls[0][1]).toMatchObject({ partyId: null });
  });
});
