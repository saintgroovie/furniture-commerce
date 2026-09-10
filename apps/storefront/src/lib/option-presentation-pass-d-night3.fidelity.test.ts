/**
 * Night III — Default stub must stay hidden from buyer-facing presentation helpers.
 *   yarn dlx tsx src/lib/option-presentation-pass-d-night3.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  buildIntraProductExecutionSelectors,
  containCatalogCardExecutionSelectors,
} from "./card-color-media"
import { resolveExecutionPresentation } from "../../../backend/src/lib/option-presentation-contract"

describe("PASS D / Night III", () => {
  it("never invents swatch_image from hero urls", () => {
    assert.equal(
      resolveExecutionPresentation({
        swatch_hex: "#abcabc",
        // no swatch_image
      }),
      "swatch_color"
    )
  })

  it("Default-like technical labels do not appear in selector labels for Oliver", () => {
    const product = {
      handle: "ol-07-1",
      thumbnail: "/static/x.jpg",
      metadata: {
        fabric_upholstery_executions: [
          {
            key: "leona",
            label: "Leona",
            urls: ["/static/a.jpg"],
            swatch_hex: "#b8c9d8",
          },
          {
            key: "lillian",
            label: "Lilian",
            urls: ["/static/b.jpg"],
            swatch_hex: "#d8d0c4",
          },
        ],
      },
      options: [{ title: "Default", values: [{ value: "Default" }] }],
    }
    const selectors = buildIntraProductExecutionSelectors(
      product,
      product.thumbnail
    )
    const labels = (selectors.upholstery || []).map((r) => r.label)
    assert.equal(labels.includes("Default"), false)
    assert.ok(labels.includes("Leona"))
    /* Catalog containment strips fabric-family axes (PASS A); PDP keeps them. */
    const contained = containCatalogCardExecutionSelectors(selectors, product)
    assert.equal(contained.upholstery, undefined)
    assert.ok((selectors.upholstery || []).length >= 2)
  })
})
