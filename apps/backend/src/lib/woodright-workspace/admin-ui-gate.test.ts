import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  adminUiGateEnabled,
  decideAdminApiBrowser,
  decideAdminUi,
  parseAdminEmails,
} from "./admin-ui-gate.ts"

const allow = parseAdminEmails("owner@woodright.example, Dev@woodright.example")

describe("admin UI gate", () => {
  it("stays off unless the flag or an isolated database is set", () => {
    assert.equal(adminUiGateEnabled({}), false)
    assert.equal(adminUiGateEnabled({ WOODRIGHT_DB_ISOLATION: "isolated" }), true)
    assert.equal(adminUiGateEnabled({ WOODRIGHT_MEDUSA_ADMIN_UI_GATE: "1" }), true)
  })

  it("fail-closes an empty allow-list and still lets the owner through", () => {
    assert.equal(decideAdminUi({ enabled: true, email: "seller@example.com", allow: new Set() }), "deny")
    assert.equal(decideAdminUi({ enabled: true, email: null, allow: new Set() }), "login")
    assert.equal(decideAdminUi({ enabled: true, email: "owner@woodright.example", allow }), "allow")
    assert.equal(decideAdminUi({ enabled: true, email: "seller@example.com", allow }), "deny")
    assert.equal(decideAdminUi({ enabled: false, email: "seller@example.com", allow: new Set() }), "allow")
  })

  it("blocks the Admin UI origin and leaves server-side Admin API calls alone", () => {
    const denied = decideAdminApiBrowser({
      enabled: true,
      path: "/admin/products",
      origin: "http://127.0.0.1:9138",
      host: "127.0.0.1:9138",
      email: "seller@example.com",
      allow,
    })
    assert.equal(denied, "deny")
    const server = decideAdminApiBrowser({
      enabled: true,
      path: "/admin/woodright/products",
      origin: null,
      host: "127.0.0.1:9138",
      email: "seller@example.com",
      allow,
    })
    assert.equal(server, "pass")
    const owner = decideAdminApiBrowser({
      enabled: true,
      path: "/admin/products",
      origin: "http://127.0.0.1:9138",
      host: "127.0.0.1:9138",
      email: "dev@woodright.example",
      allow,
    })
    assert.equal(owner, "pass")
  })
})
