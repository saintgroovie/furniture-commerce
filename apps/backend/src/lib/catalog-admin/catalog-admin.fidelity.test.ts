/**
 * Catalog-admin fidelity: projection, trust, merge-safe metadata, options.
 *   yarn dlx tsx src/lib/catalog-admin/catalog-admin.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { buildAdminProductProjection } from "./admin-product-projection"
import { lookupDimensionsTrust, listDimensionsTrustSkus, applyLiveDimensionsToTrust } from "./dimensions-trust"
import { mergeExecutionRowByKey, mergeProductMetadata, metadataFingerprintWithoutPublicTitle } from "./merge-metadata"
import { summarizeBuyerOptions } from "./buyer-options-summary"
import { resolvePublicProductTitle } from "../catalog-normalization/public-title"
import { guardBuyerFacingTitle } from "../catalog-normalization/import-guards"

/* --- dimensions trust --- */
assert.equal(lookupDimensionsTrust({ sku: "TE-05-1" }).state, "VERIFIED_CANONICAL")
assert.equal(lookupDimensionsTrust({ sku: "PR-30-1" }).state, "VERIFIED_CANONICAL")
assert.equal(lookupDimensionsTrust({ sku: "FA-05-3" }).state, "TEMPORARY_PENDING")
assert.equal(
  lookupDimensionsTrust({ sku: "PA-62-1" }).state,
  "STRONG_CANDIDATE_PENDING_OWNER"
)
assert.equal(lookupDimensionsTrust({ sku: "PR-06-1" }).state, "CONFLICT_SOURCE_DEBT")
assert.equal(lookupDimensionsTrust({ sku: "S-OX-05" }).state, "MISSING_SOURCE_DEBT")
assert.equal(lookupDimensionsTrust({ handle: "ol-08-1-mirror" }).state, "VERIFIED_CANONICAL")
assert.ok(lookupDimensionsTrust({ sku: "FA-05-3" }).block_casual_verify_implication)
assert.equal(lookupDimensionsTrust({ sku: "TE-05-1" }).block_casual_verify_implication, false)
assert.ok(listDimensionsTrustSkus().includes("TW-05-3"))
/* SKU/handle conflict → fail closed away from VERIFIED */
assert.equal(
  lookupDimensionsTrust({ sku: "TE-05-1", handle: "fa-05-3" }).state,
  "TEMPORARY_PENDING"
)
/* unmapped SKU must not inherit a mapped handle */
assert.equal(
  lookupDimensionsTrust({ sku: "XX-99-FILLED", handle: "te-05-1" }).state,
  "UNKNOWN"
)

/* drifted verified SKU is not confirmed */
const teDrift = buildAdminProductProjection({
  id: "prod_te_drift",
  handle: "te-05-1",
  metadata: {
    dimensions: { height_mm: 1, width_mm: 1, depth_mm: 1 },
  },
  variants: [{ sku: "TE-05-1" }],
})
assert.equal(teDrift.dimensions.trust_state, "UNKNOWN")
assert.match(teDrift.dimensions.manager_hint_ru, /не совпадают/i)

assert.equal(
  applyLiveDimensionsToTrust(
    lookupDimensionsTrust({ sku: "TE-05-1" }),
    { height_mm: 900, width_mm: 840, depth_mm: 560 }
  ).state,
  "VERIFIED_CANONICAL"
)

const fp = metadataFingerprintWithoutPublicTitle({
  public_title: "x",
  mystery: true,
})
assert.equal(fp.includes("public_title"), false)
assert.equal(fp.includes("mystery"), true)

/* C1 must not read as verified */
const c1 = buildAdminProductProjection({
  id: "prod_c1",
  title: "Комод высокий Fairies (гл. 560)",
  handle: "fa-05-3",
  status: "published",
  metadata: {
    dimensions: { height_mm: 1370, width_mm: 650, depth_mm: 440 },
  },
  variants: [{ sku: "FA-05-3", title: "Default Variant" }],
})
assert.equal(c1.dimensions.trust_state, "TEMPORARY_PENDING")
assert.equal(c1.data_quality.kind, "pending_confirmation")
assert.match(c1.dimensions.manager_hint_ru, /временно/i)
assert.equal(c1.dimensions.height_mm, 1370)

/* TE verified — no pending warning kind */
const te = buildAdminProductProjection({
  id: "prod_te",
  title: "Комод Templars",
  handle: "te-05-1",
  metadata: {
    public_title: "Комод стандартный Templars",
    dimensions: { height_mm: 900, width_mm: 840, depth_mm: 560 },
  },
  variants: [{ sku: "TE-05-1" }],
})
assert.equal(te.dimensions.trust_state, "VERIFIED_CANONICAL")
assert.equal(te.data_quality.kind, "ok")
assert.equal(te.public_title.includes("Templars"), true)

