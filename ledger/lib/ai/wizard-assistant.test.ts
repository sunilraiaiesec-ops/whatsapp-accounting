import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks: no network/DB. ------------------------------------------------
const consumeAiCredit = vi.fn();

vi.mock("@/lib/billing/ai-credits", () => ({
  consumeAiCredit: (...args: unknown[]) => consumeAiCredit(...args),
}));

const { askWizardAssistant } = await import("@/lib/ai/wizard-assistant");
const { __setAiProviderForTests } = await import("@/lib/ai/provider");

const BASE_CTX = {
  currentStep: 3,
  currency: "XAF",
  totalAssets: 1000n,
  totalLiabilities: 400n,
  totalEquity: 600n,
  difference: 0n,
  zeroOrMissingCategories: [],
};

beforeEach(() => {
  consumeAiCredit.mockReset();
  process.env.OPENAI_API_KEY = "sk-test-key";
  __setAiProviderForTests(null);
});

describe("askWizardAssistant — AI credit metering", () => {
  it("orgId provided + credits exhausted → returns the canned answer, AI provider never called", async () => {
    consumeAiCredit.mockResolvedValue({ allowed: false, remaining: 0, limit: 10, used: 10 });
    const extractJson = vi.fn();
    __setAiProviderForTests({ name: "fake", extractJson, transcribe: vi.fn() });

    const result = await askWizardAssistant("What is Opening Equity?", {
      ...BASE_CTX,
      orgId: "org_A",
    });

    expect(result.source).toBe("rule_based");
    expect(result.answer).toMatch(/Opening Equity/i);
    expect(extractJson).not.toHaveBeenCalled();
    expect(consumeAiCredit).toHaveBeenCalledWith("org_A", "wizard_assistant");
  });

  it("orgId provided + credits available → calls AI as before", async () => {
    consumeAiCredit.mockResolvedValue({ allowed: true, remaining: 9, limit: 10, used: 1 });
    const extractJson = vi.fn().mockResolvedValue({ answer: "AI-generated answer." });
    __setAiProviderForTests({ name: "fake", extractJson, transcribe: vi.fn() });

    const result = await askWizardAssistant("What is Opening Equity?", {
      ...BASE_CTX,
      orgId: "org_A",
    });

    expect(result).toEqual({ answer: "AI-generated answer.", source: "ai" });
    expect(extractJson).toHaveBeenCalledTimes(1);
    expect(consumeAiCredit).toHaveBeenCalledWith("org_A", "wizard_assistant");
  });

  it("orgId omitted → skips metering entirely and behaves exactly as before", async () => {
    const extractJson = vi.fn().mockResolvedValue({ answer: "AI-generated answer." });
    __setAiProviderForTests({ name: "fake", extractJson, transcribe: vi.fn() });

    const result = await askWizardAssistant("What is Opening Equity?", { ...BASE_CTX });

    expect(result).toEqual({ answer: "AI-generated answer.", source: "ai" });
    expect(extractJson).toHaveBeenCalledTimes(1);
    expect(consumeAiCredit).not.toHaveBeenCalled();
  });

  it("orgId omitted + no AI configured → still degrades to canned answer without metering", async () => {
    delete process.env.OPENAI_API_KEY;
    const result = await askWizardAssistant("What is Opening Equity?", { ...BASE_CTX });
    expect(result.source).toBe("rule_based");
    expect(consumeAiCredit).not.toHaveBeenCalled();
  });
});
