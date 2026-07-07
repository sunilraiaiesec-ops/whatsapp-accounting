import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ---------------------------------------------------------------
// No network/DB. We force "AI configured", make the AI extractor throw a hard
// error, and assert the route degrades to the rule-based parser for text.

const getCurrentContext = vi.fn();
const extractBantooAction = vi.fn();
const resolveExtraction = vi.fn();
const consumeAiCredit = vi.fn();

vi.mock("@/lib/auth/current", () => ({
  getCurrentContext: (...args: unknown[]) => getCurrentContext(...args),
}));

vi.mock("@/lib/ai/extract", () => ({
  extractBantooAction: (...args: unknown[]) => extractBantooAction(...args),
}));

vi.mock("@/lib/billing/ai-credits", () => ({
  consumeAiCredit: (...args: unknown[]) => consumeAiCredit(...args),
}));

// Keep AiNotConfiguredError real; force isAiConfigured() true so the route takes
// the AI branch (which then throws) rather than the no-key rule branch.
vi.mock("@/lib/ai/provider", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/ai/provider")>();
  return { ...actual, isAiConfigured: () => true };
});

// resolveExtraction just echoes the action so we can assert what was resolved.
vi.mock("@/lib/bantoo/resolve", () => ({
  resolveExtraction: (_ctx: unknown, action: { action: string }) =>
    resolveExtraction(_ctx, action),
}));

const { POST } = await import("@/app/api/bantoo/extract/route");
const { AiError } = await import("@/lib/ai/provider");

function makeRequest(fields: { text?: string; image?: File }): Request {
  const form = new FormData();
  if (fields.text !== undefined) form.append("text", fields.text);
  if (fields.image) form.append("image", fields.image, fields.image.name);
  return new Request("http://localhost/api/bantoo/extract", {
    method: "POST",
    body: form,
  });
}

beforeEach(() => {
  getCurrentContext.mockReset();
  extractBantooAction.mockReset();
  resolveExtraction.mockReset();
  consumeAiCredit.mockReset();
  getCurrentContext.mockResolvedValue({ orgId: "org_A", userId: "user_1" });
  // Default: credits available, so existing tests exercise the AI call path
  // exactly as before metering was added.
  consumeAiCredit.mockResolvedValue({ allowed: true, remaining: 9, limit: 10, used: 1 });
  resolveExtraction.mockImplementation(async (_ctx, action) => ({
    action: action.action,
    lowConfidence: false,
    proposalEcho: true,
  }));
});

afterEach(() => vi.restoreAllMocks());

describe("POST /api/bantoo/extract resilience", () => {
  it("falls back to rule-based parsing for TEXT when the AI provider throws", async () => {
    // Simulate a hard OpenAI failure (e.g. 401/403/429) — NOT a legit unknown.
    extractBantooAction.mockRejectedValue(new AiError("AI request failed (HTTP 401): bad key"));

    const res = await POST(makeRequest({ text: "Received 25 million from Elhaji Adoum" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.aiFallback).toBe(true);
    // The rule-based parser classified the money-in phrasing (not "unknown").
    expect(data.proposal).toBeTruthy();
    expect(data.proposal.action).not.toBe("unknown");
    // The failing AI extractor was attempted first, then we resolved a fallback.
    expect(extractBantooAction).toHaveBeenCalledTimes(1);
    expect(resolveExtraction).toHaveBeenCalledTimes(1);
  });

  it("does NOT fall back for image input; returns a clear 502 when AI throws", async () => {
    extractBantooAction.mockRejectedValue(new AiError("AI request failed (HTTP 429): quota"));
    const image = new File([new Uint8Array([137, 80, 78, 71])], "photo.png", {
      type: "image/png",
    });

    const res = await POST(makeRequest({ text: "", image }));
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(typeof data.error).toBe("string");
    expect(data.error).toMatch(/temporarily unavailable/i);
    expect(resolveExtraction).not.toHaveBeenCalled();
  });

  it("returns a normal proposal when the AI succeeds (no fallback flag)", async () => {
    extractBantooAction.mockResolvedValue({ action: "customer_payment", confidence: 0.9 });

    const res = await POST(makeRequest({ text: "Received 25 million from Elhaji Adoum" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.aiFallback).toBe(false);
    expect(data.proposal.action).toBe("customer_payment");
  });
});

describe("POST /api/bantoo/extract — AI credit metering", () => {
  it("text-only + credits exhausted → falls back to rule-based extraction, never calls the AI provider", async () => {
    consumeAiCredit.mockResolvedValue({ allowed: false, remaining: 0, limit: 10, used: 10 });

    const res = await POST(makeRequest({ text: "Received 25 million from Elhaji Adoum" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.aiFallback).toBe(true);
    expect(data.proposal).toBeTruthy();
    expect(data.proposal.action).not.toBe("unknown");
    expect(extractBantooAction).not.toHaveBeenCalled();
    expect(consumeAiCredit).toHaveBeenCalledWith("org_A", "text_extraction");
  });

  it("image attached + credits exhausted → 402 with upgrade message, AI provider never called", async () => {
    consumeAiCredit.mockResolvedValue({ allowed: false, remaining: 0, limit: 10, used: 10 });
    const image = new File([new Uint8Array([137, 80, 78, 71])], "photo.png", {
      type: "image/png",
    });

    const res = await POST(makeRequest({ text: "", image }));
    const data = await res.json();

    expect(res.status).toBe(402);
    expect(data.error).toMatch(/upgrade/i);
    expect(data.error).toContain("10");
    expect(extractBantooAction).not.toHaveBeenCalled();
    expect(resolveExtraction).not.toHaveBeenCalled();
    expect(consumeAiCredit).toHaveBeenCalledWith("org_A", "photo_ocr");
  });

  it("credits available → proceeds with the AI call as before (no fallback flag)", async () => {
    consumeAiCredit.mockResolvedValue({ allowed: true, remaining: 5, limit: 10, used: 5 });
    extractBantooAction.mockResolvedValue({ action: "customer_payment", confidence: 0.9 });

    const res = await POST(makeRequest({ text: "Received 25 million from Elhaji Adoum" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.aiFallback).toBe(false);
    expect(extractBantooAction).toHaveBeenCalledTimes(1);
    expect(consumeAiCredit).toHaveBeenCalledWith("org_A", "text_extraction");
  });
});
