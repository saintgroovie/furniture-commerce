/**
 * PASS B — storefront selector integration with normalization.
 *   yarn dlx tsx src/lib/upholstery-color-pass-b.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  buildIntraProductExecutionSelectors,
  containCatalogCardExecutionSelectors,
} from "./card-color-media"

{
  /* OL-07-1: PASS B.1 single Обивка axis; card PASS A contains */
  const product = {
    handle: "ol-07-1",
    title: "Сундук",
    thumbnail: "/static/products/oliver/ol-07-1.jpg",
    metadata: {
      fabric_upholstery_executions: ["leona", "lillian", "linda", "lorna"].map((key) => ({
        key,
        label: key,
        urls: [`/static/products/oliver/ol-07-1_color_${key}_01.jpg`],
        swatch_hex: "#ccc",
      })),
    },
  }
  const raw = buildIntraProductExecutionSelectors(product, product.thumbnail)
  assert.equal(raw.separateFabricRows, undefined)
  assert.equal(raw.upholstery?.length, 4)
  const card = containCatalogCardExecutionSelectors(raw, product)
  assert.equal(card.separateFabricRows, undefined)
  assert.equal(card.upholstery, undefined)
}

{
  /* OL-56-1: after normalize, no fake finish/upholstery axes on card; no invent */
  const product = {
    handle: "ol-56-1",
    title: "Кресло",
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
  const card = containCatalogCardExecutionSelectors(raw, product)
  assert.equal(card.finish, undefined)
  assert.equal(card.upholstery, undefined)
  assert.equal(card.separateFabricRows, undefined)
}

{
  /* Color/Wood unaffected — non-ol finish+wood */
  const product = {
    handle: "greenwich-gr-05-1",
    title: "Комод",
    thumbnail: "/static/x.jpg",
    metadata: {
      finish_color_executions: [
        { key: "white", label: "Белый", urls: ["/static/w.jpg"], swatch_hex: "#fff" },
        { key: "graphite", label: "Графит", urls: ["/static/g.jpg"], swatch_hex: "#333" },
      ],
      frame_material_executions: [
        { key: "natural", label: "Натуральный", urls: ["/static/n.jpg"] },
        { key: "dark", label: "Тёмный", urls: ["/static/d.jpg"] },
      ],
    },
  }
  const raw = buildIntraProductExecutionSelectors(product, product.thumbnail)
  const card = containCatalogCardExecutionSelectors(raw, product)
  assert.ok((card.finish?.length ?? 0) >= 2 || (raw.finish?.length ?? 0) >= 2 || (raw.wood?.length ?? 0) >= 2)
}

console.log("upholstery-color-pass-b.fidelity.test.ts: PASS")
