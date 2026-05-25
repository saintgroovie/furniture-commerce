"use client"

import { useMemo, useState } from "react"
import type { InvItem, V2ProductState, V2RoleSlot, V2RoleRow, V2RoleFilter } from "./legacy-board-v2-types"
import type { VisualRole } from "@/app/qa/legacy-media-assignment-board/legacy-media-visual-role-ranking"
import { clientPreview } from "./MediaCardV2"
import {
  effectiveV2RoleSlot,
  inferV2VisualRole,
} from "./legacy-board-v2-role-inference"

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
  const gallery = productState?.galleriesByVariant[variantKey] ?? []

  const galleryBySlot = new Map<V2RoleSlot, string>()
  for (const mediaId of gallery) {
    const inv = invById.get(mediaId)
    if (!inv) continue
    const slot = effectiveV2RoleSlot(inv, overrides)
    if (slot && !galleryBySlot.has(slot)) galleryBySlot.set(slot, mediaId)
  }

  return ROLE_DEFS.map(({ slot, label }) => {
    const explicit = (roles[slot] as string | null | undefined) ?? null
    if (explicit) return { slot, label, mediaId: explicit, isCovered: true, source: "explicit" as const }
    const fromGallery = galleryBySlot.get(slot) ?? null
    if (fromGallery) return { slot, label, mediaId: fromGallery, isCovered: true, source: "gallery" as const }
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
    <section style={styles.roleBoard} data-v2-role-board>
      <header style={styles.boardHeader}>
        <h2 style={styles.boardTitle}>СЛОТЫ РОЛЕЙ</h2>
        <p style={styles.boardSubtitle}>
          Заполните роли — витрина обновится автоматически. «+ пул» открывает фильтр в правой
          колонке.
        </p>
      </header>

      <div style={styles.grid}>
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
                  <span style={styles.dragAffordance}>перетащить</span>
                )}

                {row.isCovered && (onRemoveMain || onRemoveFromGallery || onClearRole) && (
                  <button
                    type="button"
                    style={styles.removeBtn}
                    onClick={handleRemove}
                    title={row.source === "explicit" ? "Убрать назначение" : "Убрать из галереи"}
                  >
                    ×
                  </button>
                )}

                {row.isCovered && row.source !== "none" && (
                  <div style={styles.badgeStrip}>
                    <span style={styles.badgeStripLeft}>
                      {row.source === "explicit" && autoHint && !hasManualOverride && (
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
                      {row.source === "explicit" && hasManualOverride && (
                        <span style={styles.manualBadge}>ручн.</span>
                      )}
                      {row.source === "gallery" && (
                        <span style={styles.sourceBadgeGallery}>из гал.</span>
                      )}
                      {row.source === "explicit" && !hasManualOverride && (
                        <span style={styles.sourceBadgeExplicit}>слот</span>
                      )}
                    </span>
                  </div>
                )}
              </div>

              <div style={styles.slotFooter}>
                {row.source === "explicit" && row.mediaId && !isMain && (
                  inGallery ? (
                    <span style={styles.inGalleryPill}>✓ В витрине</span>
                  ) : onAddToGallery ? (
                    <button
                      type="button"
                      style={styles.toGalleryBtn}
                      onClick={() => onAddToGallery(row.mediaId!)}
                      title="Добавить в витрину вручную (роль уже назначена)"
                    >
                      в витрину
                    </button>
                  ) : null
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

const THUMB_H = 128

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
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: "12px",
    alignItems: "stretch",
  },
  slot: {
    display: "flex",
    flexDirection: "column" as const,
    minHeight: "190px",
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
  badgeStrip: {
    position: "absolute" as const,
    left: 0,
    right: 0,
    bottom: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "4px 6px",
    background: "linear-gradient(transparent, rgba(0,0,0,0.45))",
    pointerEvents: "none" as const,
  },
  badgeStripLeft: {
    display: "flex",
    gap: "4px",
    flexWrap: "wrap" as const,
  },
  sourceBadgeExplicit: {
    fontSize: "9px",
    color: "#fff",
    background: "rgba(26,58,110,0.9)",
    borderRadius: "3px",
    padding: "2px 5px",
    fontWeight: 700,
    lineHeight: 1.2,
  },
  sourceBadgeGallery: {
    fontSize: "9px",
    color: "#fff",
    background: "rgba(45,122,45,0.9)",
    borderRadius: "3px",
    padding: "2px 5px",
    fontWeight: 700,
    lineHeight: 1.2,
  },
  manualBadge: {
    fontSize: "9px",
    color: "#fff",
    background: "rgba(180,100,0,0.95)",
    borderRadius: "3px",
    padding: "2px 5px",
    fontWeight: 700,
  },
  autoBadge: {
    fontSize: "9px",
    color: "#fff",
    background: "rgba(70,70,70,0.85)",
    borderRadius: "3px",
    padding: "2px 5px",
    fontWeight: 600,
  },
  autoLowBadge: {
    fontSize: "9px",
    color: "#fff",
    background: "rgba(180,100,0,0.9)",
    borderRadius: "3px",
    padding: "2px 5px",
    fontWeight: 700,
  },
  removeBtn: {
    position: "absolute" as const,
    top: "6px",
    right: "6px",
    width: "24px",
    height: "24px",
    borderRadius: "50%",
    border: "1px solid rgba(0,0,0,0.12)",
    background: "rgba(255,255,255,0.95)",
    fontSize: "15px",
    cursor: "pointer",
    color: "#a33",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    lineHeight: 1,
    fontWeight: 700,
    zIndex: 3,
    boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
  },
  dragAffordance: {
    position: "absolute" as const,
    top: "6px",
    left: "6px",
    fontSize: "9px",
    color: "#fff",
    background: "rgba(26,58,110,0.88)",
    borderRadius: "4px",
    padding: "3px 6px",
    fontWeight: 700,
    zIndex: 2,
    lineHeight: 1.2,
    pointerEvents: "none" as const,
  },
  slotFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "wrap" as const,
    gap: "6px",
    padding: "8px 8px 9px",
    flexShrink: 0,
    background: "#f8fafc",
    borderTop: "1px solid #eef1f6",
    minHeight: "36px",
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
    padding: "4px 8px",
    fontSize: "11px",
    border: "1px solid #2d7a2d",
    borderRadius: "4px",
    background: "#e8f5e9",
    color: "#1b5e20",
    fontWeight: 700,
    lineHeight: 1.2,
    flexShrink: 0,
  },
} as const
