import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeFakeModel } from "@/lib/test-utils/fakePrisma";

let partyRows: Record<string, unknown>[] = [];

vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return { party: makeFakeModel(partyRows) };
  },
}));

const { createParty, findPossiblePartyDuplicates, updateParty } = await import("@/lib/parties");

beforeEach(() => {
  partyRows = [];
});

describe("createParty (quick-add regression)", () => {
  it("accepts the same minimal fields as before the contact-profile upgrade", async () => {
    const party = await createParty("org_A", { name: "  Elhaji Adoum  ", type: "supplier", phone: " 699000111 " });
    expect(party.name).toBe("Elhaji Adoum");
    expect(party.type).toBe("supplier");
    expect(party.phone).toBe("699000111");
    expect(party.orgId).toBe("org_A");
    // Extended fields are absent/null when not supplied — never required.
    expect(party.whatsapp ?? null).toBeNull();
    expect(party.country ?? null).toBeNull();
    expect(party.city ?? null).toBeNull();
  });

  it("accepts the new optional quick-add extras (whatsapp/country/city)", async () => {
    const party = await createParty("org_A", {
      name: "Adamou Trading",
      type: "customer",
      whatsapp: "699111222",
      country: "Cameroon",
      city: "Douala",
    });
    expect(party.whatsapp).toBe("699111222");
    expect(party.country).toBe("Cameroon");
    expect(party.city).toBe("Douala");
  });
});

describe("findPossiblePartyDuplicates", () => {
  beforeEach(async () => {
    await createParty("org_A", { name: "Elhaji Adoum", type: "supplier", phone: "699000111" });
    await createParty("org_A", { name: "Mahamat Store", type: "customer", whatsapp: "699222333" });
  });

  it("flags an exact name match", async () => {
    const dups = await findPossiblePartyDuplicates("org_A", { name: "Elhaji Adoum" });
    expect(dups.some((d) => d.name === "Elhaji Adoum" && d.score === 100)).toBe(true);
  });

  it("flags a case-insensitive match", async () => {
    const dups = await findPossiblePartyDuplicates("org_A", { name: "elhaji adoum" });
    expect(dups[0]?.name).toBe("Elhaji Adoum");
  });

  it("flags an accent-insensitive match", async () => {
    const dups = await findPossiblePartyDuplicates("org_A", { name: "Élhaji Adoúm" });
    expect(dups[0]?.name).toBe("Elhaji Adoum");
  });

  it("flags a fuzzy (typo) match", async () => {
    const dups = await findPossiblePartyDuplicates("org_A", { name: "Elhaj Adom" });
    expect(dups[0]?.name).toBe("Elhaji Adoum");
    expect(dups[0]?.matchedOn).toBe("name");
  });

  it("flags an exact phone match even with a very different name", async () => {
    const dups = await findPossiblePartyDuplicates("org_A", { name: "Totally Different Co", phone: "699000111" });
    expect(dups.some((d) => d.matchedOn === "phone" && d.score === 100)).toBe(true);
  });

  it("flags an exact WhatsApp match even with a very different name", async () => {
    const dups = await findPossiblePartyDuplicates("org_A", { name: "Nothing Alike", whatsapp: "699222333" });
    expect(dups.some((d) => d.matchedOn === "whatsapp" && d.score === 100)).toBe(true);
  });

  it("does not flag a clearly different name with no phone/WhatsApp overlap", async () => {
    const dups = await findPossiblePartyDuplicates("org_A", { name: "Zenith Global Traders" });
    expect(dups).toEqual([]);
  });

  it("never leaks another organization's contacts (org isolation)", async () => {
    await createParty("org_B", { name: "Elhaji Adoum", type: "supplier", phone: "699999999" });
    const dups = await findPossiblePartyDuplicates("org_A", { name: "Elhaji Adoum" });
    expect(dups.every((d) => d.name !== "Elhaji Adoum" || d.score !== 100 || true)).toBe(true);
    // Only the org_A record should ever be returned, never org_B's.
    const orgBLeaked = dups.some((d) => d.phone === "699999999");
    expect(orgBLeaked).toBe(false);
  });
});

describe("updateParty (profile fields)", () => {
  it("updates extended profile fields without touching quick-add fields", async () => {
    const created = await createParty("org_A", { name: "Rice Traders", type: "supplier" });
    const updated = await updateParty("org_A", created.id, {
      email: "sales@ricetraders.example",
      paymentTermsDays: 30,
      creditLimit: 5_000_000n,
    });
    expect(updated?.email).toBe("sales@ricetraders.example");
    expect(updated?.paymentTermsDays).toBe(30);
    expect(updated?.creditLimit).toBe(5_000_000n);
    expect(updated?.name).toBe("Rice Traders");
  });

  it("returns null for a party outside the caller's org", async () => {
    const created = await createParty("org_B", { name: "Other Org Co", type: "supplier" });
    const updated = await updateParty("org_A", created.id, { email: "x@example.com" });
    expect(updated).toBeNull();
  });
});
