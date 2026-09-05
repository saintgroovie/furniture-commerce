import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { SellerProduct } from "./seller-product-types.ts"
import {
  highestAttentionChip,
  sellerSiteState,
  SELLER_STATE_LABELS,
} from "./seller-site-state.ts"

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

describe("sellerSiteState", () => {
  it("returns on_site for published visible products", () => {
    const state = sellerSiteState(product({ id: "1", title: "A" }))
    assert.equal(state, "on_site")
    assert.equal(SELLER_STATE_LABELS[state].badge, "На сайте")
    assert.equal(SELLER_STATE_LABELS[state].color, "green")
  })

  it("returns published_not_shown for published invisible products", () => {
    const state = sellerSiteState(
      product({
        id: "2",
        title: "B",
        readiness: {
          published: true,
          visible: false,
          has_price: true,
          has_media: true,
          warning_count: 1,
          error_count: 0,
          codes: ["published_invisible"],
        },
      })
    )
    assert.equal(state, "published_not_shown")
    assert.equal(SELLER_STATE_LABELS[state].badge, "Не показывается")
    assert.notEqual(SELLER_STATE_LABELS[state].badge, "Опубликован")
  })

  it("returns hidden for a ready draft", () => {
    const state = sellerSiteState(
      product({
        id: "3",
        title: "C",
        status: "draft",
        readiness: {
          published: false,
          visible: false,
          has_price: true,
          has_media: true,
          warning_count: 0,
          error_count: 0,
          codes: ["draft"],
        },
        publish: { ready: true, blockers: [], warnings: [] },
      })
    )
    assert.equal(state, "hidden")
    assert.equal(SELLER_STATE_LABELS[state].badge, "Скрыт")
    assert.equal(SELLER_STATE_LABELS[state].helper, "Готов к публикации")
  })

  it("returns hidden_incomplete for a draft that cannot publish", () => {
    const state = sellerSiteState(
      product({
        id: "4",
        title: "D",
        status: "draft",
        readiness: {
          published: false,
          visible: false,
          has_price: false,
          has_media: false,
          warning_count: 0,
          error_count: 1,
          codes: ["draft", "missing_price", "missing_media"],
        },
        publish: {
          ready: false,
          blockers: [{ severity: "error", code: "missing_price", message: "Добавьте цену" }],
          warnings: [],
        },
      })
    )
    assert.equal(state, "hidden_incomplete")
    assert.equal(SELLER_STATE_LABELS[state].helper, "Пока нельзя опубликовать")
  })
})

describe("highestAttentionChip", () => {
  it("prefers not-shown over price and photo", () => {
    const chip = highestAttentionChip(["missing_media", "missing_price", "published_invisible"])
    assert.equal(chip?.code, "published_invisible")
    assert.equal(chip?.label, "Не показывается")
  })

  it("prefers missing price over missing photo", () => {
    const chip = highestAttentionChip(["missing_media", "missing_price"])
    assert.equal(chip?.label, "Без цены")
  })

  it("returns null when there is no list chip", () => {
    assert.equal(highestAttentionChip(["draft"]), null)
  })
})
