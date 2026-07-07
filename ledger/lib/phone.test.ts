import { describe, expect, it } from "vitest";

import { normalizePhoneForWhatsApp, resolveContactWhatsAppNumber } from "@/lib/phone";

describe("normalizePhoneForWhatsApp", () => {
  it("converts a bare Cameroon mobile number (9 digits, starts with 6) to 237-prefixed", () => {
    expect(normalizePhoneForWhatsApp("612345678")).toBe("237612345678");
  });

  it("strips spaces, dashes, and parentheses before normalizing", () => {
    expect(normalizePhoneForWhatsApp("6 12-34 (56) 78")).toBe("237612345678");
    expect(normalizePhoneForWhatsApp("(6) 12 34 56 78")).toBe("237612345678");
  });

  it("passes through a number already prefixed with 237 (no plus)", () => {
    expect(normalizePhoneForWhatsApp("237612345678")).toBe("237612345678");
  });

  it("passes through a number already prefixed with +237", () => {
    expect(normalizePhoneForWhatsApp("+237612345678")).toBe("237612345678");
  });

  it("passes through a plausible full international number with a leading +", () => {
    expect(normalizePhoneForWhatsApp("+14155552671")).toBe("14155552671");
  });

  it("passes through a plausible full international number without a plus (longer than a bare local number)", () => {
    expect(normalizePhoneForWhatsApp("233241234567")).toBe("233241234567");
  });

  it("returns null for garbage input", () => {
    expect(normalizePhoneForWhatsApp("not a phone number")).toBeNull();
    expect(normalizePhoneForWhatsApp("abcdefg")).toBeNull();
  });

  it("returns null for empty/missing input", () => {
    expect(normalizePhoneForWhatsApp("")).toBeNull();
    expect(normalizePhoneForWhatsApp("   ")).toBeNull();
    expect(normalizePhoneForWhatsApp(null)).toBeNull();
    expect(normalizePhoneForWhatsApp(undefined)).toBeNull();
  });

  it("returns null for a number that's too short to be plausible", () => {
    expect(normalizePhoneForWhatsApp("12345")).toBeNull();
  });

  it("returns null for a bare 9-digit number that doesn't start with 6 (ambiguous, doesn't guess)", () => {
    expect(normalizePhoneForWhatsApp("512345678")).toBeNull();
  });

  it("returns null for a number that's too long to be plausible", () => {
    expect(normalizePhoneForWhatsApp("1234567890123456789")).toBeNull();
  });
});

describe("resolveContactWhatsAppNumber", () => {
  it("prefers the whatsapp field over phone when both are usable", () => {
    expect(
      resolveContactWhatsAppNumber({ phone: "612345678", whatsapp: "698765432" }),
    ).toBe("237698765432");
  });

  it("falls back to phone when whatsapp is missing", () => {
    expect(resolveContactWhatsAppNumber({ phone: "612345678", whatsapp: null })).toBe(
      "237612345678",
    );
  });

  it("falls back to phone when whatsapp doesn't normalize to a usable number", () => {
    expect(
      resolveContactWhatsAppNumber({ phone: "612345678", whatsapp: "not a number" }),
    ).toBe("237612345678");
  });

  it("returns null (missing-phone state) when neither field is usable", () => {
    expect(resolveContactWhatsAppNumber({ phone: null, whatsapp: null })).toBeNull();
    expect(
      resolveContactWhatsAppNumber({ phone: "garbage", whatsapp: "also garbage" }),
    ).toBeNull();
  });
});
