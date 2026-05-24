"use client"

import { useMemo, useState } from "react"
import type { InvItem, V2ProductState, V2RoleSlot, V2RoleRow, V2RoleFilter } from "./legacy-board-v2-types"
import { classifyVisualRole } from "@/app/qa/legacy-media-assignment-board/legacy-media-visual-role-ranking"
import type { VisualRole } from "@/app/qa/legacy-media-assignment-board/legacy-media-visual-role-ranking"
import { clientPreview } from "./MediaCardV2"

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
    // Prefer operator role override over auto-classification
    const override = overrides[mediaId]
    const slot = override ?? visualRoleToSlot(classifyVisualRole(inv))
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
  /** Assign media to a specific role slot via drag & drop or picker */
  onSetRole?: (mediaId: string, slot: V2RoleSlot) => void
  /** Clear an explicit slot assignment */
  onClearRole?: (slot: V2RoleSlot) => void
  /** Operator role overrides to use when computing gallery fallback */
  roleOverrides?: Record<string, V2RoleSlot>
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
}: Props) {
  const [dragOverSlot, setDragOverSlot] = useState<V2RoleSlot | null>(null)

  const rows = useMemo(
    () => computeRoleRows(productState, activeVariantKey, invById, roleOverrides),
    [productState, activeVariantKey, invById, roleOverrides]
  )

  return (
    <div style={styles.panel}>
      {/* Help banner */}
      <div style={styles.helpBanner}>
        <span style={styles.helpIcon}>↕</span>
        <span style={styles.helpText}>
          Перетащите фото из пула в слот роли или нажмите «+» для фокуса в пуле
        </span>
      </div>

      <div style={styles.sectionLabel}>Слоты ролей</div>
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
            // Only clear when mouse leaves the slot entirely, not just a child
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

          return (
            <div
              key={row.slot}
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
              {/* Thumbnail area */}
              <div
                style={{
                  ...styles.thumbArea,
                  ...(isMain ? styles.thumbAreaMain : {}),
                  ...(isDragTarget ? styles.thumbAreaDragOver : {}),
                }}
              >
                {thumbUrl ? (
                  <img
                    src={thumbUrl}
                    alt={row.label}
                    style={styles.thumbImg}
                    loading="lazy"
                    onError={(e) => { e.currentTarget.style.display = "none" }}
                  />
                ) : (
                  <div style={styles.emptyThumb}>
                    <span style={styles.emptyDropIcon}>{isDragTarget ? "⊕" : "+"}</span>
                    <span style={styles.emptySlotHint}>
                      {isDragTarget ? "Отпустите здесь" : "Перетащите фото сюда"}
                    </span>
                  </div>
                )}

                {/* Source badge — explicit vs gallery-inferred */}
                {row.isCovered && (
                  <span style={row.source === "explicit" ? styles.sourceBadgeExplicit : styles.sourceBadgeGallery}>
                    {row.source === "explicit" ? "✱" : "◇"}
                  </span>
                )}

                {/* Remove button for filled slots */}
                {row.isCovered && (onRemoveMain || onRemoveFromGallery || onClearRole) && (
                  <button
                    style={styles.removeBtn}
                    onClick={handleRemove}
                    title={row.source === "explicit" ? "Убрать назначение" : "Убрать из галереи"}
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Label row */}
              <div style={styles.slotBottom}>
                <span
                  style={{
                    ...styles.slotLabel,
                    color: row.isCovered ? "#1a3a6e" : isDragTarget ? "#1a3a6e" : "#aaa",
                    fontWeight: isMain ? 700 : 600,
                  }}
                >
                  {row.label}
                </span>
                <button
                  style={{
                    ...styles.addBtn,
                    ...(row.isCovered ? styles.addBtnFilled : styles.addBtnEmpty),
                  }}
                  onClick={() => onFocusRole(row.slot)}
                  title={row.isCovered ? `Сменить «${def?.label}» (фильтр в пуле)` : def?.hint}
                >
                  {row.isCovered ? "↺" : "+"}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const styles = {
  panel: {
    borderBottom: "1px solid #eee",
    flexShrink: 0,
    background: "#fff",
  },
  helpBanner: {
    display: "flex",
    alignItems: "center",
    gap: "7px",
    padding: "5px 14px",
    background: "#f5f8ff",
    borderBottom: "1px solid #dde8ff",
    flexShrink: 0,
  },
  helpIcon: {
    fontSize: "14px",
    color: "#6688bb",
    flexShrink: 0,
    lineHeight: 1,
  },
  helpText: {
    fontSize: "11px",
    color: "#4a6a9e",
    lineHeight: 1.4,
  },
  sectionLabel: {
    padding: "7px 14px 3px",
    fontSize: "10px",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    color: "#888",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
    gap: "8px",
    padding: "4px 14px 12px",
  },
  slot: {
    display: "flex",
    flexDirection: "column" as const,
    borderRadius: "6px",
    overflow: "hidden",
    border: "2px solid",
    position: "relative" as const,
    transition: "transform 0.08s, box-shadow 0.08s",
  },
  slotEmpty: {
    borderColor: "#cecece",
    borderStyle: "dashed" as const,
    background: "#f7f7f7",
  },
  slotFilled: {
    borderColor: "#aacaff",
    borderStyle: "solid" as const,
    background: "#fff",
  },
  slotMain: {
    borderColor: "#1a3a6e",
    boxShadow: "0 0 0 1px rgba(26,58,110,0.12)",
  },
  slotDragOver: {
    borderColor: "#1a3a6e",
    borderStyle: "solid" as const,
    background: "#e0ecff",
    boxShadow: "0 0 0 3px rgba(26,58,110,0.22)",
    transform: "scale(1.03)",
  },
  thumbArea: {
    position: "relative" as const,
    width: "100%",
    aspectRatio: "1",
    background: "#f5f5f5",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  thumbAreaMain: {
    background: "#eef3ff",
  },
  thumbAreaDragOver: {
    background: "#d0e4ff",
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
    gap: "5px",
    width: "100%",
    height: "100%",
    padding: "6px",
    boxSizing: "border-box" as const,
  },
  emptyDropIcon: {
    fontSize: "16px",
    color: "#c8c8c8",
    lineHeight: 1,
  },
  emptySlotHint: {
    fontSize: "9px",
    color: "#bbb",
    textAlign: "center" as const,
    lineHeight: 1.35,
    padding: "0 4px",
    wordBreak: "break-word" as const,
  },
  sourceBadgeExplicit: {
    position: "absolute" as const,
    bottom: "4px",
    right: "4px",
    fontSize: "9px",
    color: "#fff",
    background: "rgba(26,58,110,0.8)",
    borderRadius: "2px",
    padding: "1px 3px",
    fontWeight: 700,
    lineHeight: 1,
    zIndex: 2,
  },
  sourceBadgeGallery: {
    position: "absolute" as const,
    bottom: "4px",
    right: "4px",
    fontSize: "9px",
    color: "#fff",
    background: "rgba(45,122,45,0.75)",
    borderRadius: "2px",
    padding: "1px 3px",
    fontWeight: 700,
    lineHeight: 1,
    zIndex: 2,
  },
  removeBtn: {
    position: "absolute" as const,
    top: "4px",
    right: "4px",
    width: "20px",
    height: "20px",
    borderRadius: "50%",
    border: "1px solid rgba(0,0,0,0.15)",
    background: "rgba(255,255,255,0.9)",
    fontSize: "14px",
    cursor: "pointer",
    color: "#a33",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    lineHeight: 1,
    fontWeight: 700,
    zIndex: 3,
  },
  slotBottom: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "4px 6px 5px",
    gap: "4px",
    minHeight: "28px",
  },
  slotLabel: {
    fontSize: "10px",
    letterSpacing: "0.01em",
    lineHeight: 1.2,
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  addBtn: {
    width: "20px",
    height: "20px",
    borderRadius: "3px",
    border: "1px solid",
    cursor: "pointer",
    fontSize: "11px",
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    flexShrink: 0,
    lineHeight: 1,
  },
  addBtnEmpty: {
    borderColor: "#ddd",
    background: "#fff",
    color: "#bbb",
  },
  addBtnFilled: {
    borderColor: "#aacaff",
    background: "#e8f0ff",
    color: "#1a3a6e",
  },
} as const
