/**
 * Direct-cart PDP CTA: buyer-facing «Добавить в корзину» when the click is
 * addLineItem. CONFIGURABLE adds manager-assisted secondary, not a configurator.
 *
 *   yarn exec tsx src/lib/woodright-order/purchase-contract.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { actions, productCta } from "../woodright-copy"
import {
  ctaLabelForDirectCartPurchase,
  ctaLabelForPurchase,
  isDirectCartPurchase,
  isIncompleteCartPurchase,
  type StorefrontPurchaseDto,
} from "./purchase-contract"

const addToCart = actions.addToCart
assert.equal(addToCart, "Добавить в корзину")
assert.equal(productCta.canAdaptBadge, "Можно адаптировать")
assert.equal(productCta.needNonstandard, "Нужен нестандарт?")

const adultStandard: StorefrontPurchaseDto = {
  sales_mode: "made_to_order",
  can_purchase: true,
  purchase_flow: "cart",
  cta_label: "Заказать",
}

const kidsStandard: StorefrontPurchaseDto = {
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

const kidsConfigurable: StorefrontPurchaseDto = {
  sales_mode: "configurable_to_order",
  can_purchase: true,
  purchase_flow: "cart",
  cta_label: "Настроить и заказать",
  requires_configuration: true,
}

const quoteOnly: StorefrontPurchaseDto = {
  sales_mode: "quote_required",
  can_purchase: false,
  purchase_flow: "quote",
  cta_label: "Запросить расчёт",
}

const bespokeProject: StorefrontPurchaseDto = {
  sales_mode: "bespoke_project",
  can_purchase: false,
  purchase_flow: "bespoke",
  cta_label: "Обсудить проект",
}

const unavailable: StorefrontPurchaseDto = {
  sales_mode: "unavailable",
  can_purchase: false,
  purchase_flow: "none",
  cta_label: "Узнать о возобновлении",
}

const invalidNoneWithCanPurchase: StorefrontPurchaseDto = {
  sales_mode: "configurable_to_order",
  can_purchase: true,
  purchase_flow: "none",
  cta_label: "Настроить и заказать",
}

assert.equal(ctaLabelForPurchase(adultStandard, addToCart), "Заказать")
assert.equal(ctaLabelForDirectCartPurchase(adultStandard, addToCart), addToCart)
assert.equal(ctaLabelForDirectCartPurchase(kidsStandard, addToCart), addToCart)
assert.equal(ctaLabelForDirectCartPurchase(adultConfigurable, addToCart), addToCart)
assert.equal(ctaLabelForDirectCartPurchase(kidsConfigurable, addToCart), addToCart)
assert.equal(ctaLabelForDirectCartPurchase(quoteOnly, addToCart), "Запросить расчёт")
assert.equal(ctaLabelForDirectCartPurchase(bespokeProject, addToCart), "Обсудить проект")
assert.equal(
  ctaLabelForDirectCartPurchase(unavailable, addToCart),
  "Узнать о возобновлении"
)
assert.equal(
  ctaLabelForDirectCartPurchase(invalidNoneWithCanPurchase, addToCart),
  "Настроить и заказать"
)
assert.equal(isDirectCartPurchase(adultStandard), true)
assert.equal(isDirectCartPurchase(adultConfigurable), true)
assert.equal(isDirectCartPurchase(quoteOnly), false)
assert.equal(isDirectCartPurchase(bespokeProject), false)
assert.equal(isDirectCartPurchase(unavailable), false)
assert.equal(isDirectCartPurchase(invalidNoneWithCanPurchase), false)
assert.equal(
  isDirectCartPurchase({
    sales_mode: "configurable_to_order",
    can_purchase: false,
    purchase_flow: "cart",
    cta_label: "Выберите параметры",
  }),
  false
)
assert.equal(
  isIncompleteCartPurchase({
    sales_mode: "configurable_to_order",
    can_purchase: false,
    purchase_flow: "cart",
    cta_label: "Выберите параметры",
  }),
  true
)
assert.equal(isIncompleteCartPurchase(adultStandard), false)
assert.equal(isIncompleteCartPurchase(invalidNoneWithCanPurchase), false)

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..")
const ctaSrc = readFileSync(join(root, "src/components/product-cta.tsx"), "utf8")
assert.match(ctaSrc, /ctaLabelForDirectCartPurchase/)
assert.match(ctaSrc, /isDirectCartPurchase\(purchase\)/)
assert.doesNotMatch(ctaSrc, /purchase\.purchase_flow === "cart" \|\| purchase\.can_purchase/)
assert.match(
  ctaSrc,
  /isDirectCartPurchase\(purchase\)[\s\S]*onClick=\{handleAddToCart\}/
)
assert.match(ctaSrc, /const data = await addLineItem\(cartId,/)
assert.match(ctaSrc, /copy\.canAdaptBadge/)
assert.match(ctaSrc, /copy\.needNonstandard/)
assert.match(ctaSrc, /isIncompleteCartPurchase\(purchase\)/)
assert.match(ctaSrc, /if \(purchase && !isDirectCartPurchase\(purchase\)\) return/)
assert.match(
  ctaSrc,
  /isDirectCartPurchase\(purchase\)[\s\S]*isIncompleteCartPurchase\(purchase\)[\s\S]*ctaLabelForPurchase\(purchase, copy\.unavailableCtaLabel\)/
)
assert.doesNotMatch(ctaSrc, /Сделать по моим размерам/)
assert.doesNotMatch(ctaSrc, /Настроить и заказать/)
assert.doesNotMatch(ctaSrc, /configureBespoke/)

const formSrc = readFileSync(join(root, "src/components/bespoke-form.tsx"), "utf8")
assert.match(formSrc, /fromPdpNonstandard/)
assert.match(formSrc, /pdpNonstandardFormTitle/)
assert.doesNotMatch(formSrc, /Настройте товар/)

console.log("purchase-contract.fidelity: ok")
