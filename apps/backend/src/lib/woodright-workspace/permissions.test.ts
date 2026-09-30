import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { resolveStaffAccess, safeAdminFallbackUrl } from "./permissions.ts"

describe("resolveStaffAccess", () => {
  it("keeps daily capabilities and hides the escape hatch by default", () => {
    const access = resolveStaffAccess({ email: "seller@woodright.ru" })
    assert.equal(access.role, "staff")
    assert.equal(access.escape_hatch, false)
    assert.equal(access.capabilities.view_orders, true)
    assert.equal(access.capabilities.publish_catalog, true)
    assert.equal(access.capabilities.developer_escape_hatch, false)
  })

  it("opens the hatch only for an allowlisted email", () => {
    const access = resolveStaffAccess({
      email: "Owner@Woodright.ru",
      ownerEmailsRaw: "owner@woodright.ru, dev@woodright.ru",
    })
    assert.equal(access.role, "owner")
    assert.equal(access.escape_hatch, true)
  })
})

describe("safeAdminFallbackUrl", () => {
  it("refuses the public admin hostname", () => {
    assert.equal(safeAdminFallbackUrl("https://admin.woodright.ru/app"), null)
    assert.equal(safeAdminFallbackUrl("https://admin.woodright.ru./app"), null)
    assert.equal(safeAdminFallbackUrl("https://ADMIN.WOODRIGHT.RU/app"), null)
  })

  it("allows a loopback fallback", () => {
    assert.equal(safeAdminFallbackUrl(undefined), "http://127.0.0.1:9000/app")
  })
})
