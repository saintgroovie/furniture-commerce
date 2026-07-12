import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { buildClassificationView } from "./classification.ts"
import { buildPriceSummary, formatMoney } from "./price-summary.ts"
import { buildMediaSummary } from "./media-summary.ts"
import { buildStorefrontPreviewUrl, resolveStorefrontOrigin } from "./preview-url.ts"
import {
  createSaveState,
  isDirty,
  reduceSaveState,
  saveStatusLabel,
} from "./save-state.ts"
import { isWoodrightAdminUxV1Enabled } from "../feature-flags/woodright-admin-flags.ts"

describe("classification", () => {
  it("maps STANDARD/CONFIGURABLE/BESPOKE from productClassification", () => {
    assert.equal(
      buildClassificationView({
        productClassification: { product_type: "STANDARD" },
      }).label,
      "Готовый"
    )
    assert.equal(
      buildClassificationView({
        product_classification: { product_type: "CONFIGURABLE" },
      }).code,
      "CONFIGURABLE"
    )
    assert.equal(
      buildClassificationView({
        productClassification: { product_type: "BESPOKE" },
      }).label,
      "На заказ"
    )
  })

  it("does not invent type when missing", () => {
    const v = buildClassificationView({})
    assert.equal(v.code, null)
    assert.equal(v.label, "Тип не указан")
    assert.ok(v.warning)
  })
})

describe("price summary", () => {
  it("shows single price", () => {
    const s = buildPriceSummary(1, [[{ amount: 109500, currency_code: "rub" }]])
    assert.match(s.label, /109/)
    assert.equal(s.variants_without_price, 0)
  })

  it("shows range and missing prices", () => {
    const s = buildPriceSummary(3, [
      [{ amount: 100, currency_code: "rub" }],
      [{ amount: 300, currency_code: "rub" }],
      [],
    ])
    assert.equal(s.variants_without_price, 1)
    assert.equal(s.groups[0].min, 100)
    assert.equal(s.groups[0].max, 300)
  })

  it("does not mix currencies", () => {
    const s = buildPriceSummary(2, [
      [{ amount: 10, currency_code: "rub" }],
      [{ amount: 5, currency_code: "usd" }],
    ])
    assert.equal(s.groups.length, 2)
    assert.match(s.label, /валют/i)
  })

  it("labels empty as Цена не задана", () => {
    const s = buildPriceSummary(2, [[], []])
    assert.equal(s.label, "Цена не задана")
  })

  it("formatMoney uses RUB", () => {
    assert.match(formatMoney(1000, "rub"), /1/)
  })
})

describe("media summary", () => {
  it("limits previews and warns without thumbnail", () => {
    const images = Array.from({ length: 96 }, (_, i) => ({
      url: `https://example.com/${i}.jpg`,
    }))
    const s = buildMediaSummary({ thumbnail: null, images }, 8)
    assert.equal(s.image_count, 96)
    assert.equal(s.has_thumbnail, false)
    assert.ok(s.preview_urls.length <= 8)
    assert.ok(s.warnings.some((w) => /thumbnail/i.test(w) || /главного/i.test(w)))
  })

  it("prefers thumbnail first in preview", () => {
    const s = buildMediaSummary({
      thumbnail: "https://example.com/thumb.jpg",
      images: [{ url: "https://example.com/a.jpg" }],
    })
    assert.equal(s.preview_urls[0], "https://example.com/thumb.jpg")
  })
})

describe("preview url", () => {
  it("uses /product/:id not handle", () => {
    const v = buildStorefrontPreviewUrl({
      productId: "prod_01ABC",
      status: "published",
      storefrontOrigin: "http://localhost:3002",
    })
    assert.equal(v.url, "http://localhost:3002/product/prod_01ABC")
    assert.equal(v.disabled, false)
  })

  it("warns for draft", () => {
    const v = buildStorefrontPreviewUrl({ productId: "prod_1", status: "draft" })
    assert.match(v.note ?? "", /не «Опубликован»|каталог/i)
  })

  it("resolves origin from env", () => {
    assert.equal(
      resolveStorefrontOrigin({ WOODRIGHT_STOREFRONT_ORIGIN: "http://127.0.0.1:3002/" }),
      "http://127.0.0.1:3002"
    )
  })
})

describe("save state", () => {
  it("tracks dirty and save success without clearing on error", () => {
    let s = createSaveState({
      title: "A",
      description: "d",
      status: "draft",
    })
    s = reduceSaveState(s, { type: "edit", patch: { title: "B" } })
    assert.equal(isDirty(s), true)
    assert.equal(saveStatusLabel(s.status), "Есть несохранённые изменения")
    s = reduceSaveState(s, { type: "save_start" })
    s = reduceSaveState(s, { type: "save_error", message: "fail" })
    assert.equal(s.draft.title, "B")
    assert.equal(s.status, "error")
    s = reduceSaveState(s, {
      type: "save_success",
      fields: { title: "B", description: "d", status: "draft" },
    })
    assert.equal(s.status, "saved")
    assert.equal(isDirty(s), false)
  })
})

describe("feature flag", () => {
  it("defaults off for Package B entry", () => {
    assert.equal(isWoodrightAdminUxV1Enabled({}), false)
    assert.equal(isWoodrightAdminUxV1Enabled({ WOODRIGHT_ADMIN_UX_V1: "1" }), true)
  })
})
