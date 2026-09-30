import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { decodeSession, encodeSession } from "./session-codec.ts"

const env = { WOODRIGHT_WORKSPACE_SESSION_SECRET: "workspace-session-secret-for-tests-32" }

describe("session codec", () => {
  it("rejects an expired session", () => {
    const now = Date.parse("2026-09-30T12:00:00.000Z")
    const raw = encodeSession({ kind: "medusa", token: "tok", email: "seller@example.com" }, now, env)
    assert.ok(raw)
    assert.equal(decodeSession(raw, { now: now + 60 * 60 * 13 * 1000, env }), null)
    assert.equal(decodeSession(raw, { now: now + 1000, env })?.email, "seller@example.com")
  })

  it("rejects a cookie without a signature", () => {
    const raw = Buffer.from(JSON.stringify({ kind: "medusa", token: "tok", email: "a@b.c", exp: Date.now() + 1000 }), "utf8").toString(
      "base64url"
    )
    assert.equal(decodeSession(raw, { env }), null)
  })

  it("rejects a tampered expiry", () => {
    const now = Date.parse("2026-09-30T12:00:00.000Z")
    const raw = encodeSession({ kind: "medusa", token: "tok", email: "seller@example.com" }, now, env)
    assert.ok(raw)
    const body = raw.slice(0, raw.lastIndexOf("."))
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { exp: number }
    payload.exp = now + 60 * 60 * 24 * 1000
    const tampered = `${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}${raw.slice(raw.lastIndexOf("."))}`
    assert.equal(decodeSession(tampered, { now: now + 60 * 60 * 13 * 1000, env }), null)
  })

  it("refuses to issue a session without a server secret", () => {
    assert.equal(encodeSession({ kind: "medusa", token: "tok", email: "a@b.c" }, Date.now(), {}), null)
  })
})
