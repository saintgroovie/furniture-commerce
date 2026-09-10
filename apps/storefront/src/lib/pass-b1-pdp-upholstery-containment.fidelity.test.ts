/**
 * PASS B.1 — PDP upholstery containment (Case A).
 * One semantic «Обивка» axis; no per-family section axes; no product-thumb swatch model.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  buildIntraProductExecutionSelectors,
  containCatalogCardExecutionSelectors,
  isFabricFamilyOnlyUpholstery,
  isFabricFamilyUpholsteryKey,
  type CardColorVariant,
} from "./card-color-media"

function multiFabricProduct(handle: string, keys: string[]) {
  return {
    handle,
    thumbnail: `/static/products/oliver/${handle}.jpg`,
    metadata: {
      fabric_upholstery_executions: keys.map((key) => ({
        key,
        label: key,
        urls: [`/static/products/oliver/${handle}_color_${key}_01.jpg`],
      })),
    },
  }
}

function assertSingleUpholsteryAxis(
  handle: string,
  keys: string[],
  selectors: ReturnType<typeof buildIntraProductExecutionSelectors>
) {
  assert.equal(selectors.separateFabricRows, undefined, `${handle}: no separateFabricRows`)
  assert.ok(selectors.upholstery, `${handle}: upholstery present`)
  assert.equal(selectors.upholstery!.length, keys.length, handle)
  assert.deepEqual(
    selectors.upholstery!.map((r) => r.key),
    keys,
    handle
  )
  assert.equal(isFabricFamilyOnlyUpholstery(selectors.upholstery), true, handle)
  for (const row of selectors.upholstery!) {
    assert.ok(isFabricFamilyUpholsteryKey(row.key), `${handle}: ${row.key}`)
    /* Without metadata hex, PASS C must not invent swatchHex. */
    assert.equal(
      row.swatchHex ?? null,
      null,
      `${handle}: no invented swatchHex for ${row.key}`
    )
  }
}

describe("PASS B.1 Case A — single Обивка axis", () => {
  it("OL-07-1 renders maximum one upholstery axis (4 family values)", () => {
    const keys = ["leona", "lillian", "linda", "lorna"]
    const product = multiFabricProduct("ol-07-1", keys)
    const selectors = buildIntraProductExecutionSelectors(product, product.thumbnail)
    assertSingleUpholsteryAxis("ol-07-1", keys, selectors)
  })

  it("OL-23-1 renders maximum one upholstery axis (5 family values)", () => {
    const keys = ["leona", "lillian", "linda", "lorna", "torno"]
    const product = multiFabricProduct("ol-23-1", keys)
    const selectors = buildIntraProductExecutionSelectors(product, product.thumbnail)
    assertSingleUpholsteryAxis("ol-23-1", keys, selectors)
  })

  it("OL-55-1 renders maximum one upholstery axis (3 family values)", () => {
    const keys = ["leona", "lorna", "torno"]
    const product = multiFabricProduct("ol-55-1", keys)
    const selectors = buildIntraProductExecutionSelectors(product, product.thumbnail)
    assertSingleUpholsteryAxis("ol-55-1", keys, selectors)
  })

  it("Oliver beds do not render one axis per family", () => {
    for (const handle of ["ol-14-1", "ol-16-1", "ol-17-1", "ol-18-1"] as const) {
      const keys = ["lillian", "lorna"]
      const product = multiFabricProduct(handle, keys)
      const selectors = buildIntraProductExecutionSelectors(product, product.thumbnail)
      assertSingleUpholsteryAxis(handle, keys, selectors)
    }
  })

  it("OL-82-1 does not render three family axes", () => {
    const keys = ["linda", "lorna", "torno"]
    const product = multiFabricProduct("ol-82-1", keys)
    const selectors = buildIntraProductExecutionSelectors(product, product.thumbnail)
    assertSingleUpholsteryAxis("ol-82-1", keys, selectors)
  })

  it("Leona/Lilian/Linda/Lorna/Торно never become separate section axes", () => {
    const product = multiFabricProduct("ol-07-1", ["leona", "lillian", "linda", "lorna"])
    const selectors = buildIntraProductExecutionSelectors(product, product.thumbnail)
    assert.equal(selectors.separateFabricRows, undefined)
    assert.ok((selectors.upholstery?.length ?? 0) >= 2)
  })

  it("duplicate Обивка group count from model = 1 (no separateFabricRows + upholstery)", () => {
    const product = multiFabricProduct("ol-23-1", [
      "leona",
      "lillian",
      "linda",
      "lorna",
      "torno",
    ])
    const selectors = buildIntraProductExecutionSelectors(product, product.thumbnail)
    assert.equal(selectors.upholstery ? 1 : 0, 1)
    assert.equal(selectors.separateFabricRows ? selectors.separateFabricRows.length : 0, 0)
  })
})

