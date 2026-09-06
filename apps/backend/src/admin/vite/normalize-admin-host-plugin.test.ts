import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { woodrightAdminNormalizeHostPlugin } from "./normalize-admin-host-plugin.ts"

describe("woodrightAdminNormalizeHostPlugin", () => {
  it("injects 127.0.0.1 → localhost redirect once", () => {
    const plugin = woodrightAdminNormalizeHostPlugin()
    const html = "<html><head></head><body></body></html>"
    const out = plugin.transformIndexHtml!.handler(html)
    assert.match(out, /woodright-admin-normalize-host/)
    assert.match(out, /127\.0\.0\.1/)
    assert.match(out, /hostname=\"localhost\"/)
    const again = plugin.transformIndexHtml!.handler(out)
    assert.equal(again, out)
  })
})
