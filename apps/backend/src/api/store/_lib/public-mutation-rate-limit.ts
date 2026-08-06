/**
 * Bounded in-memory rate limit for public mutating Store routes (leads / bespoke).
 *
 * Limitation (documented): per-process only. Staging runs a single backend
 * replica today; multi-replica would need Redis/Traefik. Fail-closed on abuse
 * (429) — not fail-open.
 *
 * Client identity: prefer Medusa/Express `req.ip` (trust proxy = 1). Do NOT
 * trust a raw client-supplied X-Forwarded-For chain for the key.
 */
type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()
const MAX_KEYS = 5000

export type RateLimitResult =
  | { ok: true; remaining: number; resetAt: number }
  | { ok: false; remaining: 0; resetAt: number }

function prune(now: number) {
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k)
  }
  // Hard cap: drop oldest insertion order entries if still over max.
  while (buckets.size > MAX_KEYS) {
    const first = buckets.keys().next().value as string | undefined
    if (!first) break
    buckets.delete(first)
  }
}

export function checkPublicMutationRateLimit(opts: {
  key: string
  limit: number
  windowMs: number
  now?: number
}): RateLimitResult {
  const now = opts.now ?? Date.now()
  prune(now)
  const existing = buckets.get(opts.key)
  if (!existing || existing.resetAt <= now) {
    // Reserve slot before insert so size never exceeds MAX_KEYS.
    while (buckets.size >= MAX_KEYS && !buckets.has(opts.key)) {
      const first = buckets.keys().next().value as string | undefined
      if (!first) break
      buckets.delete(first)
    }
    const resetAt = now + opts.windowMs
    buckets.set(opts.key, { count: 1, resetAt })
    return { ok: true, remaining: opts.limit - 1, resetAt }
  }
  if (existing.count >= opts.limit) {
    return { ok: false, remaining: 0, resetAt: existing.resetAt }
  }
  existing.count += 1
  buckets.set(opts.key, existing)
  return {
    ok: true,
    remaining: opts.limit - existing.count,
    resetAt: existing.resetAt,
  }
}

/** Prefer Express/Medusa req.ip (respects trust proxy). Fallback unknown. */
export function clientKeyFromRequest(req: {
  ip?: string
  socket?: { remoteAddress?: string }
}): string {
  const ip = (req.ip || req.socket?.remoteAddress || "").trim()
  return ip || "unknown"
}

/** Test helper */
export function __resetPublicMutationRateLimitForTests() {
  buckets.clear()
}

export function __publicMutationRateLimitSizeForTests() {
  return buckets.size
}
