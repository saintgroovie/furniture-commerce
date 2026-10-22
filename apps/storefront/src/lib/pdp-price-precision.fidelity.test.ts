import assert from "node:assert/strict"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { PdpPriceBlock } from "../components/pdp-price-block"
import { PdpSizeChips } from "../components/pdp-size-chips"

const html = renderToStaticMarkup(createElement(PdpPriceBlock, {
  priceLabel: null, basePrice: 12345.67, originalBasePrice: 12400.50,
  requiresBuyerSelection: false, productKey: "native-plain",
}))
assert.match(html, /12\s*345,67/)
assert.match(html, /12\s*400,5/)
const chips = renderToStaticMarkup(createElement(PdpSizeChips, {
  productKey: "native-plain", materialTiers: null, requestQuote: false,
  chips: [
    { id: "native-plain?variant=a", label: "Базовое", basePrice: 12345.67, isCurrent: true },
    { id: "native-plain?variant=b", label: "С ящиками", basePrice: 20500.50, isCurrent: false },
  ],
}))
assert.match(chips, /12\s*345,67/)
assert.match(chips, /20\s*500,5/)
// Configured catalog pricing keeps its existing whole-ruble contract.
const configured = renderToStaticMarkup(createElement(PdpPriceBlock, {
  priceLabel: null, basePrice: 12345.67, requiresBuyerSelection: true, productKey: "configured",
  materialTiers: [{ code: "solid", label: "Массив", multiplier: 1, position: 0, price: 12346, description: null }],
}))
assert.match(configured, /12\s*346/)
console.log("pdp-price-precision.fidelity.test.ts ok")
