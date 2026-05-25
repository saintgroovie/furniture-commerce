"use client"

import { useMemo, useState } from "react"
import type { InvItem, V2ProductState, V2RoleSlot, V2RoleRow, V2RoleFilter } from "./legacy-board-v2-types"
import type { VisualRole } from "@/app/qa/legacy-media-assignment-board/legacy-media-visual-role-ranking"
import { clientPreview } from "./MediaCardV2"
import { inferV2VisualRole } from "./legacy-board-v2-role-inference"
import { ROLE_SLOT_LABEL_RU } from "./legacy-board-v2-gallery-source"

const ROLE_DEFS: ReadonlyArray<{ slot: V2RoleSlot; label: string; filter: V2RoleFilter; hint: string }> = [
  { slot: "main", label: "Главное", filter: "front", hint: "Главная карточка товара" },
  { slot: "front_anfas", label: "Анфас", filter: "front", hint: "Вид спереди" },
  { slot: "front_3_4", label: "3/4", filter: "3_4", hint: "Вид под углом" },
  { slot: "interior", label: "Внутри", filter: "interior", hint: "Интерьерное фото" },
  { slot: "detail", label: "Деталь", filter: "detail", hint: "Крупный план" },
  { slot: "lifestyle", label: "Lifestyle", filter: "lifestyle", hint: "Lifestyle фото" },
  { slot: "scheme", label: "Схема", filter: "scheme", hint: "Габаритная схема" },
]

export function visualRoleToSlot(vr: VisualRole): V2RoleSlot | null {
  if (vr === "closed_front" || vr === "hero_front" || vr === "front_anfas") return "front_anfas"
  if (vr === "front_3_4") return "front_3_4"
  if (vr === "interior") return "interior"
  if (vr === "detail") return "detail"
  if (vr === "lifestyle") return "lifestyle"
  if (vr === "scheme") return "scheme"
  return null
}

export function computeRoleRows(
  productState: V2ProductState | null,
  variantKey: string,
  invById: Map<string, InvItem>,
  roleOverrides?: Record<string, V2RoleSlot>
): V2RoleRow[] {
  const overrides = roleOverrides ?? {}
  const roles = productState?.rolesByVariant[variantKey] ?? {}

  return ROLE_DEFS.map(({ slot, label }) => {
    const explicit = (roles[slot] as string | null | undefined) ?? null
    if (explicit) {
      return { slot, label, mediaId: explicit, isCovered: true, source: "explicit" as const }
    }
    return { slot, label, mediaId: null, isCovered: false, source: "none" as const }
  })
}

type Props = {
  productState: V2ProductState | null
  activeVariantKey: string
  invById: Map<string, InvItem>
  onFocusRole: (slot: V2RoleSlot) => void
  onRemoveMain?: () => void
  onRemoveFromGallery?: (mediaId: string) => void
  onSetRole?: (mediaId: string, slot: V2RoleSlot) => void
  onClearRole?: (slot: V2RoleSlot) => void
  roleOverrides?: Record<string, V2RoleSlot>
  onAddToGallery?: (mediaId: string) => void
  galleryIds?: string[]
  productHandle?: string | null
}

