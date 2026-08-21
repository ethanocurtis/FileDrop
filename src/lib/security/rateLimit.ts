/**
 * Minimal in-memory fixed-window rate limiter.
 *
 * This is intentionally dependency-free so the project runs with nothing
 * but Postgres + object storage. It is per-process state, so it resets on
 * restart and does NOT share limits across multiple server instances. If
 * you deploy more than one instance behind a load balancer, swap the
 * `store` implementation below for Redis (e.g. `@upstash/ratelimit`) —
 * the `RateLimiter` interface is the seam to do that without touching
 * call sites.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export interface RateLimiter {
  check(key: string): RateLimitResult;
}

class InMemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  check(key: string): RateLimitResult {
    const now = Date.now();
    const existing = this.buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      const resetAt = now + this.windowMs;
      this.buckets.set(key, { count: 1, resetAt });
      this.sweep(now);
      return { allowed: true, remaining: this.limit - 1, resetAt };
    }

    if (existing.count >= this.limit) {
      return { allowed: false, remaining: 0, resetAt: existing.resetAt };
    }

    existing.count += 1;
    return { allowed: true, remaining: this.limit - existing.count, resetAt: existing.resetAt };
  }

  /** Opportunistically drop expired buckets so memory doesn't grow forever. */
  private sweep(now: number) {
    if (this.buckets.size < 5000) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

// Separate limiters per concern, tuned for a small anonymous file-sharing
// service. Values are intentionally generous for legitimate use and tight
// enough to blunt scripted abuse.
export const uploadRateLimiter: RateLimiter = new InMemoryRateLimiter(20, 60 * 60 * 1000); // 20 uploads / hour / IP
export const downloadRateLimiter: RateLimiter = new InMemoryRateLimiter(60, 10 * 60 * 1000); // 60 downloads / 10 min / IP
export const passwordAttemptRateLimiter: RateLimiter = new InMemoryRateLimiter(10, 10 * 60 * 1000); // 10 password guesses / 10 min / IP+drop
export const metadataRateLimiter: RateLimiter = new InMemoryRateLimiter(120, 10 * 60 * 1000); // 120 lookups / 10 min / IP
export const p2pSignalRateLimiter: RateLimiter = new InMemoryRateLimiter(30, 10 * 60 * 1000); // 30 signaling connection attempts / 10 min / IP
export const adminLoginRateLimiter: RateLimiter = new InMemoryRateLimiter(5, 15 * 60 * 1000); // 5 attempts / 15 min / IP — a single shared password is a higher-value guessing target than a per-drop one

/** Best-effort client IP extraction behind common reverse proxies. */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "unknown";
}

/** Same idea as {@link getClientIp}, but for raw Node `IncomingMessage`
 * headers — needed for the WebSocket upgrade path, which happens before
 * Next.js (and its Fetch API `Request`) ever sees the connection. */
export function getClientIpFromNodeHeaders(
  headers: Record<string, string | string[] | undefined>,
): string {
  const forwardedFor = headers["x-forwarded-for"];
  if (forwardedFor) {
    const value = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    return value.split(",")[0].trim();
  }

  const realIp = headers["x-real-ip"];
  if (realIp) {
    return (Array.isArray(realIp) ? realIp[0] : realIp).trim();
  }

  return "unknown";
}
