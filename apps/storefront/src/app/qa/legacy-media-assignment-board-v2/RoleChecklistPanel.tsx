"use client"

import { useMemo } from "react"
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
  invById: Map<string, InvItem>
): V2RoleRow[] {
  const roles = productState?.rolesByVariant[variantKey] ?? {}
  const gallery = productState?.galleriesByVariant[variantKey] ?? []

  const galleryBySlot = new Map<V2RoleSlot, string>()
  for (const mediaId of gallery) {
    const inv = invById.get(mediaId)
    if (!inv) continue
    const vr = classifyVisualRole(inv)
    const slot = visualRoleToSlot(vr)
    if (slot && !galleryBySlot.has(slot)) galleryBySlot.set(slot, mediaId)
  }

  return ROLE_DEFS.map(({ slot, label }) => {
    const explicit = (roles[slot] as string | null | undefined) ?? null
    if (explicit) return { slot, label, mediaId: explicit, isCovered: true }
    const fromGallery = galleryBySlot.get(slot) ?? null
    return { slot, label, mediaId: fromGallery, isCovered: fromGallery !== null }
  })
}

type Props = {
  productState: V2ProductState | null
  activeVariantKey: string
  invById: Map<string, InvItem>
  onFocusRole: (slot: V2RoleSlot) => void
  onRemoveMain?: () => void
  onRemoveFromGallery?: (mediaId: string) => void
}

export function RoleChecklistPanel({
  productState,
  activeVariantKey,
  invById,
  onFocusRole,
  onRemoveMain,
  onRemoveFromGallery,
}: Props) {
  const rows = useMemo(
    () => computeRoleRows(productState, activeVariantKey, invById),
    [productState, activeVariantKey, invById]
  )

  return (
    <div style={styles.panel}>
      <div style={styles.sectionLabel}>Слоты ролей</div>
      <div style={styles.grid}>
        {rows.map((row) => {
          const inv = row.mediaId ? invById.get(row.mediaId) : null
          const preview = inv ? clientPreview(inv) : null
          const thumbUrl = preview?.url ?? null
          const isMain = row.slot === "main"
          const def = ROLE_DEFS.find((d) => d.slot === row.slot)

          function handleRemove() {
            if (isMain) onRemoveMain?.()
            else if (row.mediaId) onRemoveFromGallery?.(row.mediaId)
          }

          return (
            <div
              key={row.slot}
              style={{
                ...styles.slot,
                ...(row.isCovered ? styles.slotFilled : styles.slotEmpty),
                ...(isMain ? styles.slotMain : {}),
              }}
            >
              {/* Thumbnail area — the visual focal point */}
              <div
                style={{
                  ...styles.thumbArea,
                  ...(isMain ? styles.thumbAreaMain : {}),
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
                    <span style={styles.emptyPlusIcon}>+</span>
                    <span style={styles.emptySlotHint}>{def?.hint ?? row.label}</span>
                  </div>
                )}

                {/* Remove button for filled slots */}
                {row.isCovered && (onRemoveMain || onRemoveFromGallery) && (
                  <button
                    style={styles.removeBtn}
                    onClick={handleRemove}
                    title="Убрать назначение"
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
                    color: row.isCovered ? "#1a3a6e" : "#aaa",
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
                  title={def?.hint}
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
  sectionLabel: {
    padding: "8px 14px 4px",
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
  emptyPlusIcon: {
    fontSize: "16px",
    color: "#d8d8d8",
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