export function RoleChecklistPanel({
  productState,
  activeVariantKey,
  invById,
  onFocusRole,
  onRemoveMain,
  onRemoveFromGallery,
  onSetRole,
  onClearRole,
  roleOverrides,
  onAddToGallery,
  galleryIds = [],
  productHandle,
}: Props) {
  const [dragOverSlot, setDragOverSlot] = useState<V2RoleSlot | null>(null)
  const gallerySet = useMemo(() => new Set(galleryIds), [galleryIds])

  const rows = useMemo(
    () => computeRoleRows(productState, activeVariantKey, invById, roleOverrides),
    [productState, activeVariantKey, invById, roleOverrides]
  )

  return (
    <section
      style={styles.roleBoard}
      data-v2-role-board
      data-v2-active-variant-key={activeVariantKey}
    >
      <header style={styles.boardHeader}>
        <h2 style={styles.boardTitle}>СЛОТЫ РОЛЕЙ</h2>
        <p style={styles.boardSubtitle}>
          Заполните роли — витрина обновится автоматически. «+ пул» открывает фильтр в правой
          колонке.
        </p>
      </header>

      <div style={styles.grid} data-v2-role-grid>
        {rows.map((row) => {
          const inv = row.mediaId ? invById.get(row.mediaId) : null
          const preview = inv ? clientPreview(inv) : null
          const thumbUrl = preview?.url ?? null
          const isMain = row.slot === "main"
          const def = ROLE_DEFS.find((d) => d.slot === row.slot)
          const isDragTarget = dragOverSlot === row.slot

          function handleRemove() {
            if (row.source === "explicit") {
              if (isMain) onRemoveMain?.()
              else onClearRole?.(row.slot)
            } else if (row.source === "gallery" && row.mediaId) {
              onRemoveFromGallery?.(row.mediaId)
            }
          }

          function handleDragOver(e: React.DragEvent) {
            e.preventDefault()
            e.dataTransfer.dropEffect = "copy"
            if (dragOverSlot !== row.slot) setDragOverSlot(row.slot)
          }

          function handleDragLeave(e: React.DragEvent) {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setDragOverSlot(null)
            }
          }

          function handleDrop(e: React.DragEvent) {
            e.preventDefault()
            setDragOverSlot(null)
            const mediaId = e.dataTransfer.getData("text/plain")
            if (mediaId) onSetRole?.(mediaId, row.slot)
          }

          const inGallery = row.mediaId ? gallerySet.has(row.mediaId) : false
          const autoHint =
            row.mediaId && inv
              ? inferV2VisualRole(inv, { productHandle: productHandle ?? undefined })
              : null
          const hasManualOverride =
            row.mediaId && !!(roleOverrides ?? {})[row.mediaId]
          const isDraggableFilled = row.isCovered && row.mediaId && row.source === "explicit"

          function handleFilledDragStart(e: React.DragEvent) {
            if (!row.mediaId) return
            e.dataTransfer.setData("text/plain", row.mediaId)
            e.dataTransfer.effectAllowed = "copy"
          }

          return (
            <div
              key={row.slot}
              data-v2-role-slot={row.slot}
              data-v2-role-slot-filled={row.isCovered && row.source === "explicit" ? "true" : "false"}
              data-v2-role-slot-media-id={row.mediaId ?? undefined}
              style={{
                ...styles.slot,
                ...(row.isCovered ? styles.slotFilled : styles.slotEmpty),
                ...(isMain ? styles.slotMain : {}),
                ...(isDragTarget ? styles.slotDragOver : {}),
              }}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div style={styles.slotHeader}>
                <span
                  style={{
                    ...styles.slotLabel,
                    color: row.isCovered ? "#1a3a6e" : isDragTarget ? "#1a3a6e" : "#666",
                    fontWeight: isMain ? 700 : 600,
                  }}
                >
                  {row.label}
                </span>
              </div>

              <div
                data-v2-role-slot-card-draggable={isDraggableFilled ? "true" : undefined}
                draggable={isDraggableFilled}
                onDragStart={isDraggableFilled ? handleFilledDragStart : undefined}
                style={{
                  ...styles.thumbArea,
                  ...(isMain ? styles.thumbAreaMain : {}),
                  ...(isDragTarget ? styles.thumbAreaDragOver : {}),
                  ...(isDraggableFilled ? styles.thumbAreaDraggable : {}),
                }}
                title={isDraggableFilled ? "Перетащите в другой слот или в галерею" : undefined}
              >
                {thumbUrl ? (
                  <img
                    src={thumbUrl}
                    alt={row.label}
                    style={styles.thumbImg}
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.display = "none"
                    }}
                    draggable={false}
                  />
                ) : (
                  <div style={styles.emptyThumb}>
                    <span style={styles.emptyDropIcon}>{isDragTarget ? "⊕" : "+"}</span>
                    <span style={styles.emptySlotHint}>
                      {isDragTarget ? "Отпустите здесь" : "Перетащите фото сюда"}
                    </span>
                  </div>
                )}
                {isDraggableFilled && (
                  <span style={styles.dragCorner} aria-hidden>
                    ⋮⋮
                  </span>
                )}
              </div>

              {row.isCovered && row.source === "explicit" && (
                <div style={styles.statusRow}>
                  {autoHint && !hasManualOverride && (
                    <span
                      style={
                        autoHint.confidence === "ambiguous" || autoHint.confidence === "low"
                          ? styles.autoLowBadge
                          : styles.autoBadge
                      }
                    >
                      {autoHint.confidence === "ambiguous" || autoHint.confidence === "low"
                        ? "auto?"
                        : "auto"}
                    </span>
                  )}
                  {hasManualOverride && <span style={styles.manualBadge}>ручн.</span>}
                  {!isMain &&
                    (inGallery ? (
                      <span style={styles.inGalleryPill}>
                        ✓ В витрине · {ROLE_SLOT_LABEL_RU[row.slot]}
                      </span>
                    ) : (
                      <span style={styles.notInGalleryPill}>не в витрине</span>
                    ))}
                </div>
              )}

              <div style={styles.actionsRow}>
                {row.isCovered && (onRemoveMain || onRemoveFromGallery || onClearRole) && (
                  <button
                    type="button"
                    style={styles.removeTextBtn}
                    onClick={handleRemove}
                    title={row.source === "explicit" ? "Убрать назначение" : "Убрать из галереи"}
                  >
                    × убрать
                  </button>
                )}
                <button
                  type="button"
                  style={{
                    ...styles.addBtn,
                    ...(row.isCovered ? styles.addBtnFilled : styles.addBtnEmpty),
                  }}
                  onClick={() => onFocusRole(row.slot)}
                  title={row.isCovered ? `Сменить «${def?.label}» (фильтр в пуле)` : def?.hint}
                >
                  {row.isCovered ? "↺ пул" : "+ пул"}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

const THUMB_H = 120

const styles = {
  roleBoard: {
    flexShrink: 0,
    margin: "10px 14px 0",
    padding: "14px 16px 18px",
    background: "#fff",
    border: "1px solid #d4dce8",
    borderRadius: "10px",
    boxShadow: "0 1px 4px rgba(26, 58, 110, 0.07)",
  },
  boardHeader: {
    marginBottom: "12px",
    paddingBottom: "10px",
    borderBottom: "1px solid #e8eef6",
  },
  boardTitle: {
    margin: 0,
    fontSize: "12px",
    fontWeight: 800,
    letterSpacing: "0.08em",
    color: "#1a3a6e",
    textTransform: "uppercase" as const,
    lineHeight: 1.3,
  },
  boardSubtitle: {
    margin: "6px 0 0",
    fontSize: "12px",
    color: "#5a6a8e",
    lineHeight: 1.45,
    maxWidth: "52em",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: "10px",
    alignItems: "stretch",
  },
  slot: {
    display: "flex",
    flexDirection: "column" as const,
    minHeight: "200px",
    maxWidth: "100%",
    borderRadius: "8px",
    overflow: "hidden",
    borderWidth: "2px",
    borderStyle: "solid" as const,
    borderColor: "transparent",
    background: "#fafbfc",
    transition: "box-shadow 0.12s, border-color 0.12s",
  },
  slotEmpty: {
    borderColor: "#c5ced8",
    borderStyle: "dashed" as const,
    background: "#f6f8fb",
  },
  slotFilled: {
    borderColor: "#8ab4f0",
    borderStyle: "solid" as const,
    background: "#fff",
  },
  slotMain: {
    borderColor: "#1a3a6e",
    boxShadow: "inset 0 0 0 1px rgba(26, 58, 110, 0.15)",
  },
  slotDragOver: {
    borderColor: "#1a3a6e",
    borderStyle: "solid" as const,
    background: "#e8f2ff",
    boxShadow: "0 0 0 3px rgba(26, 58, 110, 0.18)",
  },
  slotHeader: {
    padding: "8px 10px 6px",
    flexShrink: 0,
    borderBottom: "1px solid #eef1f6",
    background: "rgba(255,255,255,0.85)",
  },
  slotLabel: {
    fontSize: "12px",
    letterSpacing: "0.02em",
    lineHeight: 1.25,
  },
  thumbArea: {
    position: "relative" as const,
    width: "100%",
    height: `${THUMB_H}px`,
    minHeight: `${THUMB_H}px`,
    flex: "1 1 auto",
    background: "#eef1f6",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  thumbAreaMain: {
    background: "#e8f0ff",
  },
  thumbAreaDragOver: {
    background: "#d6e6ff",
  },
  thumbAreaDraggable: {
    cursor: "grab",
  },
  thumbImg: {
    width: "100%",
    height: "100%",
    objectFit: "contain" as const,
    display: "block",
  },
  emptyThumb: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    width: "100%",
    height: "100%",
    padding: "12px",
    boxSizing: "border-box" as const,
  },
  emptyDropIcon: {
    fontSize: "28px",
    color: "#a8b8cc",
    lineHeight: 1,
    fontWeight: 300,
  },
  emptySlotHint: {
    fontSize: "11px",
    color: "#7a8aa0",
    textAlign: "center" as const,
    lineHeight: 1.4,
    padding: "0 8px",
    fontWeight: 500,
  },
  manualBadge: {
    fontSize: "9px",
    color: "#7a4a00",
    background: "#fff3e0",
    border: "1px solid #f0d090",
    borderRadius: "3px",
    padding: "2px 5px",
    fontWeight: 700,
  },
  autoBadge: {
    fontSize: "9px",
    color: "#555",
    background: "#eee",
    borderRadius: "3px",
    padding: "2px 5px",
    fontWeight: 600,
  },
  autoLowBadge: {
    fontSize: "9px",
    color: "#7a4a00",
    background: "#fff3e0",
    border: "1px solid #f0d090",
    borderRadius: "3px",
    padding: "2px 5px",
    fontWeight: 700,
  },
  dragCorner: {
    position: "absolute" as const,
    top: "4px",
    left: "4px",
    fontSize: "10px",
    color: "rgba(26,58,110,0.55)",
    fontWeight: 700,
    lineHeight: 1,
    pointerEvents: "none" as const,
    background: "rgba(255,255,255,0.75)",
    borderRadius: "3px",
    padding: "2px 4px",
  },
  statusRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    alignItems: "center",
    gap: "4px",
    padding: "6px 8px",
    minHeight: "28px",
    background: "#f8fafc",
    borderTop: "1px solid #eef1f6",
    flexShrink: 0,
  },
  notInGalleryPill: {
    fontSize: "10px",
    color: "#8a5a00",
    fontWeight: 600,
  },
  actionsRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "6px",
    padding: "6px 8px 8px",
    flexShrink: 0,
    background: "#fff",
    borderTop: "1px solid #eef1f6",
  },
  removeTextBtn: {
    padding: "3px 6px",
    fontSize: "11px",
    border: "1px solid #e8c4c4",
    borderRadius: "4px",
    background: "#fff5f5",
    color: "#a33",
    cursor: "pointer",
    fontWeight: 600,
    lineHeight: 1.2,
    flexShrink: 0,
  },
  addBtn: {
    padding: "4px 8px",
    borderRadius: "4px",
    borderWidth: "1px",
    borderStyle: "solid" as const,
    cursor: "pointer",
    fontSize: "11px",
    fontWeight: 600,
    lineHeight: 1.2,
    flexShrink: 0,
  },
  addBtnEmpty: {
    borderColor: "#c5ced8",
    background: "#fff",
    color: "#6a7a90",
  },
  addBtnFilled: {
    borderColor: "#aacaff",
    background: "#eef4ff",
    color: "#1a3a6e",
  },
  toGalleryBtn: {
    padding: "4px 8px",
    fontSize: "11px",
    border: "1px solid #9ccc9c",
    borderRadius: "4px",
    background: "#f0fff0",
    color: "#1b5e20",
    cursor: "pointer",
    fontWeight: 600,
    lineHeight: 1.2,
    flexShrink: 0,
  },
  inGalleryPill: {
    padding: "2px 6px",
    fontSize: "10px",
    border: "1px solid #2d7a2d",
    borderRadius: "4px",
    background: "#e8f5e9",
    color: "#1b5e20",
    fontWeight: 700,
    lineHeight: 1.25,
    flexShrink: 0,
  },
} as const
