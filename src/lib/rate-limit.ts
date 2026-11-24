// A small in-memory rate limiter (one process, so one container). Counts are lost on restart,
// which is fine for limits meant to stop floods, not to bill.

const buckets = new Map<string, number[]>();
let lastSweep = 0;

/** Record a hit for `key`; false once there were `limit` hits in the last `windowMs`. */
export function allow(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  if (now - lastSweep > 60_000) {
    lastSweep = now;
    for (const [k, hits] of buckets) if (!hits.length || hits[hits.length - 1] < now - 24 * 3600_000) buckets.delete(k);
  }
  const hits = (buckets.get(key) ?? []).filter((t) => t > now - windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}

export function resetRateLimits() {
  buckets.clear();
}
