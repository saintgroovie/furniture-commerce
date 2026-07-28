import assert from "node:assert/strict"
import {
  __publicMutationRateLimitSizeForTests,
  __resetPublicMutationRateLimitForTests,
  checkPublicMutationRateLimit,
  clientKeyFromRequest,
} from "./public-mutation-rate-limit"

__resetPublicMutationRateLimitForTests()

const key = "203.0.113.10"
const windowMs = 60_000
const limit = 3
const t0 = 1_000_000

assert.equal(
  checkPublicMutationRateLimit({ key, limit, windowMs, now: t0 }).ok,
  true
)
assert.equal(
  checkPublicMutationRateLimit({ key, limit, windowMs, now: t0 + 1 }).ok,
  true
)
assert.equal(
  checkPublicMutationRateLimit({ key, limit, windowMs, now: t0 + 2 }).ok,
  true
)
assert.equal(
  checkPublicMutationRateLimit({ key, limit, windowMs, now: t0 + 3 }).ok,
  false
)
assert.equal(
  checkPublicMutationRateLimit({ key, limit, windowMs, now: t0 + windowMs }).ok,
  true
)

assert.equal(clientKeyFromRequest({ ip: "198.51.100.9" }), "198.51.100.9")
assert.equal(clientKeyFromRequest({}), "unknown")

// Cap: many distinct keys must not grow without bound forever.
__resetPublicMutationRateLimitForTests()
for (let i = 0; i < 6000; i++) {
  checkPublicMutationRateLimit({
    key: `ip-${i}`,
    limit: 1,
    windowMs: 60_000,
    now: t0,
  })
}
assert.ok(
  __publicMutationRateLimitSizeForTests() <= 5000,
  "rate limit map must stay capped"
)

console.log("public-mutation-rate-limit.fidelity: ok")
