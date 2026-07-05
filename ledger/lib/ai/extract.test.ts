import { afterEach, describe, expect, it, vi } from "vitest";

import { extractBantooAction } from "@/lib/ai/extract";
import {
  __setAiProviderForTests,
  type AiJsonRequest,
  type AiProvider,
} from "@/lib/ai/provider";

// A fake provider so tests never touch the network. It records the last request
// and returns whatever canned JSON the test configured.
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

describe("extractBantooAction", () => {
  it("classifies a supplier stock receipt", async () => {
    const { provider, lastRequest } = fakeProvider({
      action: "receive_stock",
      product_name: "Rice 25kg",
      quantity: 150,
      cost_price: 12000,
      supplier_name: "Adamou",
      confidence: 0.92,
    });
    __setAiProviderForTests(provider);

    const action = await extractBantooAction({
      text: "Received 150 bags of rice from Adamou at 12000 each",
    });

    expect(action.action).toBe("receive_stock");
    if (action.action === "receive_stock") {
      expect(action.quantity).toBe(150);
      expect(action.cost_price).toBe(12000);
      expect(action.supplier_name).toBe("Adamou");
    }
    // The system prompt must carry the strict instructions + action list.
    expect(lastRequest()?.system).toContain("add_inventory_item");
    expect(lastRequest()?.system).toContain("XAF");
  });

  it("classifies a product photo as add_inventory_item and passes images through", async () => {
    const { provider, lastRequest } = fakeProvider({
      action: "add_inventory_item",
      product_name: "Peak Milk 400g",
      barcode: "6154000112233",
      sale_price: 1500,
      unit: "tin",
      confidence: 0.8,
    });
    __setAiProviderForTests(provider);

    const action = await extractBantooAction({
      text: "",
      images: [{ url: "data:image/png;base64,AAAA" }],
    });

    expect(action.action).toBe("add_inventory_item");
    expect(lastRequest()?.images).toHaveLength(1);
  });

  it("downgrades malformed AI output to a low-confidence unknown", async () => {
    const { provider } = fakeProvider({ foo: "bar", not: "an action" });
    __setAiProviderForTests(provider);

    const action = await extractBantooAction({ text: "??" });
    expect(action.action).toBe("unknown");
    expect(action.confidence).toBe(0);
  });

  it("passes the injected date into the prompt", async () => {
    const { provider, lastRequest } = fakeProvider({ action: "unknown", confidence: 0 });
    __setAiProviderForTests(provider);
    await extractBantooAction({ text: "hello", today: "2026-07-05" });
    expect(lastRequest()?.system).toContain("2026-07-05");
  });
});
