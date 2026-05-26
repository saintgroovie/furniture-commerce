"use client"

import { useEffect, useState } from "react"
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

import type { LegacyMediaPreviewRecoveryEntry } from "@/lib/qa/legacy-media-preview-recovery-types"
import {
  isLegacyBoardClientPreviewable,
  resolveLegacyBoardClientPreview,
  type LegacyBoardClientPreview,
} from "@/lib/qa/legacy-media-board-client-preview"

export type ClientPreview = LegacyBoardClientPreview

/** True when the card should attempt a real image (shared v1/v2 resolver). */
export function isStaticallyPreviewable(
  inv: InvItem,
  recovery?: LegacyMediaPreviewRecoveryEntry | null
): boolean {
  return isLegacyBoardClientPreviewable(inv, recovery ?? null)
}

export function clientPreview(
  inv: InvItem,
  recovery?: LegacyMediaPreviewRecoveryEntry | null
): ClientPreview {
  return resolveLegacyBoardClientPreview(inv, recovery ?? null)
}

// ---------------------------------------------------------------------------
// Status icon + label map
// ---------------------------------------------------------------------------

const STATUS_ICON: Record<string, string> = {
  backend_static_mapped: "◉",
  backend_static_url: "◉",
  qa_medusa_static_fallback: "◉",
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
  /** v2 inference confidence — low/ambiguous surfaced via tooltip only, not «auto?» chip */
  roleConfidence?: V2RoleConfidence
  confidence?: string
  identityConfidence?: string
  selectedHandle: string | null
  onSetMain?: (mediaId: string) => void
  onAddToGallery?: (mediaId: string) => void
  /** Compact list-row layout for non-previewable items (spans full grid width) */
  compact?: boolean
  /** Pool: parent decides preview tier (filter/sort/DOM); overrides compact */
  showsAsPreview?: boolean
  /** Pool: proxy 404 / load failure — parent removes from preview tier */
  onPreviewLoadFailed?: (mediaId: string) => void
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
  /** Active-variant usage line (e.g. «✓ В витрине · 3/4» or «другой цвет») */
  poolUsageLine?: string
  /** Another color variant — muted chrome + label, image stays full opacity */
  poolMuted?: boolean
  /** Disable assign buttons (e.g. other color on active tab) */
  poolActionsDisabled?: boolean
  /** Disable ★ Главное (e.g. shared colorless tab) */
  mainActionDisabled?: boolean
  /** Tooltip when ★ Главное is disabled */
  mainActionDisabledTitle?: string
  /** Override gallery button label (e.g. «+ Во все галереи») */
  galleryButtonLabel?: string
  /** Called when operator changes the role override via dropdown */
  onSetRoleOverride?: (mediaId: string, role: V2RoleSlot | null) => void
  /** Parent-owned effective preview — drives filter, sort, and DOM proof attributes */
  effectivePreviewOk?: boolean
  /** Notify parent when image load fails (proxy 404, broken remote URL) */
  onPreviewLoadFailure?: (mediaId: string) => void
  /** QA preview-recovery map entry (same as v1 board) */
  previewRecovery?: LegacyMediaPreviewRecoveryEntry | null
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
  showsAsPreview,
  onPreviewLoadFailed,
  isMain,
  isInGallery,
  isDimmed,
  poolUsageLine,
  poolMuted,
  poolActionsDisabled,
  mainActionDisabled,
  mainActionDisabledTitle,
  galleryButtonLabel,
  roleOverride,
  onSetRoleOverride,
  effectivePreviewOk,
  onPreviewLoadFailure,
  previewRecovery,
}: Props) {
  const isOtherColor = !!poolMuted
  const otherColorTitle = "Другой цвет — переключите вкладку цвета или перетащите в слот"
  const mainDisabled = !!mainActionDisabled
  const actionsDisabled = !!poolActionsDisabled || isOtherColor
  const mainBtnDisabled = !!isMain || actionsDisabled || mainDisabled
  const mainBtnTitle = mainDisabled
    ? (mainActionDisabledTitle ?? "Главное назначается на конкретном цвете")
    : actionsDisabled
      ? otherColorTitle
      : isMain
        ? "Уже назначено главным"
        : undefined
  const [imgFailed, setImgFailed] = useState(false)

  const preview = clientPreview(inv, previewRecovery)
  const staticPreviewOk = isStaticallyPreviewable(inv, previewRecovery)
  const useCompact =
    showsAsPreview !== undefined ? !showsAsPreview : !!compact
  const domPreviewOk =
    showsAsPreview !== undefined
      ? showsAsPreview && staticPreviewOk && !imgFailed
      : (effectivePreviewOk ?? (staticPreviewOk && !imgFailed))
  const showImg = !useCompact && staticPreviewOk && !imgFailed

  const reportPreviewFailure = onPreviewLoadFailed ?? onPreviewLoadFailure
  useEffect(() => {
    if (showsAsPreview === false || !reportPreviewFailure) return
    if (!staticPreviewOk || imgFailed) {
      reportPreviewFailure(inv.id)
    }
  }, [showsAsPreview, staticPreviewOk, imgFailed, inv.id, reportPreviewFailure])
  const roleLabel = VISUAL_ROLE_BADGE_RU[role] ?? "?"
  const shortname = inv.filename.length > 30 ? inv.filename.slice(0, 27) + "…" : inv.filename
  const effectiveStatus = imgFailed ? "file_missing" : preview.status
  const effectiveReason = imgFailed
    ? preview.status === "qa_medusa_static_fallback" || preview.status === "backend_static_mapped"
      ? "Medusa static 404 — файл отсутствует в backend static."
      : preview.status === "local_proxy"
        ? "Локальный proxy 404 — data/ файл не на диске."
        : "Превью недоступно (HTTP ошибка загрузки)."
    : preview.reason
  const overrideLabel = roleOverride ? (ROLE_SLOT_LABELS[roleOverride] ?? roleOverride) : null
  const autoLow =
    !overrideLabel && (roleConfidence === "ambiguous" || roleConfidence === "low")
  const displayRoleLabel = overrideLabel ?? roleLabel
  const roleControlTitle = overrideLabel
    ? `Роль изменена вручную: ${overrideLabel}`
    : autoLow
      ? `Роль распознана автоматически (${displayRoleLabel}). Низкая уверенность — проверьте при необходимости.`
      : `Роль: ${displayRoleLabel}`

  function handleSetMain() {
    if (mainBtnDisabled || !onSetMain) return
    onSetMain(inv.id)
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

  function handleImgError() {
    setImgFailed(true)
    onPreviewLoadFailure?.(inv.id)
    onPreviewLoadFailed?.(inv.id)
  }

  const galleryBtnLabel = isInGallery
    ? (galleryButtonLabel ? "✓ Во всех галереях" : "✓ Галерея")
    : (galleryButtonLabel ?? "+ Галерея")

  // Role override select — full-width row with visible label (not cramped native chip)
  const roleControl = onSetRoleOverride ? (
    <div style={styles.roleBlock} data-v2-pool-role-block>
      <div style={styles.roleBlockHeader}>
        <span style={styles.roleBlockLabel}>Роль</span>
        <span style={styles.roleBlockValue} title={roleControlTitle}>
          {displayRoleLabel}
        </span>
      </div>
      <select
        style={{
          ...styles.roleSelect,
          ...(overrideLabel ? styles.roleSelectOverride : {}),
        }}
        value={roleOverride ?? ""}
        onChange={handleRoleOverrideChange}
        title={roleControlTitle}
        aria-label={`Роль: ${displayRoleLabel}`}
        data-v2-pool-role-select
      >
        <option value="">{displayRoleLabel}</option>
        {Object.entries(ROLE_SLOT_LABELS).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>
    </div>
  ) : null

  // -------------------------------------------------------------------------
  // Compact list-row — for non-previewable items
  // spans full grid width so photo cards always align above in a clean 2-col grid
  // -------------------------------------------------------------------------
  if (useCompact) {
    return (
      <div
        data-v2-pool-card="true"
        data-v2-pool-preview-ok="false"
        draggable
        onDragStart={handleDragStart}
        style={{
          ...styles.compactCard,
          ...(isMain ? styles.compactCardMain : isInGallery ? styles.compactCardInGallery : {}),
          ...(isOtherColor ? styles.poolOtherColorChrome : {}),
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
        {poolUsageLine ? (
          <span
            style={{
              ...styles.usagePillMain,
              ...(poolUsageLine.startsWith("✓") ? styles.usagePillGallery : {}),
              ...(isOtherColor ? styles.usagePillOtherVariant : {}),
            }}
            data-v2-pool-usage-line={poolUsageLine}
          >
            {poolUsageLine}
          </span>
        ) : (
          <>
            {isMain && <span style={styles.usagePillMain}>★ Главное</span>}
            {isInGallery && !isMain && <span style={styles.usagePillGallery}>В галерее</span>}
          </>
        )}
        <button
          style={{ ...styles.compactBtnMain, ...(isMain ? styles.compactBtnUsed : {}), ...(mainBtnDisabled ? styles.btnDisabled : {}) }}
          onClick={handleSetMain}
          disabled={mainBtnDisabled}
          title={mainBtnTitle ?? (isMain ? "Уже назначено главным" : "★ Главное")}
        >
          ★
        </button>
        <button
          style={{ ...styles.compactBtnGallery, ...(isInGallery ? styles.compactBtnUsed : {}) }}
          onClick={handleAddToGallery}
          disabled={!!isInGallery || actionsDisabled}
          title={actionsDisabled ? otherColorTitle : isInGallery ? "Уже в галерее" : "+ Галерея"}
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
      data-v2-pool-card="true"
      data-v2-pool-preview-ok={domPreviewOk ? "true" : "false"}
      draggable
      onDragStart={handleDragStart}
      style={{
        ...styles.card,
        ...(isMain ? styles.cardMain : isInGallery ? styles.cardInGallery : {}),
        ...(isOtherColor ? styles.poolOtherColorChrome : {}),
      }}
      data-v2-pool-other-color={isOtherColor ? "true" : undefined}
      data-v2-pool-dimmed={isDimmed ? "footer" : undefined}
    >
      {/* Image wrap — status chips moved to footer to avoid top crowding */}
      <div style={styles.imageWrap} data-v2-pool-preview-wrap>
        {showImg ? (
          <img
            src={preview.url!}
            alt={inv.filename}
            style={styles.img}
            data-v2-pool-preview-img
            loading="lazy"
            onError={handleImgError}
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

        {/* Role badge — bottom-left overlay (hidden when footer has role dropdown) */}
        {!onSetRoleOverride && (
          <span style={styles.roleBadgeOverlay} title={roleControlTitle}>
            {displayRoleLabel}
          </span>
        )}

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

      {/* Footer: filename + status + actions + role */}
      <div
        style={{ ...styles.footer, ...(isDimmed ? styles.footerDimmed : {}) }}
        data-v2-pool-card-footer
      >
        <div style={styles.filename} title={inv.filename}>{shortname}</div>
        {poolUsageLine ? (
          <div
            style={{
              ...styles.footerStatusChip,
              ...(isOtherColor ? styles.footerStatusChipOther : {}),
              ...(poolUsageLine === "общий кадр" ? styles.footerStatusChipNeutral : {}),
              ...(poolUsageLine.includes("Во всех") || poolUsageLine.includes("Общая")
                ? styles.footerStatusChipShared
                : {}),
            }}
            data-v2-pool-usage-line={poolUsageLine}
          >
            {poolUsageLine}
          </div>
        ) : null}
        <div style={styles.primaryActions}>
          <button
            style={{
              ...styles.btnMain,
              ...(isMain ? styles.btnMainActive : {}),
              ...(mainDisabled ? styles.btnMainDisabled : {}),
              ...(actionsDisabled && !mainDisabled ? styles.btnDisabled : {}),
            }}
          onClick={handleSetMain}
          disabled={mainBtnDisabled}
          title={mainBtnTitle}
          >
            {isMain ? "★ Назначено" : "★ Главное"}
          </button>
          <button
            style={{
              ...styles.btnGallery,
              ...(isInGallery ? styles.btnGalleryActive : {}),
              ...(actionsDisabled ? styles.btnDisabled : {}),
            }}
            onClick={handleAddToGallery}
            disabled={!!isInGallery || actionsDisabled}
            title={actionsDisabled ? otherColorTitle : undefined}
          >
            {galleryBtnLabel}
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
    overflow: "visible",
    fontSize: "12px",
    cursor: "grab",
    boxSizing: "border-box" as const,
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
    position: "relative" as const,
    width: "100%",
    height: "148px",
    background: "#f0f0f0",
    overflow: "hidden",
    flexShrink: 0,
    borderTopLeftRadius: "5px",
    borderTopRightRadius: "5px",
  },
  img: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain" as const,
    display: "block",
    opacity: 1,
    filter: "none",
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
    padding: "8px 10px 14px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "6px",
    background: "inherit",
    flexShrink: 0,
    overflow: "visible",
    borderBottomLeftRadius: "5px",
    borderBottomRightRadius: "5px",
    minHeight: "96px",
    boxSizing: "border-box" as const,
  },
  footerStatusChip: {
    fontSize: "10px",
    fontWeight: 700,
    lineHeight: 1.35,
    padding: "3px 6px",
    borderRadius: "4px",
    background: "#eef4ff",
    color: "#1a3a6e",
    border: "1px solid #d0e0f8",
    wordBreak: "break-word" as const,
    whiteSpace: "normal" as const,
  },
  footerStatusChipOther: {
    background: "#f3f4f6",
    color: "#5a6478",
    border: "1px solid #d8dce4",
  },
  footerStatusChipNeutral: {
    background: "#f0faf0",
    color: "#2d5a2d",
    border: "1px solid #c8e6c9",
  },
  footerStatusChipShared: {
    background: "#e8f5e9",
    color: "#1b5e20",
    border: "1px solid #81c784",
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
    flexWrap: "wrap" as const,
    gap: "4px",
    width: "100%",
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
  btnMainDisabled: {
    border: "1px solid #ddd",
    background: "#f0f0f0",
    color: "#999",
    cursor: "not-allowed",
    opacity: 1,
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
  // Compact list-row for non-previewable items — single grid cell (2-col row-major)
  // ---------------------------------------------------------------------------
  compactCard: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 10px",
    border: "1px solid #f0f0f0",
    borderRadius: "4px",
    background: "#fafafa",
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
  footerDimmed: {
    background: "#f4f5f7",
    opacity: 1,
  },
  poolOtherColorChrome: {
    border: "1px dashed #b8c0cc",
    background: "#fafbfc",
    boxShadow: "none",
    opacity: 1,
    filter: "none",
  },
  poolUsageBanner: {
    fontSize: "10px",
    fontWeight: 700,
    textAlign: "center" as const,
    padding: "4px 6px",
    background: "#eef4ff",
    color: "#1a3a6e",
    borderBottom: "1px solid #d0e0f8",
    lineHeight: 1.3,
    wordBreak: "break-word" as const,
    whiteSpace: "normal" as const,
  },
  poolUsageBannerOther: {
    background: "#f3f4f6",
    color: "#5a6478",
    borderBottom: "1px solid #d8dce4",
  },
  poolUsageBannerNeutral: {
    background: "#f0faf0",
    color: "#2d5a2d",
    borderBottom: "1px solid #c8e6c9",
  },
  usagePillOtherVariant: {
    background: "#f3f4f6",
    color: "#5a6478",
    border: "1px solid #d0d4dc",
  },
  btnDisabled: {
    opacity: 0.55,
    cursor: "not-allowed",
  },

  // ---------------------------------------------------------------------------
  // Role override control (shown in card footer when onSetRoleOverride is provided)
  // ---------------------------------------------------------------------------
  roleBlock: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "4px",
    paddingTop: "6px",
    marginTop: "2px",
    borderTop: "1px solid #ececec",
    width: "100%",
  },
  roleBlockHeader: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: "6px",
    lineHeight: 1.3,
  },
  roleBlockLabel: {
    fontSize: "10px",
    fontWeight: 700,
    color: "#888",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    flexShrink: 0,
  },
  roleBlockValue: {
    fontSize: "11px",
    fontWeight: 600,
    color: "#333",
    textAlign: "right" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    minWidth: 0,
  },
  roleSelect: {
    width: "100%",
    fontSize: "12px",
    border: "1px solid #ccc",
    borderRadius: "5px",
    background: "#fff",
    color: "#222",
    padding: "8px 10px",
    minHeight: "36px",
    lineHeight: "18px",
    boxSizing: "border-box" as const,
    cursor: "pointer",
    marginBottom: "2px",
  },
  roleSelectOverride: {
    background: "#fff8f0",
    borderColor: "#d09000",
    color: "#5a3800",
    fontWeight: 600,
  },
} as const
