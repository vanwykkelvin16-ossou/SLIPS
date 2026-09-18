/**
 * Fixed-window rate limiting.
 *
 * The in-memory store is correct for a single Node process (the default
 * deployment shape). Multi-instance deployments should swap in a shared store
 * by implementing RateLimitStore and passing it to `setRateLimitStore` — the
 * call sites do not change.
 */
export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
}

class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();
  private lastSweep = Date.now();

  async increment(key: string, windowMs: number) {
    const now = Date.now();
    this.sweep(now);

    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      const bucket = { count: 1, resetAt: now + windowMs };
      this.buckets.set(key, bucket);
      return bucket;
    }

    existing.count += 1;
    return existing;
  }

  private sweep(now: number) {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

const globalForRateLimit = globalThis as unknown as { __slipsyRateLimitStore?: RateLimitStore };
let store: RateLimitStore = globalForRateLimit.__slipsyRateLimitStore ?? new MemoryRateLimitStore();
globalForRateLimit.__slipsyRateLimitStore = store;

export function setRateLimitStore(next: RateLimitStore) {
  store = next;
  globalForRateLimit.__slipsyRateLimitStore = next;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  limit: number;
}

export const RATE_LIMITS = {
  login: { limit: 10, windowMs: 15 * 60_000 },
  signup: { limit: 5, windowMs: 60 * 60_000 },
  passwordReset: { limit: 5, windowMs: 60 * 60_000 },
  upload: { limit: 60, windowMs: 10 * 60_000 },
  export: { limit: 20, windowMs: 60 * 60_000 },
  mutation: { limit: 300, windowMs: 5 * 60_000 },
  read: { limit: 600, windowMs: 5 * 60_000 },
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;

export async function checkRateLimit(name: RateLimitName, identifier: string): Promise<RateLimitResult> {
  const { limit, windowMs } = RATE_LIMITS[name];
  const { count, resetAt } = await store.increment(`${name}:${identifier}`, windowMs);
  const allowed = count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
    limit,
  };
}
