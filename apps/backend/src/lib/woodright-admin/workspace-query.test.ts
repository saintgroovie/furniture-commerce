import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { SellerProduct } from "./seller-product-types.ts"
import {
  findExactSkuMatch,
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
    general_image_urls: [],
    execution_photo_count: 0,
    execution_finishes: [],
    has_material_tiers: false,
    collection_key: "oliver",
    subtitle: "",
    description: "",
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

  it("opens only a unique exact SKU match", () => {
    const rows = [
      product({ id: "a", title: "A", skus: ["GR-05-1"] }),
      product({ id: "b", title: "B", skus: ["GR-05-2"] }),
    ]
    assert.equal(findExactSkuMatch(rows, "GR-05-1")?.id, "a")
    assert.equal(findExactSkuMatch(rows, " gr-05-1 ")?.id, "a")
    assert.equal(findExactSkuMatch(rows, "GR-05"), null)
    assert.equal(findExactSkuMatch(rows, "GR-05-1-M"), null)
    const dupes = [
      product({ id: "a", title: "A", skus: ["GR-05-1"] }),
      product({ id: "c", title: "C", skus: ["GR-05-1"] }),
    ]
    assert.equal(findExactSkuMatch(dupes, "GR-05-1"), null)
  })
})
