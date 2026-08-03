/**
 * PASS B — canonical upholstery / color normalization (read-model + data-plan helpers).
 *
 * Does not write to the database. Presentation must not invent colors or treat
 * fabric-family names as furniture collections / finish colors.
 *
 * Canonical fabric-family *storage* key: `lillian` (via normalizeOliverFabricKey).
 * Canonical buyer-facing family label for that key: `Lilian` (project FABRIC_LABELS).
 */

import { normalizeOliverFabricKey } from "./oliver-static-url"

export type ColorExecution = {
  key: string
  label: string
  urls: string[]
  swatch_hex?: string
}

/** Fabric *collection* / family keys — not individual upholstery colors. */
export const FABRIC_FAMILY_KEYS = new Set([
  "leona",
  "lillian",
  "linda",
  "lorna",
  "torno",
  "lilian", // alias input only; normalize to lillian
])

/** Project display labels for fabric families (storage key → label). */
export const FABRIC_FAMILY_DISPLAY_LABELS: Record<string, string> = {
  leona: "Leona",
  lillian: "Lilian",
  linda: "Linda",
  lorna: "Lorna",
  torno: "Торно",
}

const SOFT_TITLE_RE =
  /кровать|банкет|стул|кресл|диван|пуф|кушет|сундук|панел|sofa|chair|bed|bench|pouf/i

const SOFT_TYPE_RE =
  /(krovat|banket|stul|kresl|divan|sofa|puf|kushet|sunduk|panel)/i

export type UpholsteryNormalizationAction =
  | "CODE_NORMALIZATION_ONLY"
  | "METADATA_REKEY_REQUIRED"
  | "METADATA_VALUE_NORMALIZATION_REQUIRED"
  | "OWNER_MAPPING_REQUIRED"
  | "GALLERY_MEDIA_ONLY_NO_SWATCH_AVAILABLE"
  | "NO_REPAIR_REQUIRED"

export type UpholsteryNormalizationReport = {
  handle: string
  softProductEvidence: boolean
  changed: boolean
  ownerMappingRequired: boolean
  actions: UpholsteryNormalizationAction[]
  fabricKeysBefore: string[]
  fabricKeysAfter: string[]
  finishKeysBefore: string[]
  finishKeysAfter: string[]
  movedFinishFamilyKeys: string[]
  notes: string[]
}

function asExecArray(raw: unknown): ColorExecution[] {
  if (!Array.isArray(raw)) return []
  const out: ColorExecution[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue
    const o = entry as Record<string, unknown>
    const key = typeof o.key === "string" ? o.key.trim() : ""
    const label = typeof o.label === "string" ? o.label.trim() : ""
    const urls = Array.isArray(o.urls)
      ? o.urls.filter((u): u is string => typeof u === "string" && u.trim().length > 0)
      : []
    if (!key) continue
    const row: ColorExecution = {
      key,
      label: label || key,
      urls,
    }
    if (typeof o.swatch_hex === "string" && o.swatch_hex.trim()) {
      row.swatch_hex = o.swatch_hex.trim()
    }
    out.push(row)
  }
  return out
}

export function isFabricFamilyKey(key: string): boolean {
  return FABRIC_FAMILY_KEYS.has(key.trim().toLowerCase())
}

export function canonicalizeFabricFamilyKey(key: string): string {
  return normalizeOliverFabricKey(key.trim().toLowerCase())
}

export function fabricFamilyDisplayLabel(key: string): string {
  const canon = canonicalizeFabricFamilyKey(key)
  return FABRIC_FAMILY_DISPLAY_LABELS[canon] ?? key
}

export function hasSoftUpholsteryProductEvidence(
  product: Record<string, unknown>
): boolean {
  const meta = (product.metadata as Record<string, unknown> | undefined) ?? {}
  const fabric = asExecArray(
    meta.fabric_upholstery_executions ?? meta.upholstery_color_executions
  )
  if (fabric.length > 0) return true

  const title = String(product.title ?? "")
  if (SOFT_TITLE_RE.test(title)) return true

  const buyerType = String(meta.buyer_item_type ?? "")
  if (SOFT_TYPE_RE.test(buyerType)) return true

  return false
}

