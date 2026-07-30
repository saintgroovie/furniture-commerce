/**
 *   ../backend/node_modules/.bin/tsx src/lib/http-access-log-redaction.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  redactRequestUrlsForAccessLog,
  redactUrlForAccessLog,
  registerHttpAccessLogRedaction,
} from "./http-access-log-redaction"

{
  assert.equal(redactUrlForAccessLog(null), "-")
  assert.equal(redactUrlForAccessLog(""), "-")
  assert.equal(redactUrlForAccessLog("/health"), "/health")
}

{
  const canary = "CANARY_PLAINTEXT_TOKEN_VALUE_xyz"
  const raw = `/store/woodright/orders/order_01ABC/process?token=${canary}`
  const out = redactUrlForAccessLog(raw)
  assert.equal(out.includes(canary), false)
  assert.equal(
    out,
    "/store/woodright/orders/order_01ABC/process?token=[REDACTED]"
  )
}

{
  const canary = "secondCanary"
  const raw =
    `/store/woodright/orders/order_01ABC/process?order_id=order_01ABC&token=${canary}&utm=keep`
  const out = redactUrlForAccessLog(raw)
  assert.equal(out.includes(canary), false)
  assert.ok(out.includes("order_id=order_01ABC"))
  assert.ok(out.includes("utm=keep"))
  assert.ok(out.includes("token=[REDACTED]"))
}

{
  const canary = "multiA"
  const canary2 = "multiB"
  const raw = `/x?token=${canary}&TOKEN=${canary2}`
  const out = redactUrlForAccessLog(raw)
  assert.equal(out.includes(canary), false)
  assert.equal(out.includes(canary2), false)
  assert.equal(out, "/x?token=[REDACTED]&TOKEN=[REDACTED]")
}

{
  const canary = "encodedVal"
  const raw = `/x?Token=${encodeURIComponent(canary)}`
  const out = redactUrlForAccessLog(raw)
  assert.equal(out.includes(canary), false)
  assert.ok(out.toLowerCase().includes("token=[redacted]"))
}

{
  // Encoded key name tok%65n → token
  const canary = "sneaky"
  const raw = `/x?tok%65n=${canary}&safe=1`
  const out = redactUrlForAccessLog(raw)
  assert.equal(out.includes(canary), false)
  assert.ok(out.includes("safe=1"))
  assert.ok(out.includes("[REDACTED]"))
}

{
  const canary = "bare"
  const out = redactUrlForAccessLog(`/x?token&ok=1`)
  assert.equal(out.includes("token=[REDACTED]"), true)
  assert.ok(out.includes("ok=1"))
  void canary
}

{
  const req = {
    originalUrl: "/p?token=SECRET&keep=yes",
    url: "/p?token=SECRET&keep=yes",
  }
  redactRequestUrlsForAccessLog(req)
  assert.equal(req.originalUrl.includes("SECRET"), false)
  assert.equal(req.url.includes("SECRET"), false)
  assert.ok(req.originalUrl.includes("keep=yes"))
}

{
  // register requires morgan (declared dependency); idempotent after success
  registerHttpAccessLogRedaction()
  registerHttpAccessLogRedaction()
}

console.log("http-access-log-redaction.fidelity.test.ts: ok")
