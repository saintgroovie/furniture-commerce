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

  it("maps duplicate promotion code from Medusa raw message", () => {
    const out = normalizeAdminError({
      httpStatus: 400,
      endpoint: "/admin/promotions",
      body: { message: "Promotion with code: SUMMER10, already exists." },
    })
    assert.equal(out.code, "duplicate_promo_code")
    assert.match(out.title, /код акции/i)
  })

  it("maps duplicate promo code from server code", () => {
    const out = normalizeAdminError({
      httpStatus: 400,
      body: { message: "conflict", code: "promo_code_already_exists" },
    })
    assert.equal(out.code, "duplicate_promo_code")
  })

  it("maps allocation/target_type validation to invalid_promotion_type", () => {
    const out = normalizeAdminError({
      httpStatus: 400,
      endpoint: "/admin/promotions",
      body: {
        message:
          "promotion allocation is required when target_type is items",
      },
    })
    assert.equal(out.code, "invalid_promotion_type")
    assert.match(out.action, /стандартной админке/)
  })

  it("maps campaign budget currency conflicts", () => {
    const out = normalizeAdminError({
      httpStatus: 400,
      body: { message: "campaign budget currency_code does not match" },
    })
    assert.equal(out.code, "campaign_budget_conflict")
  })

  it("still maps generic promotion rule failures", () => {
    const out = normalizeAdminError({
      httpStatus: 400,
      body: { message: "bad rule", code: "promotion_rule_invalid" },
    })
    assert.equal(out.code, "promotion_rule_error")
  })

  it("maps publishable key problems for cart verification", () => {
    const out = normalizeAdminError({
      httpStatus: 400,
      endpoint: "/store/carts",
      body: {
        message:
          "Publishable API key required in the request header: x-publishable-api-key",
      },
    })
    assert.equal(out.code, "publishable_key_missing")
    assert.match(out.explanation, /publishable/i)
  })

  it("keeps honest wording for cart verification hints", () => {
    const failed = normalizeAdminError({ codeHint: "cart_verification_failed" })
    assert.match(failed.action, /не подтверждён/i)
    const notApplied = normalizeAdminError({ codeHint: "promo_code_not_applied" })
    assert.match(notApplied.title, /не дал скидку/i)
  })

  it("routes unsupported promotion kinds to stock Admin", () => {
    const out = normalizeAdminError({ codeHint: "promotion_unsupported" })
    assert.match(out.action, /стандартной админке/)
  })

  it("maps stale promotion edits via codeHint", () => {
    const out = normalizeAdminError({ codeHint: "stale_data" })
    assert.match(out.title, /Устаревшие данные/i)
  })
})
