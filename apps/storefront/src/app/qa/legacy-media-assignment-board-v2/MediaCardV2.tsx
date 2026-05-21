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
  unpreviewable_external_ref: "Yandex/внешний путь",
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
}

export function MediaCardV2({ inv, role, confidence, selectedHandle, onSetMain, onAddToGallery }: Props) {
  const [imgFailed, setImgFailed] = useState(false)

  const preview = clientPreview(inv)
  const showImg = preview.url !== null && !imgFailed
  const roleLabel = VISUAL_ROLE_BADGE_RU[role] ?? "?"
  const shortname = inv.filename.length > 28 ? inv.filename.slice(0, 25) + "…" : inv.filename
  const confColor = confidence ? (CONFIDENCE_COLOR[confidence] ?? "#666") : "#999"

  const effectiveStatus = imgFailed ? "file_missing" : preview.status
  const effectiveReason = imgFailed ? "Файл не найден на диске (proxy 404)." : preview.reason

  function handleSetMain() {
    if (onSetMain) onSetMain(inv.id)
    else console.log("[v2 board] Главное (no-op)", { id: inv.id, handle: selectedHandle, role })
  }

  function handleAddToGallery() {
    if (onAddToGallery) onAddToGallery(inv.id)
    else console.log("[v2 board] В галерею (no-op)", { id: inv.id, handle: selectedHandle, role })
  }

  return (
    <div style={styles.card}>
      {/*
        Preview area — padding-bottom: 100% trick guarantees a 1:1 square
        regardless of child content (absolute children don't influence height).
        This is more reliable than aspect-ratio on block/flex elements in all
        Chromium layout contexts.
      */}
      <div style={styles.previewSizer}>
        <div style={styles.previewArea}>
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
          {/* Role badge overlaid on image */}
          <span style={styles.roleBadgeOverlay}>{roleLabel}</span>
          {confidence && (
            <span
              style={{
                ...styles.confBadgeOverlay,
                background:
                  confidence === "confirmed" || confidence === "high"
                    ? "#2d7a2d"
                    : confidence === "medium"
                      ? "#8a6200"
                      : "#a33",
              }}
            >
              {confidence}
            </span>
          )}
        </div>
      </div>

      {/* Compact footer */}
      <div style={styles.footer}>
        <div style={styles.filename} title={inv.filename}>{shortname}</div>

        {/* Primary actions */}
        <div style={styles.primaryActions}>
          <button style={styles.btnMain} onClick={handleSetMain}>★ Главное</button>
          <button style={styles.btnGallery} onClick={handleAddToGallery}>+ Галерея</button>
        </div>

        {/* Secondary actions — disabled, planned for next commit */}
        <div style={styles.secondaryActions}>
          <span
            style={styles.btnDisabled}
            title="Смена роли — следующий шаг"
          >
            Роль ▾
          </span>
        </div>
      </div>
    </div>
  )
}

const styles = {
  card: {
    display: "flex",
    flexDirection: "column" as const,
    border: "1px solid #e0e0e0",
    borderRadius: "6px",
    background: "#fff",
    overflow: "hidden",
    fontSize: "12px",
  },
  previewSizer: {
    // padding-bottom: 100% creates a guaranteed 1:1 square regardless of
    // whether children are in-flow or absolutely positioned. More reliable
    // than aspect-ratio on a flex/block element with only absolute children.
    position: "relative" as const,
    width: "100%",
    paddingBottom: "100%",
    background: "#f0f0f0",
    overflow: "hidden",
    flexShrink: 0,
  },
  previewArea: {
    // Fills the sizer absolutely — all media children anchor to this.
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden",
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
    gap: "3px",
    padding: "10px",
    textAlign: "center" as const,
  },
  statusIcon: {
    fontSize: "18px",
    lineHeight: 1,
    color: "#ccc",
  },
  statusText: {
    fontSize: "9px",
    color: "#bbb",
    fontWeight: 500,
  },
  noPreviewReason: {
    fontSize: "8px",
    color: "#ccc",
    lineHeight: 1.3,
  },
  roleBadgeOverlay: {
    position: "absolute" as const,
    bottom: "5px",
    left: "5px",
    background: "rgba(26,58,110,0.85)",
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
    padding: "1px 5px",
    fontSize: "9px",
    fontWeight: 700,
  },
  footer: {
    padding: "5px 6px 6px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "4px",
    background: "#fff",
  },
  filename: {
    fontSize: "10px",
    color: "#555",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    lineHeight: 1.3,
  },
  primaryActions: {
    display: "flex",
    gap: "3px",
  },
  btnMain: {
    flex: 1,
    padding: "4px 0",
    fontSize: "10px",
    border: "1px solid #aacaff",
    borderRadius: "3px",
    background: "#e8f0ff",
    color: "#1a3a6e",
    cursor: "pointer",
    fontWeight: 700,
    textAlign: "center" as const,
    lineHeight: 1.3,
  },
  btnGallery: {
    flex: 1,
    padding: "4px 0",
    fontSize: "10px",
    border: "1px solid #c8e6c9",
    borderRadius: "3px",
    background: "#f0fff0",
    color: "#1b5e20",
    cursor: "pointer",
    fontWeight: 600,
    textAlign: "center" as const,
    lineHeight: 1.3,
  },
  secondaryActions: {
    display: "flex",
    gap: "3px",
  },
  btnDisabled: {
    flex: 1,
    padding: "2px 0",
    fontSize: "9px",
    border: "1px solid #f0f0f0",
    borderRadius: "3px",
    background: "#fafafa",
    color: "#ccc",
    cursor: "default",
    textAlign: "center" as const,
    lineHeight: 1.3,
    userSelect: "none" as const,
  },
} as const
