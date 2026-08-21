/**
 * Kids cart-flow CTA: owner-approved «Добавить в корзину» + cart handler.
 * Adult configurable sales-mode copy stays «Настроить и заказать».
 *
 *   yarn exec tsx src/lib/woodright-order/purchase-contract.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { actions } from "../woodright-copy"
import {
  ctaLabelForDirectCartPurchase,
  ctaLabelForPurchase,
  type StorefrontPurchaseDto,
} from "./purchase-contract"

const addToCart = actions.addToCart
assert.equal(addToCart, "Добавить в корзину")

const kidsConfigurable: StorefrontPurchaseDto = {
  sales_mode: "configurable_to_order",
  can_purchase: true,
  purchase_flow: "cart",
  cta_label: "Настроить и заказать",
  requires_configuration: true,
}

const kidsMadeToOrder: StorefrontPurchaseDto = {
  sales_mode: "made_to_order",
  can_purchase: true,
  purchase_flow: "cart",
  cta_label: "Заказать",
}

const adultConfigurable: StorefrontPurchaseDto = {
  sales_mode: "configurable_to_order",
  can_purchase: true,
  purchase_flow: "cart",
  cta_label: "Настроить и заказать",
  requires_configuration: true,
}

const kidsQuote: StorefrontPurchaseDto = {
  sales_mode: "quote_required",
  can_purchase: false,
  purchase_flow: "quote",
  cta_label: "Запросить расчёт",
}

assert.equal(
  ctaLabelForPurchase(kidsConfigurable, addToCart),
  "Настроить и заказать"
)
assert.equal(
  ctaLabelForDirectCartPurchase(kidsConfigurable, addToCart, {
    kidsStorefront: true,
  }),
  addToCart
)
assert.equal(
  ctaLabelForDirectCartPurchase(kidsMadeToOrder, addToCart, {
    kidsStorefront: true,
  }),
  addToCart
)
assert.equal(
  ctaLabelForDirectCartPurchase(adultConfigurable, addToCart, {
    kidsStorefront: false,
  }),
  "Настроить и заказать"
)
assert.equal(
  ctaLabelForDirectCartPurchase(kidsQuote, addToCart, { kidsStorefront: true }),
  "Запросить расчёт"
)
assert.equal(
  ctaLabelForDirectCartPurchase(
    {
      sales_mode: "configurable_to_order",
      can_purchase: true,
      purchase_flow: "none",
      cta_label: "Настроить и заказать",
    },
    addToCart,
    { kidsStorefront: true }
  ),
  "Настроить и заказать"
)

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..")
const ctaSrc = readFileSync(join(root, "src/components/product-cta.tsx"), "utf8")
assert.match(ctaSrc, /ctaLabelForDirectCartPurchase/)
assert.match(ctaSrc, /kidsStorefront:\s*isKidsStorefrontProduct\(product\)/)
assert.match(
  ctaSrc,
  /purchase\.purchase_flow === "cart"[\s\S]*onClick=\{handleAddToCart\}/
)
assert.match(ctaSrc, /const data = await addLineItem\(cartId,/)

console.log("purchase-contract.fidelity: ok")
