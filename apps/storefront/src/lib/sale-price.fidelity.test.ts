/**
 * Sale price helper (native price list truth) + card / PDP / promo structure.
 * Run: `yarn tsx src/lib/sale-price.fidelity.test.ts` from apps/storefront
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  resolveOriginalBasePrice,
  resolveOriginalOpeningPrice,
  resolveSalePrice,
  salePercent,
} from "./sale-price"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

function product(extras: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "p-1",
    variants: [
      {
        prices: [{ amount: 109_500 }],
        calculated_price: {
          calculated_amount: 98_550,
          original_amount: 109_500,
          is_calculated_price_price_list: true,
        },
      },
    ],
    metadata: {},
    ...extras,
  }
}

// Percent math
assert.equal(salePercent(109_500, 98_550), 10)
assert.equal(salePercent(1000, 1000), 0)
assert.equal(salePercent(1000, 1200), 0)
assert.equal(salePercent(0, 10), 0)

// Native price-list sale → original base + sale pair
{
  const p = product()
  assert.equal(resolveOriginalBasePrice(p), 109_500)
  assert.deepEqual(resolveSalePrice(p, 98_550), {
    amount: 98_550,
    originalAmount: 109_500,
    percent: 10,
  })
}

// No price list → no sale, even if amounts differ (never invent a discount)
{
  const p = product({
    variants: [
      {
        prices: [{ amount: 109_500 }],
        calculated_price: {
          calculated_amount: 98_550,
          original_amount: 109_500,
          is_calculated_price_price_list: false,
        },
      },
    ],
  })
  assert.equal(resolveOriginalBasePrice(p), null)
  assert.equal(resolveSalePrice(p, 98_550), null)
}

// Equal amounts → no sale
{
  const p = product({
    variants: [
      {
        calculated_price: {
          calculated_amount: 109_500,
          original_amount: 109_500,
          is_calculated_price_price_list: true,
        },
      },
    ],
  })
  assert.equal(resolveSalePrice(p, 109_500), null)
}

// Missing calculated_price (raw prices only) → no sale
assert.equal(resolveSalePrice({ variants: [{ prices: [{ amount: 100 }] }] }, 100), null)
assert.equal(resolveSalePrice({}, 100), null)
assert.equal(resolveSalePrice(product(), null), null)

// Tier-aware backend default wins over the raw variant pair
{
  const p = product({
    metadata: {
      buyer_default_configuration: {
        min_unit_price: 68_985,
        original_min_unit_price: 76_650,
      },
    },
  })
  assert.equal(resolveOriginalOpeningPrice(p), 76_650)
  assert.deepEqual(resolveSalePrice(p, 68_985), {
    amount: 68_985,
    originalAmount: 76_650,
    percent: 10,
  })
}

// Backend default without original → no sale (backend is the truth)
{
  const p = product({
    metadata: { buyer_default_configuration: { min_unit_price: 68_985 } },
  })
  assert.equal(resolveOriginalOpeningPrice(p), null)
  assert.equal(resolveSalePrice(p, 68_985), null)
}

// Structure: ProductCard renders sale pair with sr-only prefixes, PDP block
// takes originalBasePrice, PDP page passes it, promo card uses <s> + sr-only.
{
  const card = readFileSync(join(root, "components/product-card.tsx"), "utf8")
  assert.match(card, /resolveSalePrice\(/)
  assert.match(card, /className="price price-sale"/)
  assert.match(card, /promotionCopy\.wasPriceSr/)
  assert.match(card, /<s>\{formatRub\(cardSale\.originalAmount\)\}<\/s>/)

  const pdpBlock = readFileSync(join(root, "components/pdp-price-block.tsx"), "utf8")
  assert.match(pdpBlock, /originalBasePrice\?: number \| null/)
  assert.match(pdpBlock, /resolveConfiguredUnitPrice\(\s*originalBasePrice,/)
  assert.match(pdpBlock, /promotionCopy\.wasPriceSr/)

  const pdpPage = readFileSync(join(root, "app/product/[id]/page.tsx"), "utf8")
  assert.match(pdpPage, /originalBasePrice=\{resolveOriginalBasePrice\(/)

  const promo = readFileSync(join(root, "components/promotion-card.tsx"), "utf8")
  assert.match(promo, /href=\{active\.href\}/)
  assert.match(promo, /prefers-reduced-motion: reduce/)
  assert.match(promo, /className="sr-only">\{promotionCopy\.wasPriceSr\}/)
  assert.match(promo, /<s>\{formatRub\(active\.originalPrice\)\}<\/s>/)
  assert.match(promo, /aria-hidden=\{i !== state\.index\}/)
  // No hardcoded product ids / discount values in the storefront island
  assert.doesNotMatch(promo, /prod_01/)
  assert.doesNotMatch(promo, /0\.9\b/)

  // Catalog page: promo fetched server-side alongside products, fail-open
  const catalog = readFileSync(join(root, "app/catalog/page.tsx"), "utf8")
  assert.match(catalog, /getPromotionSlot\(\)/)
  assert.match(catalog, /promotionSlot=\{toClientPromotionSlot\(promotionSlot\)\}/)

  // Browse client: window rendered as a right-gutter aside, grid stays products-only
  const browse = readFileSync(join(root, "components/catalog-browse-client.tsx"), "utf8")
  assert.match(browse, /shouldShowPromotionWindow\(promotionSlot, displayEntries\.length\)/)
  assert.match(browse, /className="catalog-promo-sidebar"/)
  assert.doesNotMatch(browse, /catalog-grid-promotion/)
}

console.log("sale-price.fidelity.test.ts: ok")
