/**
 * Shared client-side legacy media preview resolution (v1 + v2 boards).
 * Mirrors server rules in legacy-media-assignment-preview.ts where possible.
 */

import {
  LEGACY_MEDIA_QA_PREVIEW_ROUTE,
  medusaStaticOrigin,
} from "@/lib/qa/legacy-media-board-preview-constants"
import {
  recoveryBadgeLabel,
  type LegacyMediaPreviewRecoveryEntry,
} from "@/lib/qa/legacy-media-preview-recovery-types"

export type LegacyBoardClientPreviewInput = {
  id?: string
  url?: string | null
  source_path?: string | null
  repo_relative_path?: string | null
  filename?: string
  exists_locally?: boolean | null
  previewable?: boolean | null
  preview_reason?: string | null
}

export type LegacyBoardClientPreview = {
  url: string | null
  status: string
  reason: string | null
  recoveredPreview?: boolean
  recoveryBadge?: string | null
}

const TRUSTED_PREVIEW_STATUSES = new Set([
  "backend_static_mapped",
  "backend_static_url",
  "remote_http",
  "qa_medusa_static_fallback",
  "recovered_backend_static",
  "recovered_exact",
  "recovered_basename",
  "recovered_variant_basename",
  "recovered_pdf_extract",
  "recovered_duplicate_group",
])

