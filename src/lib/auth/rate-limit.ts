import { AppError } from "@/lib/errors";

/**
 * Fixed-window in-memory rate limiter for auth endpoints.
 * Per-process only; swap for Redis/Upstash when running more than one instance.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, max: number, windowMs: number): void {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  b.count += 1;
  if (b.count > max) {
    const seconds = Math.ceil((b.resetAt - now) / 1000);
    throw new AppError("RATE_LIMITED", `Too many attempts. Try again in ${seconds}s.`);
  }
}

export function resetRateLimit(key: string) {
  buckets.delete(key);
}

export function clearRateLimits() {
  buckets.clear();
}
