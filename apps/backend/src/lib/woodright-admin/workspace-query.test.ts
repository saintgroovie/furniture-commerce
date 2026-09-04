import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { SellerProduct } from "./seller-product-types.ts"
import {
  formatSellerVariantCount,
  isWoodrightCreateProductSegment,
  matchesAttentionFilter,
  matchesSellerSearch,
  WOODRIGHT_CREATE_PRODUCT_SEGMENT,
} from "./workspace-query.ts"

function product(partial: Partial<SellerProduct> & Pick<SellerProduct, "id" | "title">): SellerProduct {
  return {
    handle: "h",
    status: "published",
    thumbnail: null,
    updated_at: null,
    collection_label: "Оливер",
    classification: "STANDARD",
    skus: ["OL-23-1"],
    variants: [],
    price_display: { kind: "none" },
    readiness: {
      published: true,
      visible: true,
      has_price: true,
      has_media: true,
      warning_count: 0,
      error_count: 0,
      codes: [],
    },
    execution_media_guard: false,
    dimensions: {},
    image_urls: [],
    has_material_tiers: false,
    collection_key: "oliver",
    publish: {
      ready: true,
      blockers: [],
      warnings: [],
    },
    ...partial,
  }
}

describe("workspace query", () => {
  it("matches SKU and title search", () => {
    const row = product({ id: "1", title: "Oliver кровать" })
    assert.equal(matchesSellerSearch(row, "OL-23-1"), true)
    assert.equal(matchesSellerSearch(row, "кровать"), true)
    assert.equal(matchesSellerSearch(row, "неттакого"), false)
  })

  it("filters attention codes", () => {
    const row = product({
      id: "1",
      title: "X",
      readiness: {
        published: false,
        visible: false,
        has_price: true,
        has_media: false,
        warning_count: 1,
        error_count: 0,
        codes: ["draft", "missing_media"],
      },
    })
    assert.equal(matchesAttentionFilter(row, "drafts"), true)
    assert.equal(matchesAttentionFilter(row, "missing_media"), true)
    assert.equal(matchesAttentionFilter(row, "missing_price"), false)
    assert.equal(matchesAttentionFilter(row, "not_ready"), false)
  })

  it("filters not-ready from publish readiness", () => {
    const row = product({
      id: "2",
      title: "Y",
      publish: {
        ready: false,
        blockers: [{ severity: "error", code: "missing_price", message: "Добавьте цену" }],
        warnings: [],
      },
    })
    assert.equal(matchesAttentionFilter(row, "not_ready"), true)
  })

  it("declines variant count in Russian", () => {
    assert.equal(formatSellerVariantCount(1), "1 вариант")
    assert.equal(formatSellerVariantCount(2), "2 варианта")
    assert.equal(formatSellerVariantCount(3), "3 варианта")
    assert.equal(formatSellerVariantCount(5), "5 вариантов")
    assert.equal(formatSellerVariantCount(21), "21 вариант")
  })

  it("does not treat the create segment as a product id", () => {
    assert.equal(WOODRIGHT_CREATE_PRODUCT_SEGMENT, "new")
    assert.equal(isWoodrightCreateProductSegment("new"), true)
    assert.equal(isWoodrightCreateProductSegment("prod_01"), false)
    assert.equal(isWoodrightCreateProductSegment(undefined), false)
  })
})