function normPath(s: string): string {
  return s.trim().replace(/\\/g, "/").replace(/^\//, "")
}

function stripDockerAppDataPrefix(p: string): string {
  if (p.startsWith("/app/data/")) return p.slice("/app/".length)
  return p
}

/** QA-only: map data/raw|processed collection paths → Medusa /static/products/… */
export function qaMedusaProductsStaticRel(dataRel: string): string | null {
  const n = normPath(dataRel)
  const m = n.match(
    /^data\/(?:raw\/downloaded-assets|processed\/storefront-assets)\/([^/]+)\/([^/]+)$/i
  )
  if (!m) return null
  return `products/${m[1]}/${m[2]}`
}

function medusaStaticUrlFromRel(staticRel: string): string {
  const suffix = normPath(staticRel).replace(/^apps\/backend\/static\//, "")
  return `${medusaStaticOrigin()}/static/${suffix}`
}

function previewFromRepoRel(rel: string, recovered?: boolean, recoveryStatus?: string): LegacyBoardClientPreview | null {
  const primary = normPath(rel)
  if (!primary) return null

  if (primary.startsWith("apps/backend/static/")) {
    return {
      url: medusaStaticUrlFromRel(primary),
      status: recovered ? "recovered_backend_static" : "backend_static_mapped",
      reason: null,
      recoveredPreview: recovered,
      recoveryBadge: recoveryStatus ? recoveryBadgeLabel(recoveryStatus) : null,
    }
  }

  if (primary.startsWith("static/")) {
    return {
      url: `${medusaStaticOrigin()}/${primary}`,
      status: "backend_static_url",
      reason: null,
      recoveredPreview: recovered,
      recoveryBadge: recoveryStatus ? recoveryBadgeLabel(recoveryStatus) : null,
    }
  }

  const medusaProducts = qaMedusaProductsStaticRel(primary)
  if (medusaProducts) {
    return {
      url: `${medusaStaticOrigin()}/static/${medusaProducts}`,
      status: recovered ? "recovered_backend_static" : "qa_medusa_static_fallback",
      reason: recovered
        ? null
        : "QA fallback: Medusa static products mirror for data/ path (local proxy may 404).",
      recoveredPreview: recovered,
      recoveryBadge: recoveryStatus ? recoveryBadgeLabel(recoveryStatus) : null,
    }
  }

  if (primary.startsWith("data/")) {
    return {
      url: `${LEGACY_MEDIA_QA_PREVIEW_ROUTE}?rel=${encodeURIComponent(primary)}`,
      status: "local_proxy",
      reason: "Local repo proxy (requires file on disk).",
      recoveredPreview: recovered,
      recoveryBadge: recoveryStatus ? recoveryBadgeLabel(recoveryStatus) : null,
    }
  }

  return null
}

function resolveRecoveryPreview(recovery: LegacyMediaPreviewRecoveryEntry): LegacyBoardClientPreview | null {
  const rel = normPath(recovery.found_path)
  if (!rel) return null
  const fromRel = previewFromRepoRel(rel, true, recovery.recovery_status)
  if (fromRel?.url) return fromRel
  return null
}

/**
 * Resolve preview URL for QA boards (no fs — recovery + Medusa static fallback).
 */
export function resolveLegacyBoardClientPreview(
  inv: LegacyBoardClientPreviewInput,
  recovery?: LegacyMediaPreviewRecoveryEntry | null
): LegacyBoardClientPreview {
  if (inv.url && (inv.url.startsWith("http://") || inv.url.startsWith("https://"))) {
    return { url: inv.url, status: "remote_http", reason: null }
  }

  const rr0 = normPath(inv.repo_relative_path || "")
  const spo0 = normPath(inv.source_path || "")
  const rr = stripDockerAppDataPrefix(rr0)
  const spo = stripDockerAppDataPrefix(spo0)
  const primary = rr || spo

  if (!primary) {
    return { url: null, status: "no_source", reason: "Нет пути в inventory." }
  }

  if (primary.startsWith("http://") || primary.startsWith("https://")) {
    return { url: primary, status: "remote_http", reason: null }
  }

  if (primary.startsWith("/static/")) {
    return {
      url: `${medusaStaticOrigin()}${primary}`,
      status: "backend_static_url",
      reason: null,
    }
  }

  const relHub =
    rr.startsWith("data/") || rr.startsWith("apps/")
      ? rr
      : spo.startsWith("data/") || spo.startsWith("apps/")
        ? spo
        : ""

  if (recovery?.found_path) {
    const recovered = resolveRecoveryPreview(recovery)
    if (recovered?.url) return recovered
  }

  if (relHub) {
    const fromHub = previewFromRepoRel(relHub, false)
    if (fromHub?.url) {
      if (fromHub.status === "qa_medusa_static_fallback" || fromHub.status === "backend_static_mapped") {
        return fromHub
      }
      if (fromHub.status === "local_proxy") {
        const medusaAlt = qaMedusaProductsStaticRel(relHub)
        if (medusaAlt) {
          return {
            url: `${medusaStaticOrigin()}/static/${medusaAlt}`,
            status: "qa_medusa_static_fallback",
            reason: "QA fallback: prefer Medusa static over missing local data/ file.",
          }
        }
        if (inv.previewable !== false) return fromHub
        return {
          url: null,
          status: "file_missing",
          reason: inv.preview_reason || "Allowlisted data/ path missing on disk (proxy 404).",
        }
      }
      return fromHub
    }
  }

  const rawSp = inv.source_path || ""
  if (
    rawSp.startsWith("/WOODRIGHT") ||
    rawSp.startsWith("/Users") ||
    rawSp.startsWith("/Volumes") ||
    rawSp.startsWith("/Yandex")
  ) {
    return {
      url: null,
      status: "unpreviewable_external_ref",
      reason: "Внешний путь — локального бинаря нет в репо.",
    }
  }

  if (inv.previewable === false || inv.exists_locally === false) {
    if (recovery?.found_path) {
      const recovered = resolveRecoveryPreview(recovery)
      if (recovered?.url) return recovered
    }
    return {
      url: null,
      status: "unpreviewable",
      reason: inv.preview_reason || "Не previewable.",
    }
  }

  return {
    url: null,
    status: "unsupported",
    reason: "Нет подходящего правила превью.",
  }
}

export function isLegacyBoardClientPreviewable(
  inv: LegacyBoardClientPreviewInput,
  recovery?: LegacyMediaPreviewRecoveryEntry | null
): boolean {
  const preview = resolveLegacyBoardClientPreview(inv, recovery)
  if (!preview.url) return false
  if (TRUSTED_PREVIEW_STATUSES.has(preview.status)) return true
  if (preview.status === "local_proxy") {
    return inv.previewable === true && inv.exists_locally === true
  }
  return false
}
