import { afterEach, describe, expect, it } from "vitest";

import { rateLimit, __resetRateLimitForTests } from "@/lib/bantoo/rate-limit";

afterEach(() => __resetRateLimitForTests());

describe("rateLimit (fixed window)", () => {
  it("allows up to the limit then blocks with a retry-after", () => {
    const key = "extract:org1:user1";
    for (let i = 0; i < 3; i += 1) {
      expect(rateLimit(key, 3, 60_000).ok).toBe(true);
    }
    const blocked = rateLimit(key, 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("isolates counters per key (per org/user)", () => {
    expect(rateLimit("extract:orgA:u1", 1, 60_000).ok).toBe(true);
    expect(rateLimit("extract:orgA:u1", 1, 60_000).ok).toBe(false);
    // Different key (another user) is unaffected.
    expect(rateLimit("extract:orgA:u2", 1, 60_000).ok).toBe(true);
  });

  it("resets after the window elapses", () => {
    const key = "transcribe:org1:user1";
    expect(rateLimit(key, 1, 1).ok).toBe(true);
    expect(rateLimit(key, 1, 1).ok).toBe(false);
    // Wait past the 1ms window.
    const start = Date.now();
    while (Date.now() - start < 5) {
      /* spin briefly */
    }
    expect(rateLimit(key, 1, 1).ok).toBe(true);
  });
});
