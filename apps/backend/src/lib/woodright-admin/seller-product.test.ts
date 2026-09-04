import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { toSellerProduct } from "./seller-product.ts"

describe("toSellerProduct variant prices", () => {
  it("keeps each variant mapped to its own RUB price id", () => {
    const product = toSellerProduct({
      id: "prod_1",
      title: "Oliver",
      handle: "ol-01-1",
      status: "draft",
      metadata: { collection: "oliver" },
      variants: [
        {
          id: "var_a",
          sku: "OL-01-1",
          title: "160",
          price_set: {
            prices: [{ id: "price_a", amount: 189000, currency_code: "rub" }],
          },
        },
        {
          id: "var_b",
          sku: "OL-01-2",
          title: "180",
          prices: [{ id: "price_b", amount: 210000, currency_code: "rub" }],
        },
      ],
      product_classification: { product_type: "STANDARD" },
    })
    assert.equal(product.variants.length, 2)
    assert.equal(product.variants[0]?.id, "var_a")
    assert.deepEqual(product.variants[0]?.rub_price, {
      id: "price_a",
      amount: 189000,
      currency_code: "rub",
    })
    assert.equal(product.variants[1]?.id, "var_b")
    assert.deepEqual(product.variants[1]?.rub_price, {
      id: "price_b",
      amount: 210000,
      currency_code: "rub",
    })
    assert.equal(product.price_display.kind, "range")
    if (product.price_display.kind === "range") {
      assert.equal(product.price_display.min, 189000)
      assert.equal(product.price_display.max, 210000)
      assert.equal(product.price_display.variant_count, 2)
    }
  })
})
