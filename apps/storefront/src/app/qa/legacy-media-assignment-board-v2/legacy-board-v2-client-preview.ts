/**
 * v2-local client-side legacy media preview resolution.
 */

import {
  recoveryBadgeLabel,
  type LegacyMediaPreviewRecoveryEntry,
} from "./legacy-board-v2-preview-recovery-types"

export const LEGACY_MEDIA_QA_PREVIEW_ROUTE = "/qa/legacy-media-assignment-board/preview"

export function medusaStaticOrigin(): string {
  // Same-origin only — never emit public/local :9000 into QA client previews.
  // Kept as empty string for any caller that still concatenates `${origin}/…`.
  return ""
}

/** QA preview URL via storefront `/product-static` rewrite (not raw Medusa :9000). */
export function medusaProductStaticUrl(staticRelOrPath: string): string {
  const n = normPath(staticRelOrPath)
    .replace(/^apps\/backend\/static\//, "")
    .replace(/^static\//, "")
  return `/product-static/${n}`
}

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
  return medusaProductStaticUrl(staticRel)
}

function previewFromRepoRel(
  rel: string,
  inv?: LegacyBoardClientPreviewInput,
  recovered?: boolean,
  recoveryStatus?: string
): LegacyBoardClientPreview | null {
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
      url: medusaProductStaticUrl(primary),
      status: "backend_static_url",
      reason: null,
      recoveredPreview: recovered,
      recoveryBadge: recoveryStatus ? recoveryBadgeLabel(recoveryStatus) : null,
    }
  }

  if (primary.startsWith("data/") && inv?.previewable !== false && inv?.exists_locally !== false) {
    return {
      url: `${LEGACY_MEDIA_QA_PREVIEW_ROUTE}?rel=${encodeURIComponent(primary)}`,
      status: "local_proxy",
      reason: "Local repo proxy (inventory marks file on disk).",
      recoveredPreview: recovered,
      recoveryBadge: recoveryStatus ? recoveryBadgeLabel(recoveryStatus) : null,
    }
  }

  const medusaProducts = qaMedusaProductsStaticRel(primary)
  if (medusaProducts) {
    return {
      url: medusaProductStaticUrl(`static/${medusaProducts}`),
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
  const fromRel = previewFromRepoRel(rel, undefined, true, recovery.recovery_status)
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
    try {
      const u = new URL(inv.url)
      if (u.pathname.startsWith("/static/")) {
        return {
          url: `/product-static${u.pathname.slice("/static".length)}${u.search}${u.hash}`,
          status: "backend_static_url",
          reason: null,
        }
      }
    } catch {
      /* keep remote_http below */
    }
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
      url: medusaProductStaticUrl(primary),
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
    const fromHub = previewFromRepoRel(relHub, inv, false)
    if (fromHub?.url) return fromHub
    if (relHub.startsWith("data/") && inv.previewable === false) {
      return {
        url: null,
        status: "file_missing",
        reason: inv.preview_reason || "Allowlisted data/ path missing on disk (proxy 404).",
      }
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
