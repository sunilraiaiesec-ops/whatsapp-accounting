import { headers } from "next/headers";

import { prisma } from "@/lib/prisma";

export type RateLimitResult = { ok: boolean; retryAfterSeconds: number };

/**
 * Fixed-window rate limiter backed by the `rate_limits` table. Safe for the
 * serverless runtime (no in-memory state). Returns ok=false once `max` hits
 * occur inside `windowMs`; the window resets automatically once it elapses.
 */
export async function rateLimit(
  key: string,
  max: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = new Date();
  try {
    const existing = await prisma.rateLimit.findUnique({ where: { key } });

    if (!existing || now.getTime() - existing.windowStart.getTime() >= windowMs) {
      await prisma.rateLimit.upsert({
        where: { key },
        create: { key, count: 1, windowStart: now },
        update: { count: 1, windowStart: now },
      });
      return { ok: true, retryAfterSeconds: 0 };
    }

    if (existing.count >= max) {
      const retryAfterSeconds = Math.ceil(
        (existing.windowStart.getTime() + windowMs - now.getTime()) / 1000,
      );
      return { ok: false, retryAfterSeconds: Math.max(retryAfterSeconds, 1) };
    }

    await prisma.rateLimit.update({
      where: { key },
      data: { count: { increment: 1 } },
    });
    return { ok: true, retryAfterSeconds: 0 };
  } catch {
    // Never let the limiter itself lock users out if the DB call fails.
    return { ok: true, retryAfterSeconds: 0 };
  }
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}

/** Client IP from a Request (for route handlers). */
export function requestIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
