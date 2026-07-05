import OpenAI, { toFile } from "openai";

// Single, swappable AI provider module. Everything in the Ask Bantoo extraction
// pipeline talks to this interface, so replacing OpenAI with another vendor only
// means writing a new `AiProvider` and returning it from `getAiProvider()`.

export class AiNotConfiguredError extends Error {
  constructor() {
    super(
      "AI features are not configured. Set OPENAI_API_KEY in the environment to enable Ask Bantoo photo, voice, and smart text.",
    );
    this.name = "AiNotConfiguredError";
  }
}

export class AiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiError";
  }
}

export type AiImageInput = {
  // A base64 data URL (data:image/png;base64,...) OR a remote https URL.
  url: string;
};

export type AiJsonRequest = {
  system: string;
  user: string;
  images?: AiImageInput[];
};

export type AiTranscribeRequest = {
  data: Buffer;
  mimeType: string;
  filename: string;
  language?: string;
};

export interface AiProvider {
  readonly name: string;
  /** Ask the model to return a JSON object. May include vision images. */
  extractJson(request: AiJsonRequest): Promise<unknown>;
  /** Transcribe an audio buffer to text. */
  transcribe(request: AiTranscribeRequest): Promise<string>;
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL ?? "gpt-4o-mini";
const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL ?? "whisper-1";

class OpenAiProvider implements AiProvider {
  readonly name = "openai";
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    });
  }

  async extractJson(request: AiJsonRequest): Promise<unknown> {
    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      { type: "text", text: request.user },
    ];
    for (const image of request.images ?? []) {
      content.push({ type: "image_url", image_url: { url: image.url, detail: "auto" } });
    }

    let completion;
    try {
      completion = await this.client.chat.completions.create({
        model: TEXT_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: request.system },
          { role: "user", content },
        ],
      });
    } catch (err) {
      throw new AiError(describeOpenAiError("AI request failed", err));
    }

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new AiError("The AI returned an empty response.");

    try {
      return JSON.parse(raw);
    } catch {
      throw new AiError("The AI returned invalid JSON.");
    }
  }

  async transcribe(request: AiTranscribeRequest): Promise<string> {
    try {
      const file = await toFile(request.data, request.filename, {
        type: request.mimeType,
      });
      const result = await this.client.audio.transcriptions.create({
        model: TRANSCRIBE_MODEL,
        file,
        language: request.language,
      });
      return result.text?.trim() ?? "";
    } catch (err) {
      throw new AiError(describeOpenAiError("Transcription failed", err));
    }
  }
}

// Builds a diagnostic message that surfaces the HTTP status/code from OpenAI SDK
// errors (e.g. 401 invalid key, 403 model.request, 404 model-not-found, 429
// quota) so failures are actionable in server logs. OpenAI error messages do
// NOT contain the API key, so this is safe to log; we never include the key.
function describeOpenAiError(prefix: string, err: unknown): string {
  const status = (err as { status?: number })?.status;
  const code = (err as { code?: string | null })?.code;
  const detail = err instanceof Error ? err.message : "unknown error";
  const tag = status ? ` (HTTP ${status}${code ? ` ${code}` : ""})` : "";
  return `${prefix}${tag}: ${detail}`;
}

let cached: AiProvider | null | undefined;
let override: AiProvider | null = null;

// Returns the configured provider, or throws AiNotConfiguredError when no key is
// present. Callers should catch that to show a clear "AI not set up" message
// rather than crashing.
export function getAiProvider(): AiProvider {
  if (override) return override;
  if (cached === undefined) {
    const key = process.env.OPENAI_API_KEY;
    cached = key ? new OpenAiProvider(key) : null;
  }
  if (!cached) throw new AiNotConfiguredError();
  return cached;
}

// Test seam: inject a fake provider so unit tests never touch the network.
export function __setAiProviderForTests(provider: AiProvider | null): void {
  override = provider;
}
