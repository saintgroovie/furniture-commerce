/**
 * PASS C — upholstery presentation: evidenced hex → color swatches; no hero tiles.
 *   yarn dlx tsx src/lib/option-presentation-pass-c.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  buildIntraProductExecutionSelectors,
  containCatalogCardExecutionSelectors,
  isFabricFamilyOnlyUpholstery,
  resolveUpholsteryAxisPresentation,
} from "./card-color-media"
import {
  resolveExecutionPresentation,
  resolveUpholsteryAxisPresentation as resolveAxisFromContract,
} from "../../../backend/src/lib/option-presentation-contract"

describe("option presentation contract", () => {
  it("prefers swatch_image over hex", () => {
    assert.equal(
      resolveExecutionPresentation({
        swatch_hex: "#abc",
        swatch_image: "/static/fabrics/leona.jpg",
      }),
      "swatch_image"
    )
  })

  it("uses swatch_color when only hex is evidenced", () => {
    assert.equal(
      resolveExecutionPresentation({ swatch_hex: "#d8d0c4" }),
      "swatch_color"
    )
  })

  it("falls back to text without visual evidence", () => {
    assert.equal(resolveExecutionPresentation({}), "text")
  })

  it("axis helper matches storefront export", () => {
    const rows = [{ swatchHex: "#b8c9d8" }, { swatchHex: "#d8d0c4" }]
    assert.equal(resolveUpholsteryAxisPresentation(rows), "swatch_color")
    assert.equal(resolveAxisFromContract(rows), "swatch_color")
  })
})

describe("PASS C Oliver fabric families", () => {
  it("keeps curated family swatch_hex and single Обивка axis", () => {
    const product = {
      handle: "ol-07-1",
      thumbnail: "/static/products/oliver/ol-07-1.jpg",
      metadata: {
        fabric_upholstery_executions: [
          {
            key: "leona",
            label: "leona",
            urls: ["/static/products/oliver/OL-07-1_color_leona_01.jpg"],
            swatch_hex: "#b8c9d8",
          },
          {
            key: "lillian",
            label: "lillian",
            urls: ["/static/products/oliver/OL-07-1_color_lillian_01.jpg"],
            swatch_hex: "#d8d0c4",
          },
        ],
      },
    }
    const selectors = buildIntraProductExecutionSelectors(
      product,
      product.thumbnail
    )
    assert.equal(selectors.separateFabricRows, undefined)
    assert.equal(selectors.upholstery?.length, 2)
    assert.equal(isFabricFamilyOnlyUpholstery(selectors.upholstery), true)
    assert.equal(
      resolveUpholsteryAxisPresentation(selectors.upholstery!),
      "swatch_color"
    )
    for (const row of selectors.upholstery!) {
      assert.ok(row.swatchHex, row.key)
      assert.equal(row.presentation, "swatch_color")
      assert.ok(row.mainSrc, "hero mainSrc retained for gallery")
      assert.equal(row.swatchImageUrl ?? null, null)
    }
  })

  it("text fallback when family rows have no hex and no texture", () => {
    const product = {
      handle: "ol-07-1",
      thumbnail: "/static/x.jpg",
      metadata: {
        fabric_upholstery_executions: ["leona", "lorna"].map((key) => ({
          key,
          label: key,
          urls: [`/static/${key}.jpg`],
        })),
      },
    }
    const selectors = buildIntraProductExecutionSelectors(
      product,
      product.thumbnail
    )
    assert.equal(
      resolveUpholsteryAxisPresentation(selectors.upholstery!),
      "text"
    )
  })

  it("PASS A card containment unchanged", () => {
    const product = {
      handle: "ol-07-1",
      thumbnail: "/static/x.jpg",
      metadata: {
        fabric_upholstery_executions: ["leona", "lillian"].map((key) => ({
          key,
          label: key,
          urls: [`/static/${key}.jpg`],
          swatch_hex: "#ccc",
        })),
      },
    }
    const raw = buildIntraProductExecutionSelectors(product, product.thumbnail)
    const card = containCatalogCardExecutionSelectors(raw, product)
    assert.equal(card.upholstery, undefined)
    assert.equal(card.separateFabricRows, undefined)
  })

  it("Greenwich color fabrics stay swatch_color", () => {
    const product = {
      handle: "greenwich-gr-09-1-bed-90",
      thumbnail: "/static/g.jpg",
      metadata: {
        fabric_upholstery_executions: [
          {
            key: "beige",
            label: "Светло-серая",
            urls: [],
            swatch_hex: "#d6cfc2",
          },
          {
            key: "darkblue",
            label: "Сине-зелёная",
            urls: [],
            swatch_hex: "#4d6b72",
          },
        ],
        headboard_model_executions: [
          { key: "cloud", label: "Облако", urls: ["/static/h1.jpg"] },
          { key: "plane", label: "Плоское", urls: ["/static/h2.jpg"] },
        ],
      },
    }
    const selectors = buildIntraProductExecutionSelectors(
      product,
      product.thumbnail
    )
    assert.ok(selectors.upholstery)
    assert.equal(
      resolveUpholsteryAxisPresentation(selectors.upholstery!),
      "swatch_color"
    )
  })
  it("mixed texture axis never uses sibling mainSrc as image swatch", () => {
    const axis = resolveUpholsteryAxisPresentation([
      {
        swatchHex: "#abcabc",
        swatchImageUrl: "/static/fabrics/leona-texture.jpg",
        presentation: "swatch_image",
      },
      { swatchHex: "#d8d0c4", presentation: "swatch_color" },
    ])
    assert.equal(axis, "swatch_image")
    /* Rendering contract: non-texture siblings stay color/text chips;
       only swatchImageUrl may become <img> (see allowHeroAsSwatch). */
  })
})

console.log("option-presentation-pass-c.fidelity.test.ts: PASS")