/* PA pending identity */
const pa = buildAdminProductProjection({
  id: "prod_pa",
  handle: "pa-62-1",
  metadata: {
    dimensions: { height_mm: 1973, width_mm: 940, depth_mm: 560 },
    legacy_cs_cart_product_id: "952",
  },
  variants: [{ sku: "PA-62-1" }],
})
assert.equal(pa.dimensions.trust_state, "STRONG_CANDIDATE_PENDING_OWNER")
assert.notEqual(pa.dimensions.trust_state, "VERIFIED_CANONICAL")

/* PR30 verified */
const pr30 = buildAdminProductProjection({
  id: "prod_pr30",
  handle: "pr-30-1",
  title: "Часы",
  metadata: {
    dimensions: { height_mm: 374, width_mm: 288, depth_mm: 40 },
  },
  variants: [{ sku: "PR-30-1" }],
})
assert.equal(pr30.dimensions.trust_state, "VERIFIED_CANONICAL")

/* S-OX missing */
const sox = buildAdminProductProjection({
  id: "prod_sox",
  handle: "s-ox-05",
  metadata: {},
  variants: [{ sku: "S-OX-05" }],
})
assert.equal(sox.dimensions.trust_state, "MISSING_SOURCE_DEBT")
assert.equal(sox.data_quality.kind, "needs_source")

/* conflict */
const pr06 = buildAdminProductProjection({
  id: "prod_pr06",
  handle: "pr-06-1",
  metadata: { dimensions: { width_mm: 1202, depth_mm: 502 } },
  variants: [{ sku: "PR-06-1" }],
})
assert.equal(pr06.dimensions.trust_state, "CONFLICT_SOURCE_DEBT")
assert.equal(pr06.dimensions.missing_axes.includes("H"), true)

/* options + Default hidden + malformed survival */
const opts = summarizeBuyerOptions({
  fabric_upholstery_executions: [
    null,
    "legacy-string",
    {
      key: "beige",
      label: "Бежевый",
      swatch_hex: "#c4b09a",
      presentation: "swatch_color",
      unknown_future_field: { nested: true },
    },
  ],
  material_tiers: [
    { key: "solid_full", label: "Массив", presentation: "material" },
    { key: "ldsp", label: "ЛДСП", presentation: "material" },
  ],
})
assert.ok(opts.axes.some((a) => a.key === "fabric_upholstery_executions"))
assert.ok(opts.has_malformed)
const fabric = opts.axes.find((a) => a.key === "fabric_upholstery_executions")!
assert.equal(fabric.swatch_color_count, 1)
assert.equal(fabric.malformed_row_count, 2)

const withStub = buildAdminProductProjection({
  id: "prod_stub",
  title: "Кровать",
  handle: "pv-test",
  metadata: {
    public_title: "Кровать Provence",
    material_tiers: [{ key: "a", label: "Массив" }],
  },
  options: [
    { title: "Default", values: [{ value: "Default Variant" }] },
    { title: "Размер", values: [{ value: "160×200" }] },
  ],
  variants: [{ title: "Default Variant", sku: "PV-TEST", prices: [{ amount: 100000, currency_code: "rub" }] }],
})
assert.equal(withStub.technical_default_hidden, true)
assert.ok(withStub.buyer_axes.length >= 1)
assert.match(withStub.price.semantics_ru, /не равна автоматически/i)
assert.ok(!withStub.public_title.toLowerCase().includes("default"))

/* public title precedence */
const pt = resolvePublicProductTitle({
  title: "Стол",
  handle: "ol-01",
  metadata: { public_title: "Стол письменный Oliver" },
})
assert.equal(pt.source, "metadata.public_title")
assert.equal(pt.public_title, "Стол письменный Oliver")
assert.deepEqual(guardBuyerFacingTitle("Тумба ЯП").map((f) => f.code), [
  "PEDESTAL_CODE_IN_PUBLIC_TITLE",
])

/* merge preserves unknown */
const merged = mergeProductMetadata(
  {
    public_title: "old",
    mystery_ops_flag: true,
    nested_keep: { a: 1 },
    dimensions: { height_mm: 900 },
  },
  { public_title: "new" }
)
assert.equal(merged.public_title, "new")
assert.equal(merged.mystery_ops_flag, true)
assert.deepEqual(merged.nested_keep, { a: 1 })
assert.deepEqual(merged.dimensions, { height_mm: 900 })

const execMerged = mergeExecutionRowByKey(
  [
    null,
    { key: "beige", label: "Бежевый", unknown_keep: 42, swatch_hex: "#aaa" },
    "string-row",
  ],
  "beige",
  { label: "Бежевый светлый" }
)
assert.equal(execMerged[0], null)
assert.equal(execMerged[2], "string-row")
assert.equal((execMerged[1] as { label: string }).label, "Бежевый светлый")
assert.equal((execMerged[1] as { unknown_keep: number }).unknown_keep, 42)

/* HWD order in compact */
assert.ok(te.dimensions.compact_mm?.startsWith("900"))
assert.match(te.dimensions.display_lines[0] ?? "", /900/)

console.log("catalog-admin.fidelity.test.ts: PASS")