function normalizeExecutionList(
  rows: ColorExecution[],
  opts: { preferFamilyDisplayLabels: boolean }
): ColorExecution[] {
  const byKey = new Map<string, ColorExecution>()
  for (const row of rows) {
    const canon = isFabricFamilyKey(row.key)
      ? canonicalizeFabricFamilyKey(row.key)
      : row.key.trim().toLowerCase()
    const label =
      opts.preferFamilyDisplayLabels && isFabricFamilyKey(canon)
        ? fabricFamilyDisplayLabel(canon)
        : row.label.trim() || fabricFamilyDisplayLabel(canon)
    const prev = byKey.get(canon)
    if (!prev) {
      byKey.set(canon, {
        key: canon,
        label,
        urls: [...row.urls],
        ...(row.swatch_hex ? { swatch_hex: row.swatch_hex } : {}),
      })
      continue
    }
    const urls = [...prev.urls]
    for (const u of row.urls) {
      if (!urls.includes(u)) urls.push(u)
    }
    byKey.set(canon, {
      ...prev,
      label: prev.label || label,
      urls,
      swatch_hex: prev.swatch_hex ?? row.swatch_hex,
    })
  }
  return [...byKey.values()]
}

/**
 * Pure metadata normalization for selector / data-plan use.
 * Never invents colors. Moves fabric-family keys out of finish only when
 * soft-product evidence is present.
 */
export function normalizeUpholsteryMetadata(
  product: Record<string, unknown>
): {
  metadata: Record<string, unknown>
  report: UpholsteryNormalizationReport
} {
  const handle =
    typeof product.handle === "string" ? product.handle.toLowerCase() : ""
  const sourceMeta = {
    ...((product.metadata as Record<string, unknown> | undefined) ?? {}),
  }
  const soft = hasSoftUpholsteryProductEvidence(product)
  const notes: string[] = []
  const actions: UpholsteryNormalizationAction[] = []

  const fabricBefore = asExecArray(
    sourceMeta.fabric_upholstery_executions ?? sourceMeta.upholstery_color_executions
  )
  const finishBefore = asExecArray(
    sourceMeta.finish_color_executions ?? sourceMeta.paint_finish_executions
  )

  let fabric = normalizeExecutionList(fabricBefore, {
    preferFamilyDisplayLabels: true,
  })
  let finish = normalizeExecutionList(finishBefore, {
    preferFamilyDisplayLabels: false,
  })

  const moved: string[] = []
  if (soft) {
    const keepFinish: ColorExecution[] = []
    for (const row of finish) {
      if (isFabricFamilyKey(row.key)) {
        moved.push(row.key)
        const existing = fabric.find((f) => f.key === row.key)
        if (existing) {
          for (const u of row.urls) {
            if (!existing.urls.includes(u)) existing.urls.push(u)
          }
        } else {
          fabric.push({
            key: row.key,
            label: fabricFamilyDisplayLabel(row.key),
            urls: [...row.urls],
            ...(row.swatch_hex ? { swatch_hex: row.swatch_hex } : {}),
          })
        }
      } else {
        keepFinish.push(row)
      }
    }
    finish = keepFinish
    if (moved.length) {
      actions.push("METADATA_REKEY_REQUIRED")
      notes.push(
        `Moved fabric-family finish keys to fabric_upholstery_executions: ${moved.join(",")}`
      )
    }
  } else if (finish.some((r) => isFabricFamilyKey(r.key))) {
    actions.push("OWNER_MAPPING_REQUIRED")
    notes.push(
      "Finish contains fabric-family keys without soft-product evidence — left untouched"
    )
  }

  fabric = normalizeExecutionList(fabric, { preferFamilyDisplayLabels: true })

  const familyOnly =
    fabric.length > 0 && fabric.every((r) => isFabricFamilyKey(r.key))
  if (familyOnly && fabric.length === 1) {
    actions.push("OWNER_MAPPING_REQUIRED")
    actions.push("GALLERY_MEDIA_ONLY_NO_SWATCH_AVAILABLE")
    notes.push(
      "Single fabric-family execution only — individual upholstery colors not evidenced"
    )
  } else if (familyOnly && fabric.length >= 2) {
    actions.push("CODE_NORMALIZATION_ONLY")
    actions.push("METADATA_VALUE_NORMALIZATION_REQUIRED")
    notes.push(
      "Multiple fabric families present — card PASS A containment; PDP PASS B.1 single Обивка axis (no per-family sections)"
    )
  } else if (fabric.length === 0 && soft && finishBefore.length === 0) {
    actions.push("OWNER_MAPPING_REQUIRED")
    actions.push("GALLERY_MEDIA_ONLY_NO_SWATCH_AVAILABLE")
    notes.push("Soft product without fabric/finish executions")
  } else if (!actions.length) {
    actions.push("NO_REPAIR_REQUIRED")
  }

  const metaOut: Record<string, unknown> = { ...sourceMeta }
  const fabricKeysBefore = fabricBefore.map((r) => r.key)
  const finishKeysBefore = finishBefore.map((r) => r.key)

  const fabricBeforeNormKeys = fabricBefore.map((r) =>
    isFabricFamilyKey(r.key) ? canonicalizeFabricFamilyKey(r.key) : r.key.trim().toLowerCase()
  )
  const fabricAfterKeys = fabric.map((r) => r.key)
  const fabricKeyOrderChanged =
    JSON.stringify(fabricAfterKeys) !== JSON.stringify(fabricBeforeNormKeys) ||
    fabricBefore.some((r) => r.key.trim().toLowerCase() !== canonicalizeFabricFamilyKey(r.key) && isFabricFamilyKey(r.key)) ||
    fabricBefore.some(
      (r) =>
        isFabricFamilyKey(r.key) &&
        r.label.trim() !== fabricFamilyDisplayLabel(r.key)
    )

  const fabricChanged = fabricKeyOrderChanged || moved.length > 0

  if (fabric.length > 0) {
    metaOut.fabric_upholstery_executions = fabric
    const labels: Record<string, string> = {}
    for (const row of fabric) labels[row.key] = row.label
    metaOut.fabric_upholstery_labels = labels
  }

  if (moved.length || finish.length !== finishBefore.length) {
    if (finish.length > 0) metaOut.finish_color_executions = finish
    else metaOut.finish_color_executions = null
  } else if (finishBefore.length > 0) {
    const normalizedFinishOnly = normalizeExecutionList(finishBefore, {
      preferFamilyDisplayLabels: false,
    })
    const finishKeysChanged =
      JSON.stringify(normalizedFinishOnly.map((r) => r.key)) !==
      JSON.stringify(finishBefore.map((r) => r.key.trim().toLowerCase()))
    if (finishKeysChanged) {
      metaOut.finish_color_executions = normalizedFinishOnly
    }
  }

  // Spelling-only fabric key fix without move
  if (
    fabricBefore.some((r) => r.key.toLowerCase() === "lilian") ||
    finishBefore.some((r) => r.key.toLowerCase() === "lilian")
  ) {
    if (!actions.includes("METADATA_VALUE_NORMALIZATION_REQUIRED")) {
      actions.push("METADATA_VALUE_NORMALIZATION_REQUIRED")
    }
    notes.push("Canonical storage key for Lilian family is `lillian` (alias `lilian`)")
  }

  const changed =
    fabricChanged ||
    moved.length > 0 ||
    Boolean(metaOut.finish_color_executions !== sourceMeta.finish_color_executions && moved.length)

  const report: UpholsteryNormalizationReport = {
    handle,
    softProductEvidence: soft,
    changed,
    ownerMappingRequired: actions.includes("OWNER_MAPPING_REQUIRED"),
    actions: [...new Set(actions)],
    fabricKeysBefore,
    fabricKeysAfter: fabric.map((r) => r.key),
    finishKeysBefore,
    finishKeysAfter: finish.map((r) => r.key),
    movedFinishFamilyKeys: moved,
    notes,
  }

  return { metadata: metaOut, report }
}

