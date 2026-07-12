import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { resolveWoodrightAdminUxFlag } from "./browser-flag.ts"

describe("resolveWoodrightAdminUxFlag", () => {
  it("defaults to off when no source is present", () => {
    assert.equal(resolveWoodrightAdminUxFlag({}), false)
    assert.equal(
      resolveWoodrightAdminUxFlag({
        windowValue: null,
        localStorageValue: null,
        envValue: null,
      }),
      false
    )
  })

  it("window override wins over localStorage and env", () => {
    assert.equal(
      resolveWoodrightAdminUxFlag({
        windowValue: "1",
        localStorageValue: "0",
        envValue: "0",
      }),
      true
    )
    // A disabling window value must not fall through to enabling sources.
    assert.equal(
      resolveWoodrightAdminUxFlag({
        windowValue: "0",
        localStorageValue: "true",
        envValue: "true",
      }),
      false
    )
  })

  it("localStorage wins over env", () => {
    assert.equal(
      resolveWoodrightAdminUxFlag({ localStorageValue: "true", envValue: "0" }),
      true
    )
    assert.equal(
      resolveWoodrightAdminUxFlag({ localStorageValue: "0", envValue: "1" }),
      false
    )
  })

  it("falls back to env when browser sources are absent", () => {
    assert.equal(resolveWoodrightAdminUxFlag({ envValue: "on" }), true)
    assert.equal(resolveWoodrightAdminUxFlag({ envValue: "off" }), false)
  })

  it("accepts the same value grammar as the server-side flag", () => {
    for (const enabled of ["1", "true", "YES", "on"]) {
      assert.equal(resolveWoodrightAdminUxFlag({ windowValue: enabled }), true)
    }
    for (const disabled of ["0", "false", "", "nope"]) {
      assert.equal(resolveWoodrightAdminUxFlag({ windowValue: disabled }), false)
    }
  })
})
