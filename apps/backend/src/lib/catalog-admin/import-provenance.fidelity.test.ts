/**
 * Import provenance presentation — allowlist, no SoT promotion.
 *   yarn dlx tsx src/lib/catalog-admin/import-provenance.fidelity.test.ts
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import {
  IMPORT_PROVENANCE_EXPLANATION,
  IMPORT_PROVENANCE_SECTION_TITLE,
  extractImportProvenance,
  isImportProvenanceMetadataKey,
} from "./import-provenance"
import { buildAdminProductProjection } from "./admin-product-projection"
import { resolvePublicProductTitle } from "../catalog-normalization/public-title"

assert.equal(isImportProvenanceMetadataKey("source_title"), true)
assert.equal(isImportProvenanceMetadataKey("family_options"), true)
assert.equal(isImportProvenanceMetadataKey("dimensions"), false)
assert.equal(isImportProvenanceMetadataKey("mystery_ops_flag"), false)

assert.equal(extractImportProvenance(null), null)
assert.equal(extractImportProvenance({}), null)
assert.equal(
  extractImportProvenance({ mystery_ops_flag: "гл.560", dimensions: { depth_mm: 440 } }),
  null
)

const mismatch = extractImportProvenance({
  source_title: "Комод высокий Fairies (гл. 560)",
  family_options: { Размер: "гл.560", "Роспись (мотив)": "Fairies" },
  mystery_ops_flag: "not-provenance",
})
assert.ok(mismatch)
assert.equal(mismatch.source_title?.includes("гл. 560"), true)
assert.equal(mismatch.family_options?.Размер, "гл.560")
assert.equal(
  mismatch.rows.some((r) => r.key === "mystery_ops_flag"),
  false
)

const matching = extractImportProvenance({
  source_title: "Комод стандартный Templars (гл. 560)",
  family_options: { Размер: "гл.560" },
})
assert.ok(matching)
assert.equal(matching.rows.some((r) => /560/.test(r.value)), true)

/* Historical mismatch: live 440 is SoT; 560 only in provenance */
const fa = buildAdminProductProjection({
  id: "prod_fa_n20",
  title: "Комод высокий Fairies",
  handle: "fa-05-3",
  status: "published",
  metadata: {
    source_title: "Комод высокий Fairies (гл. 560)",
    family_options: { Размер: "гл.560", "Роспись (мотив)": "Fairies" },
    dimensions: { height_mm: 1370, width_mm: 650, depth_mm: 440 },
  },
  variants: [{ sku: "FA-05-3", title: "Комод высокий Fairies" }],
})
assert.equal(fa.dimensions.depth_mm, 440)
assert.match(fa.dimensions.compact_mm ?? fa.dimensions.display_lines.join(" "), /440/)
assert.doesNotMatch(fa.dimensions.compact_mm ?? "", /560/)
assert.equal(fa.public_title.includes("560"), false)
assert.notEqual(fa.legacy_title, fa.import_provenance?.source_title)
assert.ok(fa.import_provenance)
assert.equal(fa.import_provenance.family_options?.Размер, "гл.560")
assert.equal(fa.data_quality.kind, "pending_confirmation")
assert.doesNotMatch(fa.data_quality.warnings.join(" "), /гл\.560/)
assert.doesNotMatch(fa.data_quality.warnings.join(" "), /440\s*\/\s*560/)
assert.doesNotMatch(fa.data_quality.warnings.join(" "), /\b560\b/)

/* Matching provenance: still informational, not an error */
const te = buildAdminProductProjection({
  id: "prod_te_n20",
  title: "Комод стандартный Templars",
  handle: "te-05-1",
  metadata: {
    public_title: "Комод стандартный Templars",
    source_title: "Комод стандартный Templars (гл. 560)",
    family_options: { Размер: "гл.560" },
    dimensions: { height_mm: 900, width_mm: 840, depth_mm: 560 },
  },
  variants: [{ sku: "TE-05-1" }],
})
assert.equal(te.dimensions.depth_mm, 560)
assert.equal(te.data_quality.kind, "ok")
assert.ok(te.import_provenance)
assert.doesNotMatch(te.data_quality.warnings.join(" "), /исходн/i)

/* Missing provenance: no block */
const bare = buildAdminProductProjection({
  id: "prod_bare_n20",
  title: "Стол Oliver",
  handle: "ol-01-1",
  metadata: { dimensions: { height_mm: 750, width_mm: 1200, depth_mm: 600 } },
  variants: [{ sku: "OL-01-1" }],
})
assert.equal(bare.import_provenance, null)
assert.doesNotMatch(bare.data_quality.warnings.join(" "), /440\s*\/\s*560/)
assert.doesNotMatch(bare.data_quality.warnings.join(" "), /\b560\b/)

/* source_title must not become public_title or legacy_title */
const titles = resolvePublicProductTitle({
  title: "Комод высокий Fairies",
  metadata: {
    source_title: "Комод высокий Fairies (гл. 560)",
  },
})
assert.equal(titles.public_title.includes("560"), false)
assert.equal(titles.legacy_title?.includes("560"), false)
assert.equal(titles.legacy_title, "Комод высокий Fairies")

const widget = fs.readFileSync(
  path.resolve(__dirname, "../../admin/widgets/catalog-buyer-preview.tsx"),
  "utf8"
)
assert.match(widget, /IMPORT_PROVENANCE_SECTION_TITLE/)
assert.match(widget, /IMPORT_PROVENANCE_EXPLANATION/)
assert.match(widget, /import_provenance/)
assert.equal(IMPORT_PROVENANCE_SECTION_TITLE, "Исходные данные импорта")
assert.match(IMPORT_PROVENANCE_EXPLANATION, /не используются как текущие/i)
assert.doesNotMatch(widget, /legacy\/canonical:.*source_title/)
const techChunk = widget.slice(widget.indexOf("Технические данные"))
assert.doesNotMatch(techChunk, /source_title/)
assert.doesNotMatch(techChunk, /family_options/)

console.log("import-provenance.fidelity.test.ts: PASS")
