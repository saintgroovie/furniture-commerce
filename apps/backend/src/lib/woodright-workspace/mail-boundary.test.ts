import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { mailConnectorEnabled } from "./mail-boundary.ts"

describe("mail connector", () => {
  it("stays off even when a flag is present", () => {
    assert.equal(mailConnectorEnabled({ WOODRIGHT_MAIL_CONNECTOR: "on" }), false)
    assert.equal(mailConnectorEnabled({}), false)
  })
})
