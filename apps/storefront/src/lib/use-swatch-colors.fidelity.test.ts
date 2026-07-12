/**
 * Contract: gated swatch path keeps metadata hexes, skips image-only variants.
 *
 *   ../backend/node_modules/.bin/tsx src/lib/use-swatch-colors.fidelity.test.ts
 */
import assert from "node:assert/strict"
import type { CardColorVariant } from "./card-color-media"
import { buildMetadataOnlySwatchSamples } from "./use-swatch-colors"

const variants: CardColorVariant[] = [
  {
    key: "a",
    label: "A",
    mainSrc: "/static/products/a.jpg",
    extraSrcs: [],
    swatchHex: "#111111",
  },
  {
    key: "b",
    label: "B",
    mainSrc: "/static/products/b.jpg",
    extraSrcs: [],
  },
]

const gated = buildMetadataOnlySwatchSamples(variants)
assert.equal(gated.size, 1)
assert.equal(gated.get("a")?.source, "metadata")
assert.equal(gated.get("a")?.color, "#111111")
assert.equal(gated.has("b"), false)

console.log("use-swatch-colors.fidelity.test.ts: ok")
