import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the OpenAI client so no network happens, but keep the REAL APIError class
// (and toFile) so `err instanceof OpenAI.APIError` narrows correctly and the
// error fields populate exactly as the SDK does in production.
const { chatCreate, transcriptionsCreate } = vi.hoisted(() => ({
  chatCreate: vi.fn(),
  transcriptionsCreate: vi.fn(),
}));

vi.mock("openai", async (importActual) => {
  const actual = await importActual<typeof import("openai")>();
  const Real = actual.default;
  class MockOpenAI {
    chat = { completions: { create: chatCreate } };
    audio = { transcriptions: { create: transcriptionsCreate } };
    constructor(_opts: unknown) {
      void _opts;
    }
    static APIError = Real.APIError;
  }
  return { ...actual, default: MockOpenAI };
});

import OpenAI from "openai";
import { AiError, getAiProvider, __setAiProviderForTests } from "@/lib/ai/provider";

const API_KEY = "sk-test-DO-NOT-LEAK-abc123";
const SECRET_SYS = "SECRET_SYSTEM_PROMPT_TEXT";
const SECRET_USER = "SECRET_USER_PROMPT_TEXT";
const SECRET_IMAGE = "data:image/png;base64,SECRETIMAGEBYTES";

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  process.env.OPENAI_API_KEY = API_KEY;
  __setAiProviderForTests(null);
  chatCreate.mockReset();
  transcriptionsCreate.mockReset();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  __setAiProviderForTests(null);
  vi.restoreAllMocks();
});

// All console.error output concatenated into one string for assertions.
function loggedOutput(): string {
  return errorSpy.mock.calls
    .map((call: unknown[]) => call.map((arg) => String(arg)).join(" "))
    .join("\n");
}

describe("OpenAiProvider structured error logging", () => {
  it("logs status/type/code/message for a chat.completions failure (401)", async () => {
    chatCreate.mockRejectedValue(
      new OpenAI.APIError(
        401,
        {
          message: "Incorrect API key provided.",
          type: "invalid_request_error",
          code: "invalid_api_key",
        },
        undefined,
        undefined,
      ),
    );

    const provider = getAiProvider();
    await expect(
      provider.extractJson({
        system: SECRET_SYS,
        user: SECRET_USER,
        images: [{ url: SECRET_IMAGE }],
      }),
    ).rejects.toBeInstanceOf(AiError);

    const out = loggedOutput();
    expect(out).toContain("[bantoo/ai]");
    expect(out).toContain("HTTP 401");
    expect(out).toContain("type=invalid_request_error");
    expect(out).toContain("code=invalid_api_key");
    expect(out).toContain("message=Incorrect API key provided.");

    // Secrets and request contents must NOT be present in the log.
    expect(out).not.toContain(API_KEY);
    expect(out).not.toContain(SECRET_SYS);
    expect(out).not.toContain(SECRET_USER);
    expect(out).not.toContain("SECRETIMAGEBYTES");
  });

  it("logs status/type/code/message for a transcription failure (429 quota)", async () => {
    transcriptionsCreate.mockRejectedValue(
      new OpenAI.APIError(
        429,
        {
          message: "You exceeded your current quota.",
          type: "insufficient_quota",
          code: "insufficient_quota",
        },
        undefined,
        undefined,
      ),
    );

    const provider = getAiProvider();
    await expect(
      provider.transcribe({
        data: Buffer.from("SECRETAUDIOBYTES"),
        mimeType: "audio/webm",
        filename: "note.webm",
      }),
    ).rejects.toBeInstanceOf(AiError);

    const out = loggedOutput();
    expect(out).toContain("HTTP 429");
    expect(out).toContain("type=insufficient_quota");
    expect(out).toContain("code=insufficient_quota");
    expect(out).toContain("message=You exceeded your current quota.");
    expect(out).not.toContain(API_KEY);
    expect(out).not.toContain("SECRETAUDIOBYTES");
  });

  it("redacts a key-shaped fragment echoed back inside OpenAI's own error message", async () => {
    const leakedKeyFragment = "sk-abcd1234EFGH5678";
    chatCreate.mockRejectedValue(
      new OpenAI.APIError(
        401,
        {
          message: `Incorrect API key provided: ${leakedKeyFragment}...wxyz.`,
          type: "invalid_request_error",
          code: "invalid_api_key",
        },
        undefined,
        undefined,
      ),
    );

    const provider = getAiProvider();
    await expect(
      provider.extractJson({ system: SECRET_SYS, user: SECRET_USER }),
    ).rejects.toBeInstanceOf(AiError);

    const out = loggedOutput();
    expect(out).toContain("[bantoo/ai]");
    expect(out).toContain("HTTP 401");
    expect(out).not.toContain(leakedKeyFragment);
    expect(out).not.toContain(API_KEY);
  });

  it("degrades gracefully for a non-HTTP network error (status=none)", async () => {
    chatCreate.mockRejectedValue(new Error("socket hang up"));

    const provider = getAiProvider();
    await expect(
      provider.extractJson({ system: SECRET_SYS, user: SECRET_USER }),
    ).rejects.toBeInstanceOf(AiError);

    const out = loggedOutput();
    expect(out).toContain("HTTP none");
    expect(out).toContain("type=Error");
    expect(out).toContain("code=none");
    expect(out).toContain("message=socket hang up");
    expect(out).not.toContain(API_KEY);
    expect(out).not.toContain(SECRET_SYS);
  });
});
