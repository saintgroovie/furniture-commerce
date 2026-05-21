"use client"

import { useState } from "react"
import type { InvItem } from "./legacy-board-v2-types"
import type { VisualRole } from "@/app/qa/legacy-media-assignment-board/legacy-media-visual-role-ranking"
import { VISUAL_ROLE_BADGE_RU } from "@/app/qa/legacy-media-assignment-board/legacy-media-visual-role-ranking"

// ---------------------------------------------------------------------------
// Client-safe preview URL builder (no fs — uses InvItem fields only)
// ---------------------------------------------------------------------------

const PREVIEW_PROXY = "/qa/legacy-media-assignment-board/preview"

type ClientPreview = {
  url: string | null
  status: string
  reason: string | null
}

function normPath(s: string): string {
  return s.trim().replace(/\\/g, "/").replace(/^\//, "")
}

function getMedusaOrigin(): string {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL) {
    return process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL.replace(/\/$/, "")
  }
  return "http://localhost:9000"
}

export function clientPreview(inv: InvItem): ClientPreview {
  // Direct URL field (http/https)
  if (inv.url && (inv.url.startsWith("http://") || inv.url.startsWith("https://"))) {
    return { url: inv.url, status: "remote_http", reason: null }
  }

  const rr = normPath(inv.repo_relative_path || "")
  const sp = normPath(inv.source_path || "")
  const primary = rr || sp

  if (!primary) {
    return { url: null, status: "no_source", reason: "Нет пути в inventory." }
  }

  if (primary.startsWith("http://") || primary.startsWith("https://")) {
    return { url: primary, status: "remote_http", reason: null }
  }

  const origin = getMedusaOrigin()

  // Backend static path — served by Medusa
  if (primary.startsWith("apps/backend/static/")) {
    const suffix = primary.slice("apps/backend/static/".length)
    return { url: `${origin}/static/${suffix}`, status: "backend_static_mapped", reason: null }
  }

  if (primary.startsWith("static/")) {
    return { url: `${origin}/${primary}`, status: "backend_static_url", reason: null }
  }

  // data/ paths — use proxy if file exists locally
  if (primary.startsWith("data/")) {
    if (inv.previewable) {
      return {
        url: `${PREVIEW_PROXY}?rel=${encodeURIComponent(primary)}`,
        status: "local_proxy",
        reason: null,
      }
    }
    if (inv.exists_locally === false) {
      return { url: null, status: "file_missing", reason: inv.preview_reason || "Файл не найден на диске." }
    }
    return { url: null, status: "unpreviewable", reason: inv.preview_reason || "Не previewable." }
  }

  // Yandex / external machine paths
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
      reason: "Yandex/внешний путь — локального бинаря нет в репо.",
    }
  }

  if (!inv.previewable) {
    return { url: null, status: "unpreviewable", reason: inv.preview_reason || "Не previewable." }
  }

  return { url: null, status: "unsupported", reason: "Нет подходящего правила превью." }
}

// ---------------------------------------------------------------------------
// Status icon + label map
// ---------------------------------------------------------------------------

const STATUS_ICON: Record<string, string> = {
  backend_static_mapped: "✓",
  backend_static_url: "✓",
  local_proxy: "✓",
  remote_http: "✓",
  file_missing: "⚠",
  unpreviewable_external_ref: "🔗",
  unpreviewable: "–",
  no_source: "✕",
  unsupported: "?",
}

const STATUS_LABEL_RU: Record<string, string> = {
  file_missing: "Файл не найден",
  unpreviewable_external_ref: "Внешний путь",
  repo_unresolved: "Корень репо не определён",
  no_source: "Нет пути",
  unpreviewable: "Не previewable",
  unsupported: "Нет правила превью",
}