/** Clone product with normalized metadata for selector building (no DB write). */
export function productWithNormalizedUpholsteryMetadata(
  product: Record<string, unknown>
): {
  product: Record<string, unknown>
  report: UpholsteryNormalizationReport
} {
  const { metadata, report } = normalizeUpholsteryMetadata(product)
  return {
    product: { ...product, metadata },
    report,
  }
}

/**
 * Static validator for a proposed metadata mutation row.
 * Fail-closed when fingerprints drift or owner mapping is still required.
 */
export function validateUpholsteryDataRepairRow(row: {
  approved: boolean
  ownerMappingStatus: "resolved" | "OWNER_MAPPING_REQUIRED" | "unresolved"
  currentFingerprint: string
  liveFingerprint: string
  hasRollback: boolean
}): { ok: boolean; reason?: string } {
  if (!row.approved) return { ok: false, reason: "not_approved" }
  if (row.ownerMappingStatus === "OWNER_MAPPING_REQUIRED") {
    return { ok: false, reason: "owner_mapping_required" }
  }
  if (row.ownerMappingStatus === "unresolved") {
    return { ok: false, reason: "unresolved" }
  }
  if (row.currentFingerprint !== row.liveFingerprint) {
    return { ok: false, reason: "stale_fingerprint" }
  }
  if (!row.hasRollback) return { ok: false, reason: "missing_rollback" }
  return { ok: true }
}
