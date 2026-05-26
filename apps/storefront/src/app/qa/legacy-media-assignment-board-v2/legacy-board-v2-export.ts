/**
 * Export utilities for v2 board — builds copy-ready JSON for operator decisions.
 *
 * QA-only: local_dev_only = true, production_rollout = false.
 * Never writes to Medusa or catalog.
 */

import type { V2ProductState, V2OperatorVariantEdits } from "./legacy-board-v2-types"
import type { InvItem, ProductRow } from "./legacy-board-v2-types"
import { clientPreview } from "./MediaCardV2"
import {
  buildOperatorVariantEditsExport,
  getExportableVariantKeys,
  isVariantHidden,
} from "./legacy-board-v2-color-variants"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type V2ExportMediaRef = {
  id: string
  filename: string
  source_path: string
  preview_status: string
}

export type V2ExportVariant = {
  main: V2ExportMediaRef | null
  gallery: V2ExportMediaRef[]
  /** Explicit operator slot assignments beyond main (optional, informational only — not used by apply) */
  role_assignments?: Record<string, V2ExportMediaRef>
  /** Operator display label for this color variant (optional — apply may ignore) */
  operator_variant_label?: string
}

export type V2ExportProduct = {
  handle: string
  title: string | null
  collection: string | null
  variants: Record<string, V2ExportVariant>
  /** Operator role overrides: mediaId → role label (optional, informational only) */
  operator_role_overrides?: Record<string, string>
  /** Operator add/remove/hide color tabs (optional — apply may ignore) */
  operator_variant_edits?: V2OperatorVariantEdits
}