const CONFIDENCE_COLOR: Record<string, string> = {
  confirmed: "#2d7a2d",
  high: "#2d7a2d",
  medium: "#8a6200",
  low: "#a33",
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Props = {
  inv: InvItem
  role: VisualRole
  confidence?: string
  identityConfidence?: string
  selectedHandle: string | null
  onSetMain?: (mediaId: string) => void
  onAddToGallery?: (mediaId: string) => void
  /** Compact list-row layout for non-previewable items (spans full grid width) */
  compact?: boolean
}

export function MediaCardV2({
  inv,
  role,
  confidence,
  selectedHandle: _selectedHandle,
  onSetMain,
  onAddToGallery,
  compact,
}: Props) {
  const [imgFailed, setImgFailed] = useState(false)

  const preview = clientPreview(inv)
  const showImg = preview.url !== null && !imgFailed
  const roleLabel = VISUAL_ROLE_BADGE_RU[role] ?? "?"
  const shortname = inv.filename.length > 30 ? inv.filename.slice(0, 27) + "…" : inv.filename
  const effectiveStatus = imgFailed ? "file_missing" : preview.status
  const effectiveReason = imgFailed ? "Файл не найден на диске (proxy 404)." : preview.reason

  function handleSetMain() {
    if (onSetMain) onSetMain(inv.id)
  }

  function handleAddToGallery() {
    if (onAddToGallery) onAddToGallery(inv.id)
  }

  // -------------------------------------------------------------------------
  // Compact list-row — for non-previewable items
  // spans full grid width so photo cards always align above in a clean 2-col grid
  // -------------------------------------------------------------------------
  if (compact) {
    return (
      <div style={styles.compactCard}>
        <span style={styles.compactIcon}>{STATUS_ICON[effectiveStatus] ?? "–"}</span>
        <div style={styles.compactText}>
          <span style={styles.compactFilename} title={inv.filename}>{shortname}</span>
          <span style={styles.compactMeta}>
            {STATUS_LABEL_RU[effectiveStatus] ?? effectiveStatus}
            {" · "}
            <span style={styles.compactRoleLabel}>{roleLabel}</span>
          </span>
        </div>
        <button style={styles.compactBtnMain} onClick={handleSetMain} title="★ Главное">★</button>
        <button style={styles.compactBtnGallery} onClick={handleAddToGallery} title="+ Галерея">+</button>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Full photo card — fixed image height eliminates the CSS Grid percentage
  // padding circular-dependency bug that collapsed cards to 32px.
  // Root cause: paddingBottom: "100%" inside a grid item resolves to 0 during
  // grid's intrinsic-size calculation pass, making the row height = footer only.
  // Fix: explicit height: 160px — no percentage, no circular dependency.
  // -------------------------------------------------------------------------
  return (
    <div style={styles.card}>
      {/* Image wrap — fixed 160px height, reliable in any grid/flex context */}
      <div style={styles.imageWrap}>
        {showImg ? (
          <img
            src={preview.url!}
            alt={inv.filename}
            style={styles.img}
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div style={styles.noPreview}>
            <span style={styles.statusIcon}>{STATUS_ICON[effectiveStatus] ?? "?"}</span>
            <span style={styles.statusText}>{STATUS_LABEL_RU[effectiveStatus] ?? effectiveStatus}</span>
            {effectiveReason && (
              <span style={styles.noPreviewReason}>{effectiveReason}</span>
            )}
          </div>
        )}
        {/* Role badge — bottom-left overlay */}
        <span style={styles.roleBadgeOverlay}>{roleLabel}</span>
        {/* Confidence badge — top-right overlay, compact (icon only for confirmed) */}
        {confidence && (
          <span
            style={{
              ...styles.confBadgeOverlay,
              background: CONFIDENCE_COLOR[confidence] ?? "#888",
            }}
          >
            {confidence === "confirmed" ? "✓" : confidence}
          </span>
        )}
      </div>

      {/* Footer: filename + primary actions */}
      <div style={styles.footer}>
        <div style={styles.filename} title={inv.filename}>{shortname}</div>
        <div style={styles.primaryActions}>
          <button style={styles.btnMain} onClick={handleSetMain}>★ Главное</button>
          <button style={styles.btnGallery} onClick={handleAddToGallery}>+ Галерея</button>
        </div>
      </div>
    </div>
  )
}

const styles = {
  // ---------------------------------------------------------------------------
  // Full photo card
  // ---------------------------------------------------------------------------
  card: {
    display: "flex",
    flexDirection: "column" as const,
    border: "1px solid #e0e0e0",
    borderRadius: "6px",
    background: "#fff",
    overflow: "hidden",
    fontSize: "12px",
  },
  imageWrap: {
    // Fixed pixel height — avoids the CSS Grid intrinsic-size calculation issue
    // where paddingBottom: "100%" resolves to 0 during row-height pass, collapsing
    // the card to footer-only height and clipping the image behind overflow:hidden.
    position: "relative" as const,
    width: "100%",
    height: "160px",
    background: "#f0f0f0",
    overflow: "hidden",
    flexShrink: 0,
  },
  img: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain" as const,
    display: "block",
  },
  noPreview: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
    padding: "10px",
    textAlign: "center" as const,
  },
  statusIcon: {
    fontSize: "20px",
    lineHeight: 1,
    color: "#d0d0d0",
  },
  statusText: {
    fontSize: "10px",
    color: "#c0c0c0",
    fontWeight: 500,
  },
  noPreviewReason: {
    fontSize: "9px",
    color: "#ccc",
    lineHeight: 1.3,
  },
  roleBadgeOverlay: {
    position: "absolute" as const,
    bottom: "5px",
    left: "5px",
    background: "rgba(26,58,110,0.82)",
    color: "#fff",
    borderRadius: "3px",
    padding: "1px 5px",
    fontSize: "9px",
    fontWeight: 700,
    letterSpacing: "0.02em",
    backdropFilter: "blur(2px)",
  },
  confBadgeOverlay: {
    position: "absolute" as const,
    top: "5px",
    right: "5px",
    color: "#fff",
    borderRadius: "3px",
    padding: "2px 5px",
    fontSize: "9px",
    fontWeight: 700,
  },
  footer: {
    padding: "5px 7px 7px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "5px",
    background: "#fff",
    flexShrink: 0,
  },
  filename: {
    fontSize: "10px",
    color: "#666",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    lineHeight: 1.3,
  },
  primaryActions: {
    display: "flex",
    gap: "4px",
  },
  btnMain: {
    flex: 1,
    padding: "5px 0",
    fontSize: "11px",
    border: "1px solid #aacaff",
    borderRadius: "4px",
    background: "#e8f0ff",
    color: "#1a3a6e",
    cursor: "pointer",
    fontWeight: 700,
    textAlign: "center" as const,
    lineHeight: 1.2,
  },
  btnGallery: {
    flex: 1,
    padding: "5px 0",
    fontSize: "11px",
    border: "1px solid #c8e6c9",
    borderRadius: "4px",
    background: "#f0fff0",
    color: "#1b5e20",
    cursor: "pointer",
    fontWeight: 600,
    textAlign: "center" as const,
    lineHeight: 1.2,
  },

  // ---------------------------------------------------------------------------
  // Compact list-row for non-previewable items
  // gridColumn: "1 / -1" makes this span both columns in the 2-col photo grid
  // ---------------------------------------------------------------------------
  compactCard: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 10px",
    border: "1px solid #f0f0f0",
    borderRadius: "4px",
    background: "#fafafa",
    gridColumn: "1 / -1" as const,
    minHeight: "36px",
  },
  compactIcon: {
    fontSize: "14px",
    color: "#d0d0d0",
    flexShrink: 0,
    width: "18px",
    textAlign: "center" as const,
  },
  compactText: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "1px",
    flex: 1,
    overflow: "hidden",
    minWidth: 0,
  },
  compactFilename: {
    fontSize: "11px",
    color: "#999",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    lineHeight: 1.3,
  },
  compactMeta: {
    fontSize: "9px",
    color: "#ccc",
    lineHeight: 1.2,
  },
  compactRoleLabel: {
    color: "#bbb",
  },
  compactBtnMain: {
    padding: "3px 8px",
    fontSize: "13px",
    border: "1px solid #ddd",
    borderRadius: "3px",
    background: "#f5f5f5",
    color: "#aaa",
    cursor: "pointer",
    flexShrink: 0,
    lineHeight: 1,
  },
  compactBtnGallery: {
    padding: "3px 8px",
    fontSize: "13px",
    border: "1px solid #ddd",
    borderRadius: "3px",
    background: "#f5f5f5",
    color: "#aaa",
    cursor: "pointer",
    flexShrink: 0,
    lineHeight: 1,
  },
} as const
