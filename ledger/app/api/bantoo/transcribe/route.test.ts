import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks: no network/DB. ------------------------------------------------
const getCurrentContext = vi.fn();
const transcribe = vi.fn();
const consumeAiCredit = vi.fn();

vi.mock("@/lib/auth/current", () => ({
  getCurrentContext: (...args: unknown[]) => getCurrentContext(...args),
}));

vi.mock("@/lib/billing/ai-credits", () => ({
  consumeAiCredit: (...args: unknown[]) => consumeAiCredit(...args),
}));

// Keep AiNotConfiguredError real; force getAiProvider() to return a fake
// provider so no network call happens.
vi.mock("@/lib/ai/provider", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/ai/provider")>();
  return {
    ...actual,
    getAiProvider: () => ({ name: "fake", extractJson: vi.fn(), transcribe: (...args: unknown[]) => transcribe(...args) }),
  };
});

const { POST } = await import("@/app/api/bantoo/transcribe/route");

function makeRequest(audio: File | null): Request {
  const form = new FormData();
  if (audio) form.append("audio", audio, audio.name);
  return new Request("http://localhost/api/bantoo/transcribe", {
    method: "POST",
    body: form,
  });
}

function makeAudioFile(): File {
  return new File([new Uint8Array([1, 2, 3, 4])], "voice.webm", { type: "audio/webm" });
}

beforeEach(() => {
  getCurrentContext.mockReset();
  transcribe.mockReset();
  consumeAiCredit.mockReset();
  getCurrentContext.mockResolvedValue({ orgId: "org_A", userId: "user_1" });
  consumeAiCredit.mockResolvedValue({ allowed: true, remaining: 9, limit: 10, used: 1 });
  transcribe.mockResolvedValue("hello world");
});

describe("POST /api/bantoo/transcribe — AI credit metering", () => {
  it("credits exhausted → 402 with an upgrade message, transcribe never called", async () => {
    consumeAiCredit.mockResolvedValue({ allowed: false, remaining: 0, limit: 10, used: 10 });

    const res = await POST(makeRequest(makeAudioFile()));
    const data = await res.json();

    expect(res.status).toBe(402);
    expect(data.error).toMatch(/upgrade/i);
    expect(data.error).toContain("10");
    expect(transcribe).not.toHaveBeenCalled();
    expect(consumeAiCredit).toHaveBeenCalledWith("org_A", "voice_transcription");
  });

  it("credits available → proceeds normally and returns the transcript", async () => {
    const res = await POST(makeRequest(makeAudioFile()));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.text).toBe("hello world");
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(consumeAiCredit).toHaveBeenCalledWith("org_A", "voice_transcription");
  });
});