export type V2ExportJSON = {
  version: "1"
  exported_at: string
  review_meta: {
    scope: "legacy_media_assignment_board"
    board_version: "v2board"
    local_dev_only: true
    production_rollout: false
  }
  summary: {
    products_with_assignments: number
    total_main_assignments: number
    total_gallery_items: number
  }
  assignments: Record<string, V2ExportProduct>
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function makeMediaRef(id: string, invById: Map<string, InvItem>): V2ExportMediaRef {
  const inv = invById.get(id)
  if (!inv) {
    return { id, filename: id, source_path: "", preview_status: "not_in_inventory" }
  }
  const preview = clientPreview(inv)
  return {
    id,
    filename: inv.filename,
    source_path: inv.source_path ?? "",
    preview_status: preview.status,
  }
}

/** True when at least one product has exportable role or gallery data. */
export function hasAnyV2Assignments(productStates: Record<string, V2ProductState>): boolean {
  for (const state of Object.values(productStates)) {
    const hasRoles = Object.values(state.rolesByVariant).some((roles) =>
      Object.values(roles).some((v) => !!v)
    )
    if (hasRoles) return true
    const hasGallery = Object.values(state.galleriesByVariant).some((g) => g.length > 0)
    if (hasGallery) return true
  }
  return false
}

export function getV2ExportDisabledReason(
  productStates: Record<string, V2ProductState>,
  selectedHandle: string | null
): string | null {
  if (hasAnyV2Assignments(productStates)) return null
  if (!selectedHandle) return "Выберите продукт и назначьте роли или галерею"
  if (!productStates[selectedHandle]) {
    return "Нет сохранённых назначений для этого продукта"
  }
  return "Нет назначений для экспорта — заполните главное или слоты ролей"
}

export function buildV2ExportJSON(
  productStates: Record<string, V2ProductState>,
  invById: Map<string, InvItem>,
  products: ProductRow[]
): V2ExportJSON {
  const productMeta = new Map(products.map((p) => [p.handle, p]))

  let totalMain = 0
  let totalGallery = 0
  const assignments: Record<string, V2ExportProduct> = {}

  for (const [handle, state] of Object.entries(productStates)) {
    const hasAny =
      Object.values(state.rolesByVariant).some((roles) =>
        Object.values(roles).some((v) => !!v)
      ) || Object.values(state.galleriesByVariant).some((g) => g.length > 0)
    if (!hasAny) continue

    const meta = productMeta.get(handle)
    const variants: Record<string, V2ExportVariant> = {}

    // Collect all variant keys that have any data (roles OR gallery-only).
    // Iterating only rolesByVariant would miss gallery-only assignments.
    const allVariantKeys = getExportableVariantKeys(state)

    for (const variantKey of allVariantKeys) {
      if (isVariantHidden(state, variantKey)) continue
      const roles = state.rolesByVariant[variantKey] ?? {}
      const mainId = (roles.main as string | null | undefined) ?? null
      const galleryIds = state.galleriesByVariant[variantKey] ?? []

      if (!mainId && galleryIds.length === 0) continue

      if (mainId) totalMain++
      totalGallery += galleryIds.length

      // Collect non-main explicit role assignments
      const roleAssignments: Record<string, V2ExportMediaRef> = {}
      for (const [slot, mediaId] of Object.entries(roles)) {
        if (slot === "main" || !mediaId) continue
        roleAssignments[slot] = makeMediaRef(mediaId as string, invById)
      }

      const variant: V2ExportVariant = {
        main: mainId ? makeMediaRef(mainId, invById) : null,
        gallery: galleryIds.map((id) => makeMediaRef(id, invById)),
      }
      if (Object.keys(roleAssignments).length > 0) {
        variant.role_assignments = roleAssignments
      }
      const operatorLabel = state.variantLabelOverrides?.[variantKey]
      if (operatorLabel) {
        variant.operator_variant_label = operatorLabel
      }
      variants[variantKey] = variant
    }

    if (Object.keys(variants).length > 0) {
      const productEntry: V2ExportProduct = {
        handle,
        title: meta?.title ?? null,
        collection: meta?.collection ?? null,
        variants,
      }
      // Include operator role overrides if any
      const overrides = state.roleOverrides
      if (overrides && Object.keys(overrides).length > 0) {
        productEntry.operator_role_overrides = overrides
      }
      const variantEdits = buildOperatorVariantEditsExport(state)
      if (variantEdits) {
        productEntry.operator_variant_edits = variantEdits
      }
      assignments[handle] = productEntry
    }
  }

  return {
    version: "1",
    exported_at: new Date().toISOString(),
    review_meta: {
      scope: "legacy_media_assignment_board",
      board_version: "v2board",
      local_dev_only: true,
      production_rollout: false,
    },
    summary: {
      products_with_assignments: Object.keys(assignments).length,
      total_main_assignments: totalMain,
      total_gallery_items: totalGallery,
    },
    assignments,
  }
}

// ---------------------------------------------------------------------------
// Copy to clipboard
// ---------------------------------------------------------------------------

/**
 * Copy the export JSON to clipboard.
 * Returns true on success, false if clipboard API unavailable.
 */
export async function copyV2ExportToClipboard(
  productStates: Record<string, V2ProductState>,
  invById: Map<string, InvItem>,
  products: ProductRow[]
): Promise<boolean> {
  const json = buildV2ExportJSON(productStates, invById, products)
  const text = JSON.stringify(json, null, 2)
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Clipboard API may be restricted in non-secure contexts
    return false
  }
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

/**
 * Trigger a browser download of the export JSON.
 * Filename: legacy-media-board-v2-export-YYYYMMDD-HHMM.json
 */
export function downloadV2ExportJSON(
  productStates: Record<string, V2ProductState>,
  invById: Map<string, InvItem>,
  products: ProductRow[]
): void {
  const json = buildV2ExportJSON(productStates, invById, products)
  const text = JSON.stringify(json, null, 2)
  const blob = new Blob([text], { type: "application/json" })
  const url = URL.createObjectURL(blob)

  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
  const filename = `legacy-media-board-v2-export-${stamp}.json`

  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
