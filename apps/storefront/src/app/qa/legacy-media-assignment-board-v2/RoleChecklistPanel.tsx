"use client"

import { useMemo } from "react"
import type { InvItem, V2ProductState, V2RoleSlot, V2RoleRow, V2RoleFilter } from "./legacy-board-v2-types"
import { classifyVisualRole } from "@/app/qa/legacy-media-assignment-board/legacy-media-visual-role-ranking"
import type { VisualRole } from "@/app/qa/legacy-media-assignment-board/legacy-media-visual-role-ranking"
import { clientPreview } from "./MediaCardV2"

const ROLE_DEFS: ReadonlyArray<{ slot: V2RoleSlot; label: string; filter: V2RoleFilter }> = [
  { slot: "main", label: "Главное", filter: "front" },
  { slot: "front_anfas", label: "Анфас", filter: "front" },
  { slot: "front_3_4", label: "3/4", filter: "3_4" },
  { slot: "interior", label: "Внутри", filter: "interior" },
  { slot: "detail", label: "Деталь", filter: "detail" },
  { slot: "lifestyle", label: "Lifestyle", filter: "lifestyle" },
  { slot: "scheme", label: "Схема", filter: "scheme" },
]

function visualRoleToSlot(vr: VisualRole): V2RoleSlot | null {
  if (vr === "closed_front" || vr === "hero_front" || vr === "front_anfas") return "front_anfas"
  if (vr === "front_3_4") return "front_3_4"
  if (vr === "interior") return "interior"
  if (vr === "detail") return "detail"
  if (vr === "lifestyle") return "lifestyle"
  if (vr === "scheme") return "scheme"
  return null
}

function computeRoleRows(
  productState: V2ProductState | null,
  variantKey: string,
  invById: Map<string, InvItem>
): V2RoleRow[] {
  const roles = productState?.rolesByVariant[variantKey] ?? {}
  const gallery = productState?.galleriesByVariant[variantKey] ?? []

  // Pre-classify gallery items → first mediaId per slot
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
}

export function RoleChecklistPanel({ productState, activeVariantKey, invById, onFocusRole }: Props) {
  const rows = useMemo(
    () => computeRoleRows(productState, activeVariantKey, invById),
    [productState, activeVariantKey, invById]
  )

  return (
    <div style={styles.panel}>
      <div style={styles.sectionLabel}>Чеклист ролей</div>
      {rows.map((row) => {
        const inv = row.mediaId ? invById.get(row.mediaId) : null
        const preview = inv ? clientPreview(inv) : null
        const thumbUrl = preview?.url ?? null
        return (
          <div key={row.slot} style={styles.row}>
            <span style={{ ...styles.statusDot, color: row.isCovered ? "#2d7a2d" : "#ccc" }}>
              {row.isCovered ? "✓" : "○"}
            </span>
            {thumbUrl ? (
              <img
                src={thumbUrl}
                alt={row.label}
                style={styles.thumb}
                loading="lazy"
                onError={(e) => { e.currentTarget.style.display = "none" }}
              />
            ) : (
              <div style={{ ...styles.thumb, background: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: "10px", color: "#ccc" }}>–</span>
              </div>
            )}
            <span style={{ ...styles.roleLabel, color: row.isCovered ? "#222" : "#999" }}>
              {row.label}
            </span>
            <button
              style={styles.addBtn}
              onClick={() => onFocusRole(row.slot)}
              title={`Фильтровать пул по роли «${row.label}»`}
            >
              {row.isCovered ? "↺" : "+ Add"}
            </button>
          </div>
        )
      })}
    </div>
  )
}

export { computeRoleRows, visualRoleToSlot }

const styles = {
  panel: {
    borderBottom: "1px solid #eee",
    flexShrink: 0,
  },
  sectionLabel: {
    padding: "6px 14px 4px",
    fontSize: "10px",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    color: "#888",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "5px 14px",
    borderTop: "1px solid #f5f5f5",
  },
  statusDot: {
    fontSize: "14px",
    width: "16px",
    textAlign: "center" as const,
    flexShrink: 0,
  },
  thumb: {
    width: "32px",
    height: "32px",
    objectFit: "contain" as const,
    borderRadius: "3px",
    border: "1px solid #eee",
    flexShrink: 0,
    background: "#fafafa",
  },
  roleLabel: {
    flex: 1,
    fontSize: "12px",
  },
  addBtn: {
    fontSize: "10px",
    padding: "2px 7px",
    border: "1px solid #ccc",
    borderRadius: "3px",
    background: "#fff",
    cursor: "pointer",
    color: "#555",
    flexShrink: 0,
  },
} as const
