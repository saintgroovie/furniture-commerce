import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  isWoodrightAdminUxV1Enabled,
  readWoodrightAdminFeatureFlags,
} from "./woodright-admin-flags.ts"

describe("woodright admin feature flags", () => {
  it("defaults to off", () => {
    assert.equal(isWoodrightAdminUxV1Enabled({}), false)
    assert.deepEqual(readWoodrightAdminFeatureFlags({}), { adminUxV1: false })
  })

  it("enables on 1/true/yes/on", () => {
    assert.equal(isWoodrightAdminUxV1Enabled({ WOODRIGHT_ADMIN_UX_V1: "1" }), true)
    assert.equal(isWoodrightAdminUxV1Enabled({ WOODRIGHT_ADMIN_UX_V1: "true" }), true)
    assert.equal(isWoodrightAdminUxV1Enabled({ WOODRIGHT_ADMIN_UX_V1: "YES" }), true)
    assert.equal(isWoodrightAdminUxV1Enabled({ WOODRIGHT_ADMIN_UX_V1: "on" }), true)
  })

  it("ignores other values", () => {
    assert.equal(isWoodrightAdminUxV1Enabled({ WOODRIGHT_ADMIN_UX_V1: "0" }), false)
    assert.equal(isWoodrightAdminUxV1Enabled({ WOODRIGHT_ADMIN_UX_V1: "false" }), false)
  })
})
