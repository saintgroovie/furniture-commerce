import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

const TOKEN_BYTES = 32
const DEFAULT_TTL_MS = 90 * 24 * 60 * 60 * 1000

export function mintOrderAccessToken(): {
  token: string
  token_hash: string
  expires_at: Date
} {
  const token = randomBytes(TOKEN_BYTES).toString("base64url")
  return {
    token,
    token_hash: hashOrderAccessToken(token),
    expires_at: new Date(Date.now() + DEFAULT_TTL_MS),
  }
}

export function hashOrderAccessToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex")
}

export function tokensMatch(plain: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashOrderAccessToken(plain), "utf8")
  const expected = Buffer.from(expectedHash, "utf8")
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

export function isAccessExpired(
  expiresAt: Date | string | null | undefined,
  now = new Date()
): boolean {
  if (!expiresAt) return true
  const exp = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt
  return Number.isNaN(exp.getTime()) || exp.getTime() <= now.getTime()
}

/**
 * Buyer track path: token only in URL fragment (never in HTTP query/path).
 * Fragments are not sent to proxies/servers and cannot enter SSR request URLs.
 */
export function buildGuestOrderTrackPath(
  orderId: string,
  token: string
): string {
  const id = orderId.trim()
  const t = token.trim()
  if (!id || !t) {
    throw new Error("order_id and token are required for track path")
  }
  return `/orders/track?order_id=${encodeURIComponent(id)}#token=${encodeURIComponent(t)}`
}
