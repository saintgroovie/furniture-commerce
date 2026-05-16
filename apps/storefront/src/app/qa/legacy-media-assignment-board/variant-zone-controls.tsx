"use client"

import type { CSSProperties, MouseEvent, ReactNode } from "react"
import type { LegacyMediaDragZone } from "./legacy-media-board-types"

type ActionSource = "button" | "assigned-button" | "manual" | "drag" | "selected-product-default"

export const compactCtrlRow: CSSProperties = {
  display: "flex",
  gap: 4,
  marginTop: 6,
  flexWrap: "wrap",
  alignItems: "center",
}

type ShieldBtn = {
  draggable: false
  onMouseDown: (e: MouseEvent) => void
  onDragStart: (e: React.DragEvent) => void
}

type Props = {
  zone: LegacyMediaDragZone
  id: string
  handle: string
  vk: string
  gi: number
  assignSrc: ActionSource
  shieldBtn: ShieldBtn
  stopCardClick: (fn: () => void) => (e: MouseEvent) => void
  chipBtn: CSSProperties
  miniBtn: CSSProperties
  btnDangerChip: CSSProperties
  onInspect: () => void
  onApply: (src: ActionSource, zone: "primary" | "gallery" | "reference" | "lane_reject" | "unassigned", from: LegacyMediaDragZone) => void
  onUpdateGallery: (fn: (prev: { gallery: string[]; primary: string | null } & Record<string, unknown>) => { gallery: string[]; primary: string | null } & Record<string, unknown>) => void
  onSetPrimaryFromGallery: () => void
  /** When true, hide set-primary actions (already the variant primary). */
  isCurrentPrimary?: boolean
}

const primaryBadgeStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  padding: "3px 8px",
  borderRadius: 6,
  background: "#dbeafe",
  color: "#1e40af",
  border: "1px solid #93c5fd",
  letterSpacing: "0.02em",
  whiteSpace: "nowrap",
}

function MoreMenu({ children }: { children: ReactNode }) {
  return (
    <details style={{ display: "inline-block" }}>
      <summary style={{ listStyle: "none", cursor: "pointer" }} title="More actions">
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: 6,
            border: "1px solid #cbd5e1",
            background: "#fff",
            fontSize: 14,
            fontWeight: 700,
            color: "#475569",
          }}
        >
          ⋯
        </span>
      </summary>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4, minWidth: 148, padding: "4px 0" }}>{children}</div>
    </details>
  )
}

