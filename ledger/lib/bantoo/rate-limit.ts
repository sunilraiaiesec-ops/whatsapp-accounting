// Best-effort, in-memory fixed-window rate limiter for the Ask Bantoo AI
// endpoints. This is deliberately simple and process-local.
//
// SERVERLESS CAVEAT: on Vercel (and any multi-instance deployment) each
// serverless instance keeps its own Map, so the effective limit is
// (limit × number of warm instances) and counters reset on cold start. This is
// good enough to blunt accidental loops / casual abuse and to cap per-user cost
// spikes, but it is NOT a hard global quota. For durable, cross-instance limits
// use Upstash Redis, Vercel KV, or a DB-backed counter keyed by org/user.

type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();
const MAX_TRACKED_KEYS = 5000;

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
};

// Fixed-window limiter. Returns ok=false once `limit` requests have been made
// within `windowMs` for the given key, until the window rolls over.
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  // Opportunistic cleanup so the Map can't grow unbounded on a long-lived
  // instance. Only runs when we cross the soft cap.
  if (store.size > MAX_TRACKED_KEYS) {
    for (const [k, b] of store) {
      if (b.resetAt <= now) store.delete(k);
    }
  }

  const existing = store.get(key);
  if (!existing || existing.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSec: 0 };
  }

  if (existing.count >= limit) {
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((existing.resetAt - now) / 1000) };
  }

  existing.count += 1;
  return { ok: true, remaining: limit - existing.count, retryAfterSec: 0 };
}

// Tunable via env so ops can tighten limits without a code change.
function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export const RATE_LIMITS = {
  extract: {
    limit: intFromEnv("BANTOO_EXTRACT_RATE_LIMIT", 20),
    windowMs: intFromEnv("BANTOO_EXTRACT_RATE_WINDOW_MS", 60_000),
  },
  transcribe: {
    limit: intFromEnv("BANTOO_TRANSCRIBE_RATE_LIMIT", 15),
    windowMs: intFromEnv("BANTOO_TRANSCRIBE_RATE_WINDOW_MS", 60_000),
  },
} as const;

// Reset helper for tests.
export function __resetRateLimitForTests(): void {
  store.clear();
}
