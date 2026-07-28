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
