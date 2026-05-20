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
}

export function MediaCardV2({ inv, role, confidence, selectedHandle }: Props) {
  const [imgFailed, setImgFailed] = useState(false)

  const preview = clientPreview(inv)
  const showImg = preview.url !== null && !imgFailed
  const roleLabel = VISUAL_ROLE_BADGE_RU[role] ?? "?"
  const shortname = inv.filename.length > 36 ? inv.filename.slice(0, 33) + "…" : inv.filename
  const confColor = confidence ? (CONFIDENCE_COLOR[confidence] ?? "#666") : "#999"

  // Effective status to show in the no-preview block
  const effectiveStatus = imgFailed ? "file_missing" : preview.status
  const effectiveReason = imgFailed ? "Файл не найден на диске (proxy 404)." : preview.reason

  function noop(label: string) {
    return () => console.log(`[v2 board] ${label}`, { id: inv.id, handle: selectedHandle, role })
  }

  return (
    <div style={styles.card}>
      {/* Preview area */}
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
          </div>
        )}
      </div>

      {/* Info */}
      <div style={styles.info}>
        <div style={styles.filename} title={inv.filename}>{shortname}</div>
        <div style={styles.metaRow}>
          <span style={styles.roleBadge}>{roleLabel}</span>
          {confidence && (
            <span style={{ ...styles.confBadge, color: confColor }}>{confidence}</span>
          )}
        </div>
        <div style={styles.sourceType}>{inv.source_type}</div>
        {!showImg && effectiveReason && (
          <div style={styles.previewReason}>{effectiveReason}</div>
        )}
      </div>

      {/* Actions */}
      <div style={styles.actions}>
        <button style={styles.actionBtn} onClick={noop("Главное")}>Главное</button>
        <button style={styles.actionBtn} onClick={noop("В галерею")}>В галерею</button>
        <button style={styles.actionBtn} onClick={noop("Роль")}>Роль ▾</button>
        <button style={styles.actionBtn} onClick={noop("Инспектор")}>Инспектор</button>
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
  previewArea: {
    width: "100%",
    aspectRatio: "1",
    background: "#f5f5f5",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative" as const,
  },
  img: {
    width: "100%",
    height: "100%",
    objectFit: "contain" as const,
    display: "block",
  },
  noPreview: {
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
    padding: "8px",
    textAlign: "center" as const,
    color: "#888",
    width: "100%",
    height: "100%",
  },
  statusIcon: {
    fontSize: "20px",
    lineHeight: 1,
  },
  statusText: {
    fontSize: "10px",
    color: "#999",
  },
  info: {
    padding: "6px 8px",
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    gap: "3px",
  },
  filename: {
    fontWeight: 500,
    color: "#222",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    fontSize: "11px",
  },
  metaRow: {
    display: "flex",
    gap: "4px",
    flexWrap: "wrap" as const,
    alignItems: "center",
  },
  roleBadge: {
    background: "#e8f0ff",
    color: "#1a3a6e",
    borderRadius: "3px",
    padding: "1px 5px",
    fontSize: "10px",
    fontWeight: 600,
  },
  confBadge: {
    fontSize: "10px",
    fontWeight: 500,
  },
  sourceType: {
    color: "#aaa",
    fontSize: "10px",
  },
  previewReason: {
    color: "#a33",
    fontSize: "10px",
    marginTop: "2px",
  },
  actions: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "3px",
    padding: "5px 6px",
    borderTop: "1px solid #f0f0f0",
    background: "#fafafa",
  },
  actionBtn: {
    fontSize: "10px",
    padding: "2px 6px",
    border: "1px solid #ddd",
    borderRadius: "3px",
    background: "#fff",
    cursor: "pointer",
    color: "#333",
    lineHeight: 1.4,
  },
} as const
