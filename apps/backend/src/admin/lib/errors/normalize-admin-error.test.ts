import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  formatAdminErrorPrimary,
  normalizeAdminError,
} from "./normalize-admin-error.ts"

describe("normalizeAdminError", () => {
  it("maps duplicate SKU from server code", () => {
    const out = normalizeAdminError({
      httpStatus: 400,
      endpoint: "/admin/products",
      body: { message: "sku already exists", code: "duplicate_sku" },
    })
    assert.equal(out.code, "duplicate_sku")
    assert.match(out.title, /артикул/i)
    assert.equal(out.technical.httpStatus, 400)
    assert.ok(out.technical.rawMessage)
  })

  it("maps 401 to expired session", () => {
    const out = normalizeAdminError({ httpStatus: 401, endpoint: "/admin/users/me" })
    assert.equal(out.code, "expired_session")
  })

  it("maps network failures", () => {
    const out = normalizeAdminError({
      error: new TypeError("Failed to fetch"),
      endpoint: "/admin/products",
    })
    assert.equal(out.code, "network_error")
  })

  it("keeps unknown errors honest with technical raw message", () => {
    const out = normalizeAdminError({
      httpStatus: 500,
      body: { message: "ECONNREFUSED postgres" },
    })
    assert.equal(out.code, "unknown")
    assert.match(formatAdminErrorPrimary(out), /технические сведения|Повторите/i)
    assert.match(out.technical.rawMessage ?? "", /ECONNREFUSED/)
  })

  it("honors explicit codeHint", () => {
    const out = normalizeAdminError({
      httpStatus: 400,
      codeHint: "missing_price",
      body: { message: "whatever" },
    })
    assert.equal(out.code, "missing_price")
  })

  it("maps 401 + invalid_token to expired_session, not validation", () => {
    const out = normalizeAdminError({
      httpStatus: 401,
      endpoint: "/admin/users/me",
      body: { message: "invalid token", code: "invalid_token" },
    })
    assert.equal(out.code, "expired_session")
  })

  it("maps 403 + forbidden server code to forbidden", () => {
    const out = normalizeAdminError({
      httpStatus: 403,
      body: { message: "not allowed", code: "forbidden" },
    })
    assert.equal(out.code, "forbidden")
  })

  it("keeps RUB guidance for invalid_currency", () => {
    const out = normalizeAdminError({ codeHint: "invalid_currency" })
    assert.match(out.action, /RUB/)
  })
})
