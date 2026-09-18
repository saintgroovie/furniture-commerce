/**
 * option-presentation-contract fidelity.
 *   yarn dlx tsx src/lib/option-presentation-contract.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  isConfirmedSwatchHex,
  resolveExecutionPresentation,
  resolveUpholsteryAxisPresentation,
} from "./option-presentation-contract"

assert.equal(isConfirmedSwatchHex("#d8d0c4"), true)
assert.equal(isConfirmedSwatchHex("d8d0c4"), false)
assert.equal(isConfirmedSwatchHex(""), false)

assert.equal(
  resolveExecutionPresentation({
    swatch_hex: "#abc",
    swatch_image: "/static/fabrics/x.jpg",
  }),
  "swatch_image"
)
assert.equal(resolveExecutionPresentation({ swatch_hex: "#d8d0c4" }), "swatch_color")
assert.equal(resolveExecutionPresentation({}), "text")

assert.equal(
  resolveUpholsteryAxisPresentation([{ swatchHex: "#b8c9d8" }, { swatchHex: null }]),
  "swatch_color"
)
assert.equal(
  resolveUpholsteryAxisPresentation([{ key: "leona" } as { swatchHex?: string }]),
  "text"
)

console.log("option-presentation-contract.fidelity.test.ts: PASS")
