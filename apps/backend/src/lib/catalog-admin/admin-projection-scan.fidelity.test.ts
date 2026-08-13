/**
 * Full-catalog parser scan fixture pass (offline).
 * Uses representative shapes; live DB scan is separate ops step.
 *   yarn dlx tsx src/lib/catalog-admin/admin-projection-scan.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { buildAdminProductProjection } from "./admin-product-projection"
import { listDimensionsTrustSkus } from "./dimensions-trust"

const fixtures: Array<Parameters<typeof buildAdminProductProjection>[0]> = [
  {
    id: "1",
    handle: "te-05-1",
    title: "Комод",
    metadata: {
      public_title: "Комод Templars",
      dimensions: { height_mm: 900, width_mm: 840, depth_mm: 560 },
    },
    variants: [{ sku: "TE-05-1" }],
  },
  {
    id: "2",
    handle: "pa-62-1",
    metadata: { dimensions: { height_mm: 1973, width_mm: 940, depth_mm: 560 } },
    variants: [{ sku: "PA-62-1" }],
  },
  {
    id: "3",
    handle: "fa-05-3",
    metadata: { dimensions: { height_mm: 1370, width_mm: 650, depth_mm: 440 } },
    variants: [{ sku: "FA-05-3" }],
  },
  {
    id: "4",
    handle: "ol-08-1-mirror",
    metadata: { dimensions: { height_mm: 1000, width_mm: 650, depth_mm: 30 } },
    variants: [{ sku: "OL-08-1-MIR" }],
  },
  {
    id: "5",
    handle: "pr-30-1",
    title: "Часы",
    metadata: { dimensions: { height_mm: 374, width_mm: 288, depth_mm: 40 } },
    variants: [{ sku: "PR-30-1" }],
  },
  {
    id: "6",
    handle: "s-ox-05",
    metadata: {},
    variants: [{ sku: "S-OX-05" }],
  },
  {
    id: "7",
    handle: "pv-uph",
    metadata: {
      fabric_upholstery_executions: [
        null,
        { key: "a", label: "A", swatch_hex: "#111111", presentation: "swatch_color" },
        { key: "b", label: "B", presentation: "text" },
      ],
    },
    variants: [{ sku: "PV-UPH-1" }],
    classification: "CONFIGURABLE",
  },
  {
    id: "8",
    handle: "bespoke-x",
    metadata: { product_type: "BESPOKE" },
    variants: [{ sku: "BESPOKE-X" }],
    classification: "BESPOKE",
  },
  {
    id: "9",
    handle: "no-opts",
    title: "Полка",
    metadata: { public_title: "Полка настенная Oliver" },
    options: [{ title: "Default", values: [{ value: "Default Variant" }] }],
    variants: [{ title: "Default Variant", sku: "OL-NO" }],
    classification: "STANDARD",
  },
  {
    id: "10",
    handle: "pr-06-1",
    metadata: { dimensions: { width_mm: 1202, depth_mm: 502 } },
    variants: [{ sku: "PR-06-1" }],
  },
  {
    id: "11",
    handle: "long-title",
    metadata: {
      public_title:
        "Очень длинное покупательское название товара с конфигурацией и моделью Provence для проверки переноса",
    },
    variants: [{ sku: "LONG-1" }],
  },
  {
    id: "12",
    handle: "pedestal",
    title: "Тумба письменного стола ЯП",
    metadata: { canonical_name: "Тумба письменного стола Provence" },
    variants: [{ sku: "PV-DESK-1" }],
  },
  {
    id: "13",
    handle: "malformed",
    metadata: {
      finish_color_executions: [null, "x", 3, { label: "Белый" }],
    },
    variants: [{ sku: "MAL-1" }],
  },
  {
    id: "14",
    handle: "mc-99-1",
    metadata: { dimensions: { height_mm: 2500, width_mm: 1730 } },
    variants: [{ sku: "MC-99-1" }],
  },
  {
    id: "15",
    handle: "sh-99-1",
    metadata: { dimensions: { height_mm: 2500, width_mm: 1764 } },
    variants: [{ sku: "SH-99-1" }],
  },
]

let failures = 0
for (const f of fixtures) {
  try {
    const p = buildAdminProductProjection(f)
    assert.ok(p.public_title)
    assert.ok(p.dimensions)
    assert.ok(p.data_quality)
    assert.ok(p.price.semantics_ru)
  } catch (e) {
    failures += 1
    console.error("FAIL", f.id, e)
  }
}

/* Every trust-map SKU must parse */
for (const sku of listDimensionsTrustSkus()) {
  const p = buildAdminProductProjection({
    id: `trust-${sku}`,
    handle: sku.toLowerCase(),
    variants: [{ sku }],
    metadata: {},
  })
  assert.ok(p.dimensions.trust_state)
}

assert.equal(failures, 0)
console.log(
  `admin-projection-scan.fidelity.test.ts: PASS fixtures=${fixtures.length} trust_skus=${listDimensionsTrustSkus().length} parser_failures=0`
)