describe("PASS B.1 media semantics", () => {
  it("family values keep execution mainSrc for hero swap", () => {
    const product = multiFabricProduct("ol-07-1", ["leona", "lillian"])
    const selectors = buildIntraProductExecutionSelectors(product, product.thumbnail)
    for (const row of selectors.upholstery ?? []) {
      assert.ok(row.mainSrc, "mainSrc for media preview")
    }
  })

  it("imageSwatches path requires separateFabricRows which PASS B.1 never emits for Case A", () => {
    const product = multiFabricProduct("ol-82-1", ["linda", "lorna", "torno"])
    const selectors = buildIntraProductExecutionSelectors(product, product.thumbnail)
    assert.equal(selectors.separateFabricRows, undefined)
  })

  it("PASS C: metadata swatch_hex on family keys is kept for color swatches (not product-thumb tiles)", () => {
    const product = {
      handle: "ol-07-1",
      thumbnail: "/static/x.jpg",
      metadata: {
        fabric_upholstery_executions: ["leona", "lorna"].map((key) => ({
          key,
          label: key,
          urls: [`/static/${key}.jpg`],
          swatch_hex: "#abcdef",
        })),
      },
    }
    const selectors = buildIntraProductExecutionSelectors(product, product.thumbnail)
    for (const row of selectors.upholstery ?? []) {
      assert.equal(row.swatchHex, "#abcdef", row.key)
      assert.equal(row.presentation, "swatch_color", row.key)
      assert.equal(row.swatchImageUrl ?? null, null, "no invented texture URL")
    }
  })
})

describe("PASS B.1 unresolved controls", () => {
  it("OL-56-1 gets no invented individual colors / no fake multi-family axes", () => {
    const product = {
      handle: "ol-56-1",
      thumbnail: "/static/products/oliver/ol-56-1.jpg",
      metadata: {
        finish_color_executions: [
          {
            key: "lilian",
            label: "lillian",
            urls: ["/static/products/oliver/OL-56-1_color_lillian_01.jpg"],
          },
        ],
      },
    }
    const raw = buildIntraProductExecutionSelectors(product, product.thumbnail)
    assert.equal(raw.separateFabricRows, undefined)
    const card = containCatalogCardExecutionSelectors(raw, product)
    assert.equal(card.upholstery, undefined)
    assert.equal(card.finish, undefined)
    assert.equal(card.separateFabricRows, undefined)
  })

  it("OL-57-1/2 get no invented colors from family-only finish metadata", () => {
    for (const handle of ["ol-57-1", "ol-57-2"] as const) {
      const product = {
        handle,
        thumbnail: `/static/products/oliver/${handle}.jpg`,
        metadata: {
          finish_color_executions: [
            {
              key: "lillian",
              label: "lillian",
              urls: [`/static/products/oliver/${handle}_color_lillian_01.jpg`],
            },
          ],
        },
      }
      const raw = buildIntraProductExecutionSelectors(product, product.thumbnail)
      assert.equal(raw.separateFabricRows, undefined)
      const card = containCatalogCardExecutionSelectors(raw, product)
      assert.equal(card.upholstery, undefined)
      assert.equal(card.finish, undefined)
    }
  })
})

describe("PASS B.1 card regression", () => {
  it("Product Card PASS A remains: family axes 0 on catalog", () => {
    const product = multiFabricProduct("ol-07-1", ["leona", "lillian", "linda", "lorna"])
    const raw = buildIntraProductExecutionSelectors(product, product.thumbnail)
    const card = containCatalogCardExecutionSelectors(raw, product)
    assert.equal(card.separateFabricRows, undefined)
    assert.equal(card.upholstery, undefined)
  })

  it("Standard Color/Wood selectors still pass through containment for non-Oliver", () => {
    const selectors = {
      finish: [
        { key: "white", label: "Белый", mainSrc: "a", extraSrcs: [], swatchHex: "#fff" },
        { key: "graphite", label: "Графит", mainSrc: "b", extraSrcs: [], swatchHex: "#333" },
      ] as CardColorVariant[],
      finishLabel: "Цвет",
      wood: [
        { key: "natural", label: "Натуральный", mainSrc: "c", extraSrcs: [] },
        { key: "dark", label: "Тёмный", mainSrc: "d", extraSrcs: [] },
      ] as CardColorVariant[],
      confidence: "canonical" as const,
    }
    const card = containCatalogCardExecutionSelectors(selectors, {
      handle: "greenwich-gr-08-1",
    })
    assert.equal(card.finish?.length, 2)
    assert.equal(card.wood?.length, 2)
  })
})
