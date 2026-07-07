import { afterEach, describe, expect, it, vi } from "vitest";

import { extractBantooAction, type ExtractInput } from "@/lib/ai/extract";
import {
  __setAiProviderForTests,
  type AiJsonRequest,
  type AiProvider,
} from "@/lib/ai/provider";

// ---------------------------------------------------------------------------
// QA Swarm Track 9 — Language Consistency Agent.
//
// ORIGINAL ROOT CAUSE (test matrix item 7 + the "mixed scenario" items 5/6):
// lib/ai/extract.ts's buildSystemPrompt() used to instruct the model to
// write `summary` "in the user's language" — the language of the INPUT TEXT,
// not the app's UI locale — with no `locale` field on ExtractInput at all
// for a caller to even supply one. The core rule from the task brief is:
// response language = UI language, NOT input language. The prompt used to
// do the opposite.
//
// FIXED: ExtractInput now carries an optional `locale: "en" | "fr"` field
// (defaulting to "en" when omitted), threaded all the way from
// app/api/bantoo/extract/route.ts's resolveUiLocale() (NEXT_LOCALE cookie ->
// Accept-Language header -> routing.defaultLocale, the same resolution
// i18n/request.ts uses for the page itself) into buildSystemPrompt(), which
// now explicitly instructs the model to write `summary` in the resolved UI
// locale "regardless of what language the user's own message is written
// in — the summary must match the app's current display language, not the
// input language."
// ---------------------------------------------------------------------------

function fakeProvider(response: unknown): {
  provider: AiProvider;
  lastRequest: () => AiJsonRequest | null;
} {
  let last: AiJsonRequest | null = null;
  const provider: AiProvider = {
    name: "fake",
    async extractJson(request) {
      last = request;
      return response;
    },
    async transcribe() {
      return "";
    },
  };
  return { provider, lastRequest: () => last };
}

afterEach(() => {
  __setAiProviderForTests(null);
  vi.restoreAllMocks();
});

describe("QA Swarm 09 — Language Consistency: extractBantooAction()'s prompt is now UI-locale-based, not input-language-based", () => {
  it("FIXED: ExtractInput now carries an optional `locale` field, giving the extraction layer a way to know the app's UI language", async () => {
    const input: ExtractInput = { text: "Add Musa as a customer in Garoua", today: "2026-07-07", locale: "fr" };
    expect(Object.keys(input).sort()).toEqual(["locale", "text", "today"]);
  });

  it("FIXED: the system prompt now instructs the model to write `summary` in the resolved UI locale (English by default), explicitly overriding the input's own language", async () => {
    const { provider, lastRequest } = fakeProvider({
      action: "create_customer",
      customer_name: "Musa",
      city: "Garoua",
      confidence: 0.9,
      summary: "Add Musa as a new customer in Garoua.",
    });
    __setAiProviderForTests(provider);

    await extractBantooAction({ text: "Add Musa as a customer in Garoua" });

    const system = lastRequest()?.system ?? "";
    expect(system).not.toContain("in the user's language");
    expect(system).toContain('Write "summary" in English');
    expect(system).toContain("regardless of what language the user's own message is written in");
    expect(system).toContain("the summary must match the app's current display language, not the input language");
  });

  it("FIXED: passing locale:'fr' changes the prompt's instructed summary language to French, independent of the input text's own language", async () => {
    const { provider, lastRequest } = fakeProvider({
      action: "create_customer",
      customer_name: "Musa",
      city: "Garoua",
      confidence: 0.9,
      summary: "Ajouter Musa comme nouveau client à Garoua.",
    });
    __setAiProviderForTests(provider);

    await extractBantooAction({ text: "Add Musa as a customer in Garoua", locale: "fr" });

    const system = lastRequest()?.system ?? "";
    expect(system).toContain('Write "summary" in French');
  });

  it('FIXED: a French-UI-but-English-input request now asks the model to answer in French, closing the "summary language matches input, not UI" gap', async () => {
    const { provider, lastRequest } = fakeProvider({
      action: "create_customer",
      customer_name: "Musa",
      city: "Garoua",
      confidence: 0.9,
      summary: "Ajouter Musa comme nouveau client à Garoua.",
    });
    __setAiProviderForTests(provider);

    const action = await extractBantooAction({ text: "Add Musa as a customer in Garoua", locale: "fr" });

    expect(action.summary).toBe("Ajouter Musa comme nouveau client à Garoua.");
    // The prompt now explicitly carries a locale-driven instruction distinct
    // from the raw input text.
    expect(lastRequest()?.system).toContain('Write "summary" in French');
  });
});
