"use client"

import { useState } from "react"
import type { InvItem, V2RoleSlot } from "./legacy-board-v2-types"
import type { VisualRole } from "@/app/qa/legacy-media-assignment-board/legacy-media-visual-role-ranking"
import { VISUAL_ROLE_BADGE_RU } from "@/app/qa/legacy-media-assignment-board/legacy-media-visual-role-ranking"
import type { V2RoleConfidence } from "./legacy-board-v2-role-inference"

// Role slot labels for the operator override dropdown (excludes "main" — set via ★)
const ROLE_SLOT_LABELS: Partial<Record<V2RoleSlot, string>> = {
  front_anfas: "Анфас",
  front_3_4: "3/4",
  interior: "Внутри",
  detail: "Деталь",
  lifestyle: "Lifestyle",
  scheme: "Схема",
}

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
  backend_static_mapped: "◉",
  backend_static_url: "◉",
  local_proxy: "◉",
  remote_http: "◉",
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
  /** v2 inference confidence — shows auto? when low/ambiguous */
  roleConfidence?: V2RoleConfidence
  confidence?: string
  identityConfidence?: string
  selectedHandle: string | null
  onSetMain?: (mediaId: string) => void
  onAddToGallery?: (mediaId: string) => void
  /** Compact list-row layout for non-previewable items (spans full grid width) */
  compact?: boolean
  /** True when this item is the active main/thumbnail for the current variant */
  isMain?: boolean
  /** True when this item is already in the gallery for the current variant */
  isInGallery?: boolean
  /**
   * Visually de-emphasise this card so unassigned items stand out.
   * Applied in "Все" pool view when the card is already assigned (main or gallery),
   * making the free pool easier to scan. Does NOT affect "Выбранные" view.
   */
  isDimmed?: boolean
  /** Operator-assigned role override (overrides auto-detected role for display + filtering) */
  roleOverride?: V2RoleSlot | null
  /** Called when operator changes the role override via dropdown */
  onSetRoleOverride?: (mediaId: string, role: V2RoleSlot | null) => void
}

