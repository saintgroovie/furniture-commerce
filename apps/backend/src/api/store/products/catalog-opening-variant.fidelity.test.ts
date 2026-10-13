/**
 * Catalog browse and the full product must open the same SKU.
 *
 * Oliver array order starts at OL-15-2 (69 230 ₽). The axis contract opens
 * OL-14-2 (48 930 ₽). Browse must not lose the axes that make those equal.
 *
 *   node_modules/.bin/tsx src/api/store/products/catalog-opening-variant.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { resolveDefaultBuyerConfiguration } from "../../../lib/default-buyer-configuration"
import { projectCatalogBrowseProduct } from "./catalog-browse-projection"
import {
  BROWSE_FILTERED_PRODUCT_FIELDS,
  BROWSE_PRODUCT_FIELDS,
  slimBrowseVariantRecord,
} from "./load-store-product-list"

const OL_15_2 = "variant_01KNTBXBMB81GA2HENQ4Q54NDZ"
const OL_14_2 = "variant_01KNTBXBMBTGQAE0VQC94SFJY6"

const tiers = {
  material_tiers: {
    solid_front_ldsp_body: {
      key: "solid_front_ldsp_body",
      label_ru: "Фасады из массива + корпус ЛДСП",
      price_multiplier: 0.7,
      position: 0,
    },
    solid_full: {
      key: "solid_full",
      label_ru: "Массив",
      price_multiplier: 1,
      position: 1,
    },
  },
}

function axes(mattressSort: number, mattressDisplay: string) {
  return {
    lift: {
      sort: 0,
      label: "Подъёмный механизм",
      display: "Без подъёмного механизма",
    },
    footboard: { sort: 0, label: "Исполнение", display: "Без изножья" },
    mattress_size: {
      sort: mattressSort,
      label: "Размер спального места",
      display: mattressDisplay,
    },
  }
}

/** Live Oliver order: OL-15-2 is variants[0], opening axis is OL-14-2. */
const oliverVariants = [
  {
    id: OL_15_2,
    sku: "OL-15-2",
    calculated_price: {
      calculated_amount: 98_900,
      original_amount: 98_900,
      currency_code: "rub",
    },
    metadata: { variant_axes: axes(1, "120 × 190 см") },
  },
  {
    id: OL_14_2,
    sku: "OL-14-2",
    calculated_price: {
      calculated_amount: 69_900,
      original_amount: 69_900,
      currency_code: "rub",
    },
    metadata: { variant_axes: axes(0, "90 × 190 см") },
  },
]

const oliver = {
  id: "prod_oliver",
  handle: "ol-14-1",
  title: "Кровать Оливер",
  status: "published",
  metadata: tiers,
  variants: oliverVariants,
}

const full = resolveDefaultBuyerConfiguration(oliver)
assert.ok(full)
assert.equal(full.variant_id, OL_14_2)
assert.equal(full.min_unit_price, 48_930)

const browseProduct = {
  ...oliver,
  variants: oliverVariants.map((variant) => slimBrowseVariantRecord(variant)),
}
const browse = resolveDefaultBuyerConfiguration(browseProduct)
assert.ok(browse)
assert.equal(
  browse.variant_id,
  OL_14_2,
  "browse projection must open OL-14-2, not array-head OL-15-2"
)
assert.equal(browse.min_unit_price, 48_930)
assert.equal(browse.variant_id, full.variant_id)
assert.equal(browse.min_unit_price, full.min_unit_price)

assert.ok(
  BROWSE_PRODUCT_FIELDS.includes("variants.metadata"),
  "browse graph must load variant metadata for the opening axis"
)
assert.ok(BROWSE_FILTERED_PRODUCT_FIELDS.includes("variants.metadata"))

const wired = projectCatalogBrowseProduct({
  ...browseProduct,
  metadata: {
    ...tiers,
    buyer_default_configuration: browse,
  },
})
const wiredCfg = (
  wired.metadata as { buyer_default_configuration: { variant_id: string; min_unit_price: number } }
).buyer_default_configuration
assert.equal(wiredCfg.variant_id, OL_14_2)
assert.equal(wiredCfg.min_unit_price, 48_930)

/* Empty capabilities suppress product-tier inheritance. Browse must keep the bag. */
const bare = {
  ...oliver,
  variants: oliverVariants.map((variant, index) => ({
    ...variant,
    metadata: {
      ...variant.metadata,
      capabilities: index === 1 ? {} : tiers,
    },
  })),
}
const bareFull = resolveDefaultBuyerConfiguration(bare)
const bareBrowse = resolveDefaultBuyerConfiguration({
  ...bare,
  variants: bare.variants.map((variant) => slimBrowseVariantRecord(variant)),
})
assert.equal(bareFull?.variant_id, OL_14_2)
assert.equal(bareFull?.min_unit_price, 69_900)
assert.equal(bareBrowse?.variant_id, bareFull?.variant_id)
assert.equal(bareBrowse?.min_unit_price, bareFull?.min_unit_price)

console.log("catalog-opening-variant.fidelity.test.ts: ok")