export function VariantZoneControls(p: Props) {
  const {
    zone,
    id,
    shieldBtn,
    stopCardClick,
    chipBtn,
    miniBtn,
    btnDangerChip,
    assignSrc,
    onInspect,
    onApply,
    onUpdateGallery,
    onSetPrimaryFromGallery,
    isCurrentPrimary = false,
  } = p

  const setPrimaryFromGalleryBtn = (compact: boolean) => (
    <button
      type="button"
      data-action-button={compact ? "gallery-set-primary" : "gallery-set-primary-more"}
      style={compact ? { ...chipBtn, whiteSpace: "nowrap" } : miniBtn}
      title="Сделать главным фото"
      aria-label="Сделать главным фото"
      {...shieldBtn}
      onClick={stopCardClick(onSetPrimaryFromGallery)}
    >
      {compact ? "★ Главное" : "Сделать главным"}
    </button>
  )

  if (zone === "primary") {
    return (
      <div style={compactCtrlRow} data-variant-zone-controls="primary">
        <span data-primary-badge="true" style={primaryBadgeStyle}>
          Главное фото
        </span>
        <button type="button" data-action-button="primary-to-gallery" style={chipBtn} title="В галерею" {...shieldBtn} onClick={stopCardClick(() => onApply(assignSrc, "gallery", "primary"))}>
          В галерею
        </button>
        <button type="button" data-action-button="primary-return" style={chipBtn} title="Убрать" {...shieldBtn} onClick={stopCardClick(() => onApply(assignSrc, "unassigned", "primary"))}>
          ✕
        </button>
        <button type="button" data-action-button="assigned-details" style={chipBtn} title="Детали" {...shieldBtn} onClick={stopCardClick(onInspect)}>
          Детали
        </button>
        <MoreMenu>
          <button type="button" style={miniBtn} title="Move to Reference" {...shieldBtn} onClick={stopCardClick(() => onApply(assignSrc, "reference", "primary"))}>
            Reference
          </button>
          <button type="button" style={btnDangerChip} title="Reject for this product" {...shieldBtn} onClick={stopCardClick(() => onApply(assignSrc, "lane_reject", "primary"))}>
            Reject
          </button>
        </MoreMenu>
      </div>
    )
  }

  if (zone === "gallery") {
    return (
      <div style={compactCtrlRow} data-variant-zone-controls="gallery">
        <button type="button" data-action-button="gallery-move-left" style={chipBtn} title="Move left" {...shieldBtn} onClick={stopCardClick(() => onUpdateGallery((prev) => {
          const idx = prev.gallery.indexOf(id)
          if (idx <= 0) return prev
          const next = [...prev.gallery]
          ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
          return { ...prev, gallery: next }
        }))}>
          ←
        </button>
        <button type="button" data-action-button="gallery-move-right" style={chipBtn} title="Move right" {...shieldBtn} onClick={stopCardClick(() => onUpdateGallery((prev) => {
          const idx = prev.gallery.indexOf(id)
          if (idx < 0 || idx >= prev.gallery.length - 1) return prev
          const next = [...prev.gallery]
          ;[next[idx + 1], next[idx]] = [next[idx], next[idx + 1]]
          return { ...prev, gallery: next }
        }))}>
          →
        </button>
        {!isCurrentPrimary ? setPrimaryFromGalleryBtn(true) : null}
        <button type="button" data-action-button="gallery-remove" style={chipBtn} title="Убрать из галереи" {...shieldBtn} onClick={stopCardClick(() => onUpdateGallery((prev) => ({ ...prev, gallery: prev.gallery.filter((x) => x !== id) })))}>
          ✕
        </button>
        <MoreMenu>
          {!isCurrentPrimary ? setPrimaryFromGalleryBtn(false) : null}
          <button type="button" style={miniBtn} title="Move first" {...shieldBtn} onClick={stopCardClick(() => onUpdateGallery((prev) => ({ ...prev, gallery: [id, ...prev.gallery.filter((x) => x !== id)] })))}>
            Move first
          </button>
          <button type="button" style={miniBtn} title="Move last" {...shieldBtn} onClick={stopCardClick(() => onUpdateGallery((prev) => ({ ...prev, gallery: [...prev.gallery.filter((x) => x !== id), id] })))}>
            Move last
          </button>
          <button type="button" style={miniBtn} title="Reference" {...shieldBtn} onClick={stopCardClick(() => onApply(assignSrc, "reference", "gallery"))}>
            Reference
          </button>
          <button type="button" style={btnDangerChip} title="Reject" {...shieldBtn} onClick={stopCardClick(() => onApply(assignSrc, "lane_reject", "gallery"))}>
            Reject
          </button>
          <button type="button" style={miniBtn} title="Return to pool" {...shieldBtn} onClick={stopCardClick(() => onApply(assignSrc, "unassigned", "gallery"))}>
            Return
          </button>
          <button type="button" style={miniBtn} title="Inspect" {...shieldBtn} onClick={stopCardClick(onInspect)}>
            Inspect
          </button>
        </MoreMenu>
      </div>
    )
  }

  return (
    <div style={compactCtrlRow} data-variant-zone-controls={zone}>
      <MoreMenu>
        <button
          type="button"
          style={miniBtn}
          title="Сделать главным фото"
          aria-label="Сделать главным фото"
          {...shieldBtn}
          onClick={stopCardClick(() => onApply(assignSrc, "primary", zone))}
        >
          Сделать главным
        </button>
        <button type="button" style={miniBtn} title="Gallery" {...shieldBtn} onClick={stopCardClick(() => onApply(assignSrc, "gallery", zone))}>
          Gallery
        </button>
        <button type="button" style={miniBtn} title="Return" {...shieldBtn} onClick={stopCardClick(() => onApply(assignSrc, "unassigned", zone))}>
          Return
        </button>
        <button type="button" style={miniBtn} title="Inspect" {...shieldBtn} onClick={stopCardClick(onInspect)}>
          Inspect
        </button>
      </MoreMenu>
    </div>
  )
}
