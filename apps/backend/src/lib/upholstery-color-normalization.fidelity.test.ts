/**
 * PASS B — upholstery / color normalization fidelity.
 *   yarn dlx tsx src/lib/upholstery-color-normalization.fidelity.test.ts
 *   (from apps/backend)
 *   or: yarn dlx tsx ../backend/src/lib/upholstery-color-normalization.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  canonicalizeFabricFamilyKey,
  fabricFamilyDisplayLabel,
  hasSoftUpholsteryProductEvidence,
  isFabricFamilyKey,
  normalizeUpholsteryMetadata,
  productWithNormalizedUpholsteryMetadata,
  validateUpholsteryDataRepairRow,
} from "./upholstery-color-normalization"

{
  assert.equal(canonicalizeFabricFamilyKey("lilian"), "lillian")
  assert.equal(canonicalizeFabricFamilyKey("LILLIAN"), "lillian")
  assert.equal(fabricFamilyDisplayLabel("lilian"), "Lilian")
  assert.equal(isFabricFamilyKey("Leona"), true)
  assert.equal(isFabricFamilyKey("beige"), false)
}

{
  /* Case A — OL-07-1: families stay fabric; no finish pollution */
  const product = {
    handle: "ol-07-1",
    title: "Сундук",
    metadata: {
      fabric_upholstery_executions: [
        { key: "leona", label: "leona", urls: ["/static/a_leona.jpg"] },
        { key: "lilian", label: "lilian", urls: ["/static/a_lilian.jpg"] },
        { key: "linda", label: "linda", urls: ["/static/a_linda.jpg"] },
        { key: "lorna", label: "lorna", urls: ["/static/a_lorna.jpg"] },
      ],
    },
  }
  const { metadata, report } = normalizeUpholsteryMetadata(product)
  const fabric = metadata.fabric_upholstery_executions as Array<{ key: string; label: string }>
  assert.equal(fabric.length, 4)
  assert.ok(fabric.every((f) => isFabricFamilyKey(f.key)))
  assert.equal(fabric.find((f) => f.key === "lillian")?.label, "Lilian")
  assert.equal(metadata.finish_color_executions, undefined)
  assert.equal(report.ownerMappingRequired, false)
  assert.ok(report.actions.includes("CODE_NORMALIZATION_ONLY"))
}

{
  /* Case A — OL-23-1 five families */
  const product = {
    handle: "ol-23-1",
    title: "Стул",
    metadata: {
      fabric_upholstery_executions: ["leona", "lillian", "linda", "lorna", "torno"].map(
        (key) => ({ key, label: key, urls: [`/static/${key}.jpg`] })
      ),
    },
  }
  const { metadata } = normalizeUpholsteryMetadata(product)
  assert.equal(
    (metadata.fabric_upholstery_executions as unknown[]).length,
    5
  )
}

{
  /* Case B — OL-56-1 mis-bucketed finish → fabric; owner mapping for colors */
  const product = {
    handle: "ol-56-1",
    title: "Кресло",
    metadata: {
      finish_color_executions: [
        {
          key: "lilian",
          label: "lillian",
          urls: [
            "/static/products/oliver/OL-56-1_color_lillian_01.jpg",
            "/static/products/oliver/OL-56-1_gallery_01.jpg",
          ],
        },
      ],
    },
  }
  assert.equal(hasSoftUpholsteryProductEvidence(product), true)
  const { metadata, report } = normalizeUpholsteryMetadata(product)
  const fabric = metadata.fabric_upholstery_executions as Array<{ key: string }>
  assert.equal(fabric.length, 1)
  assert.equal(fabric[0]?.key, "lillian")
  assert.equal(metadata.finish_color_executions, null)
  assert.equal(report.ownerMappingRequired, true)
  assert.ok(report.movedFinishFamilyKeys.includes("lillian") || report.movedFinishFamilyKeys.includes("lilian") || report.movedFinishFamilyKeys.length === 1)
  assert.ok(report.actions.includes("METADATA_REKEY_REQUIRED"))
  assert.ok(report.actions.includes("OWNER_MAPPING_REQUIRED"))
}