export function MediaCardV2({
  inv,
  role,
  roleConfidence,
  confidence,
  selectedHandle: _selectedHandle,
  onSetMain,
  onAddToGallery,
  compact,
  isMain,
  isInGallery,
  isDimmed,
  roleOverride,
  onSetRoleOverride,
}: Props) {
  const [imgFailed, setImgFailed] = useState(false)

  const preview = clientPreview(inv)
  const showImg = preview.url !== null && !imgFailed
  const roleLabel = VISUAL_ROLE_BADGE_RU[role] ?? "?"
  const shortname = inv.filename.length > 30 ? inv.filename.slice(0, 27) + "…" : inv.filename
  const effectiveStatus = imgFailed ? "file_missing" : preview.status
  const effectiveReason = imgFailed ? "Файл не найден на диске (proxy 404)." : preview.reason
  const overrideLabel = roleOverride ? (ROLE_SLOT_LABELS[roleOverride] ?? roleOverride) : null
  const autoLow =
    !overrideLabel && (roleConfidence === "ambiguous" || roleConfidence === "low")
  const displayRoleLabel = overrideLabel ?? roleLabel

  function handleSetMain() {
    if (!isMain && onSetMain) onSetMain(inv.id)
  }

  function handleAddToGallery() {
    if (!isInGallery && onAddToGallery) onAddToGallery(inv.id)
  }

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData("text/plain", inv.id)
    e.dataTransfer.effectAllowed = "copy"
  }

  function handleRoleOverrideChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value
    onSetRoleOverride?.(inv.id, v ? (v as V2RoleSlot) : null)
  }

  // Role override select element — shared between full and compact cards
  const roleControl = onSetRoleOverride ? (
    <div style={styles.roleRow}>
      <span
        style={{
          ...styles.roleChip,
          ...(overrideLabel ? styles.roleChipOverride : {}),
        }}
        title={overrideLabel ? `Ручная роль: ${overrideLabel}` : `Авто: ${roleLabel}${autoLow ? " (низкая уверенность)" : ""}`}
      >
        {autoLow ? `${displayRoleLabel}?` : displayRoleLabel}
      </span>
      <select
        style={{
          ...styles.roleSelect,
          ...(overrideLabel ? styles.roleSelectOverride : {}),
        }}
        value={roleOverride ?? ""}
        onChange={handleRoleOverrideChange}
        title="Переопределить роль для фильтрации в пуле"
      >
        <option value="">авто</option>
        {Object.entries(ROLE_SLOT_LABELS).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>
      {overrideLabel && <span style={styles.manualBadge}>ручн.</span>}
    </div>
  ) : null

  // -------------------------------------------------------------------------
  // Compact list-row — for non-previewable items
  // spans full grid width so photo cards always align above in a clean 2-col grid
  // -------------------------------------------------------------------------
  if (compact) {
    return (
      <div
        draggable
        onDragStart={handleDragStart}
        style={{
          ...styles.compactCard,
          ...(isMain ? styles.compactCardMain : isInGallery ? styles.compactCardInGallery : {}),
          ...(isDimmed ? styles.dimmed : {}),
        }}
      >
        <span style={styles.compactIcon}>{STATUS_ICON[effectiveStatus] ?? "–"}</span>
        <div style={styles.compactText}>
          <span style={styles.compactFilename} title={inv.filename}>{shortname}</span>
          <span style={styles.compactMeta}>
            {STATUS_LABEL_RU[effectiveStatus] ?? effectiveStatus}
            {" · "}
            <span style={styles.compactRoleLabel}>{roleLabel}</span>
          </span>
        </div>
        {isMain && <span style={styles.usagePillMain}>★ Главное</span>}
        {isInGallery && !isMain && <span style={styles.usagePillGallery}>В галерее</span>}
        <button
          style={{ ...styles.compactBtnMain, ...(isMain ? styles.compactBtnUsed : {}) }}
          onClick={handleSetMain}
          disabled={!!isMain}
          title={isMain ? "Уже назначено главным" : "★ Главное"}
        >
          ★
        </button>
        <button
          style={{ ...styles.compactBtnGallery, ...(isInGallery ? styles.compactBtnUsed : {}) }}
          onClick={handleAddToGallery}
          disabled={!!isInGallery}
          title={isInGallery ? "Уже в галерее" : "+ Галерея"}
        >
          {isInGallery ? "✓" : "+"}
        </button>
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
    <div
      draggable
      onDragStart={handleDragStart}
      style={{
        ...styles.card,
        ...(isMain ? styles.cardMain : isInGallery ? styles.cardInGallery : {}),
        ...(isDimmed ? styles.dimmed : {}),
      }}
    >
      {/* Image wrap — fixed 160px height, reliable in any grid/flex context */}
      <div style={styles.imageWrap}>
        {showImg ? (
          <img
            src={preview.url!}
            alt={inv.filename}
            style={styles.img}
            loading="lazy"
            onError={() => setImgFailed(true)}
            draggable={false}
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

        {/* Usage state badge — top-left overlay (distinct from confidence badge) */}
        {isMain && (
          <span style={styles.usageBadgeMain}>★ ГЛ.</span>
        )}
        {isInGallery && !isMain && (
          <span style={styles.usageBadgeGallery}>В ГАЛ.</span>
        )}

        {/* Role badge — bottom-left overlay */}
        <span style={styles.roleBadgeOverlay}>
          {autoLow ? `${displayRoleLabel}?` : displayRoleLabel}
        </span>

        {/* Confidence badge — top-right overlay */}
        {confidence && (
          <span
            style={{
              ...styles.confBadgeOverlay,
              background: CONFIDENCE_COLOR[confidence] ?? "#888",
            }}
          >
            {confidence === "confirmed" ? "●" : confidence}
          </span>
        )}
      </div>

      {/* Footer: filename + primary actions + role override */}
      <div style={styles.footer}>
        <div style={styles.filename} title={inv.filename}>{shortname}</div>
        <div style={styles.primaryActions}>
          <button
            style={{ ...styles.btnMain, ...(isMain ? styles.btnMainActive : {}) }}
            onClick={handleSetMain}
            disabled={!!isMain}
          >
            {isMain ? "★ Назначено" : "★ Главное"}
          </button>
          <button
            style={{ ...styles.btnGallery, ...(isInGallery ? styles.btnGalleryActive : {}) }}
            onClick={handleAddToGallery}
            disabled={!!isInGallery}
          >
            {isInGallery ? "✓ Галерея" : "+ Галерея"}
          </button>
        </div>
        {roleControl}
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
    cursor: "grab",
  },
  cardMain: {
    border: "2px solid #b88a00",
    background: "#fffdf0",
  },
  cardInGallery: {
    border: "2px solid #2d7a2d",
    background: "#f5fff5",
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
  usageBadgeMain: {
    position: "absolute" as const,
    top: "5px",
    left: "5px",
    background: "rgba(184, 138, 0, 0.95)",
    color: "#fff",
    borderRadius: "3px",
    padding: "2px 6px",
    fontSize: "10px",
    fontWeight: 700,
    letterSpacing: "0.04em",
    backdropFilter: "blur(2px)",
    zIndex: 2,
    boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
  },
  usageBadgeGallery: {
    position: "absolute" as const,
    top: "5px",
    left: "5px",
    background: "rgba(45, 122, 45, 0.95)",
    color: "#fff",
    borderRadius: "3px",
    padding: "2px 6px",
    fontSize: "10px",
    fontWeight: 700,
    letterSpacing: "0.04em",
    backdropFilter: "blur(2px)",
    zIndex: 2,
    boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
  },
  roleBadgeOverlay: {
    position: "absolute" as const,
    bottom: "5px",
    left: "5px",
    background: "rgba(26,58,110,0.9)",
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
    background: "inherit",
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
  btnMainActive: {
    border: "1px solid #b88a00",
    background: "#fff8dc",
    color: "#7a5a00",
    cursor: "default",
    opacity: 0.85,
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
  btnGalleryActive: {
    border: "1px solid #2d7a2d",
    background: "#d4f0d4",
    color: "#1a4a1a",
    cursor: "default",
    opacity: 0.85,
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
  compactCardMain: {
    border: "1px solid #b88a00",
    background: "#fffdf0",
  },
  compactCardInGallery: {
    border: "1px solid #2d7a2d",
    background: "#f5fff5",
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
  usagePillMain: {
    fontSize: "10px",
    background: "#fff8dc",
    border: "1px solid #b88a00",
    color: "#7a5a00",
    borderRadius: "3px",
    padding: "1px 5px",
    fontWeight: 700,
    flexShrink: 0,
    whiteSpace: "nowrap" as const,
  },
  usagePillGallery: {
    fontSize: "10px",
    background: "#d4f0d4",
    border: "1px solid #2d7a2d",
    color: "#1a4a1a",
    borderRadius: "3px",
    padding: "1px 5px",
    fontWeight: 600,
    flexShrink: 0,
    whiteSpace: "nowrap" as const,
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
  compactBtnUsed: {
    background: "#f0f0f0",
    color: "#ccc",
    cursor: "default",
    border: "1px solid #e0e0e0",
  },
  /** Applied in "Все" pool view to already-assigned cards so free items stand out */
  dimmed: {
    opacity: 0.65,
    filter: "saturate(0.6)",
    transition: "opacity 0.1s, filter 0.1s",
  },

  // ---------------------------------------------------------------------------
  // Role override control (shown in card footer when onSetRoleOverride is provided)
  // ---------------------------------------------------------------------------
  roleRow: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    paddingTop: "3px",
    borderTop: "1px solid #f0f0f0",
    marginTop: "2px",
  },
  roleChip: {
    fontSize: "9px",
    background: "#e8eeff",
    color: "#1a3a6e",
    borderRadius: "3px",
    padding: "1px 5px",
    fontWeight: 600,
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis" as const,
    whiteSpace: "nowrap" as const,
    minWidth: 0,
  },
  roleChipOverride: {
    background: "#fff0e0",
    color: "#7a4800",
    border: "1px solid #f0a000",
  },
  roleSelect: {
    fontSize: "10px",
    border: "1px solid #e0e0e0",
    borderRadius: "3px",
    background: "#fafafa",
    color: "#555",
    padding: "1px 2px",
    cursor: "pointer",
    maxWidth: "60px",
    flexShrink: 0,
    lineHeight: 1.2,
  },
  roleSelectOverride: {
    background: "#fff8f0",
    borderColor: "#f0a000",
    color: "#7a4800",
  },
  manualBadge: {
    fontSize: "9px",
    background: "#f0a000",
    color: "#fff",
    borderRadius: "3px",
    padding: "1px 4px",
    fontWeight: 700,
    flexShrink: 0,
    whiteSpace: "nowrap" as const,
  },
} as const
