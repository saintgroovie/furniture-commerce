import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { UI_COPY } from "./ui-copy.ts"

describe("ui copy dictionary", () => {
  it("has non-empty values without leading/trailing spaces", () => {
    for (const [key, value] of Object.entries(UI_COPY)) {
      assert.ok(value.length > 0, key)
      assert.equal(value, value.trim(), key)
    }
  })

  it("avoids em/en dashes per dash-typography rule", () => {
    for (const [key, value] of Object.entries(UI_COPY)) {
      assert.ok(!/[—–]/.test(value), key)
    }
  })

  it("keeps single-phrase entries without a trailing period", () => {
    for (const [key, value] of Object.entries(UI_COPY)) {
      assert.ok(!value.endsWith("."), key)
    }
  })
})