{
  /* Case B — OL-57-1 */
  const product = {
    handle: "ol-57-1",
    title: "Диван малый",
    metadata: {
      finish_color_executions: [
        {
          key: "lilian",
          label: "lilian",
          urls: ["/static/products/oliver/OL-57-1_color_lilian_01.jpg"],
        },
      ],
    },
  }
  const { report, metadata } = normalizeUpholsteryMetadata(product)
  assert.equal(
    (metadata.fabric_upholstery_executions as Array<{ key: string }>)[0]?.key,
    "lillian"
  )
  assert.equal(report.ownerMappingRequired, true)
}

{
  /* Finish colors must NOT globally become upholstery */
  const product = {
    handle: "co-02-1",
    title: "Шкаф для одежды 2-дв.",
    metadata: {
      finish_color_executions: [
        { key: "cream", label: "Кремовый", urls: ["/static/cream.jpg"] },
        { key: "blue", label: "Голубой", urls: ["/static/blue.jpg"] },
      ],
    },
  }
  const { metadata, report } = normalizeUpholsteryMetadata(product)
  assert.equal(metadata.fabric_upholstery_executions, undefined)
  assert.ok(Array.isArray(metadata.finish_color_executions) || metadata.finish_color_executions === undefined)
  assert.equal(hasSoftUpholsteryProductEvidence(product), false)
  assert.ok(
    report.actions.includes("NO_REPAIR_REQUIRED") ||
      !report.actions.includes("METADATA_REKEY_REQUIRED")
  )
}

{
  /* Soft evidence required — fabric token in finish on non-soft stays + owner mapping */
  const product = {
    handle: "co-14-2",
    title: "Тумба",
    metadata: {
      finish_color_executions: [
        { key: "lilian", label: "x", urls: ["/static/x.jpg"] },
        { key: "cream", label: "cream", urls: ["/static/c.jpg"] },
      ],
    },
  }
  const { metadata, report } = normalizeUpholsteryMetadata(product)
  assert.equal(metadata.fabric_upholstery_executions, undefined)
  assert.ok(report.actions.includes("OWNER_MAPPING_REQUIRED"))
}

{
  /* Furniture collection ≠ fabric family (taxonomy invariant via keys) */
  assert.notEqual("oliver", "lillian")
  assert.equal(isFabricFamilyKey("oliver"), false)
}

{
  /* Data-plan validator fail-closed */
  assert.equal(
    validateUpholsteryDataRepairRow({
      approved: true,
      ownerMappingStatus: "OWNER_MAPPING_REQUIRED",
      currentFingerprint: "a",
      liveFingerprint: "a",
      hasRollback: true,
    }).ok,
    false
  )
  assert.equal(
    validateUpholsteryDataRepairRow({
      approved: true,
      ownerMappingStatus: "resolved",
      currentFingerprint: "a",
      liveFingerprint: "b",
      hasRollback: true,
    }).reason,
    "stale_fingerprint"
  )
  assert.equal(
    validateUpholsteryDataRepairRow({
      approved: true,
      ownerMappingStatus: "resolved",
      currentFingerprint: "a",
      liveFingerprint: "a",
      hasRollback: true,
    }).ok,
    true
  )
}

{
  /* product clone helper */
  const product = {
    handle: "ol-56-1",
    title: "Кресло",
    metadata: {
      finish_color_executions: [
        { key: "lilian", label: "lillian", urls: ["/static/a.jpg"] },
      ],
    },
  }
  const { product: next } = productWithNormalizedUpholsteryMetadata(product)
  assert.notEqual(next.metadata, product.metadata)
  assert.ok(
    Array.isArray(
      (next.metadata as Record<string, unknown>).fabric_upholstery_executions
    )
  )
}

console.log("upholstery-color-normalization.fidelity.test.ts: PASS")
