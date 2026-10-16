/** Best-effort, per-instance fixed-window rate limiter: the same approach as
 * the admin login route (app/api/admin/login/route.ts), factored out for the
 * public form endpoints. Vercel serverless instances do not share memory, so
 * this throttles sustained bursts against a warm instance but is not a hard
 * global cap. A real global limit needs a shared store (KV/Redis or a DB
 * table), which is not in the stack today. */
export function createRateLimiter({ limit, windowMs, maxKeys = 5000 }: { limit: number; windowMs: number; maxKeys?: number }) {
  const hits = new Map<string, { count: number; windowStart: number }>();
  /** Counts one request for `key`; true when it is over the limit. */
  return function isLimited(key: string, now = Date.now()): boolean {
    const entry = hits.get(key);
    if (!entry || now - entry.windowStart > windowMs) {
      if (hits.size >= maxKeys) {
        for (const [storedKey, stored] of hits) if (now - stored.windowStart > windowMs) hits.delete(storedKey);
        if (hits.size >= maxKeys) hits.delete(hits.keys().next().value!);
      }
      hits.set(key, { count: 1, windowStart: now });
      return false;
    }
    entry.count += 1;
    return entry.count > limit;
  };
}

export function clientIpFrom(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
