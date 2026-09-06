import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { buyerProductPreviewUrl, resolveWoodrightSiteUrl } from "./site-preview-url.ts"

describe("resolveWoodrightSiteUrl", () => {
  it("uses WOODRIGHT_SITE_URL when set", () => {
    assert.equal(
      resolveWoodrightSiteUrl({ WOODRIGHT_SITE_URL: "https://woodright.ru/" }),
      "https://woodright.ru"
    )
  })

  it("falls back to local QA origin", () => {
    assert.equal(resolveWoodrightSiteUrl({}), "http://localhost:3002")
  })
})

describe("buyerProductPreviewUrl", () => {
  it("builds the PDP path from the product id", () => {
    assert.equal(
      buyerProductPreviewUrl("prod_1", "http://localhost:3002"),
      "http://localhost:3002/product/prod_1"
    )
  })

  it("requires an explicit origin and does not read process.env", () => {
    assert.throws(() => buyerProductPreviewUrl("prod_1", "   "), /requires a resolved site origin/)
    assert.throws(() => buyerProductPreviewUrl("prod_1", ""), /requires a resolved site origin/)
  })
})
