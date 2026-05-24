"use client"

import { useState } from "react"
import type { InvItem } from "./legacy-board-v2-types"
import { classifyVisualRole, VISUAL_ROLE_BADGE_RU } from "@/app/qa/legacy-media-assignment-board/legacy-media-visual-role-ranking"
import { clientPreview } from "./MediaCardV2"

/**
 * Custom drag MIME type that identifies a gallery-item reorder drag.
 * Exported so FinalMediaOrderBlock (ProductWorkspace.tsx) can use the same type,
 * enabling cross-component gallery reorder without conflicts with media-pool drags.
 * Pool cards only set `text/plain`; gallery items set BOTH so they can still be
 * dropped onto role slots.
 */
export const GALLERY_DRAG_TYPE = "application/x-gallery-item"

// ---------------------------------------------------------------------------
// GalleryItem
// ---------------------------------------------------------------------------

type GalleryItemProps = {
  mediaId: string
  inv: InvItem
  index: number
  isDragging: boolean
  isDragOver: boolean
  onRemove: (mediaId: string) => void
  onDragStart: (e: React.DragEvent, mediaId: string, idx: number) => void
  onDragOver: (e: React.DragEvent, idx: number) => void
  onDragLeave: (e: React.DragEvent, idx: number) => void
  onDrop: (e: React.DragEvent, toIdx: number) => void
  onDragEnd: () => void
}

function GalleryItem({
  mediaId,
  inv,
  index,
  isDragging,
  isDragOver,
  onRemove,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: GalleryItemProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const preview = clientPreview(inv)
  const role = classifyVisualRole(inv)
  const roleLabel = VISUAL_ROLE_BADGE_RU[role] ?? "?"
  const showImg = preview.url !== null && !imgFailed
  const shortname = inv.filename.length > 20 ? inv.filename.slice(0, 17) + "…" : inv.filename

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, mediaId, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDragLeave={(e) => onDragLeave(e, index)}
      onDrop={(e) => onDrop(e, index)}
      onDragEnd={onDragEnd}
      style={{
        ...styles.item,
        ...(isDragging ? styles.itemDragging : {}),
        ...(isDragOver ? styles.itemDragOver : {}),
      }}
    >
      <div
        style={{
          ...styles.thumb,
          ...(isDragOver ? styles.thumbDragOver : {}),
        }}
      >
        {showImg ? (
          <img
            src={preview.url!}
            alt={inv.filename}
            style={styles.img}
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div style={styles.noImg}>
            <span style={{ fontSize: "18px", color: "#ddd" }}>–</span>
          </div>
        )}
        <button
          style={styles.removeBtn}
          onClick={() => onRemove(mediaId)}
          title="Убрать из галереи"
          aria-label="Убрать"
        >
          ×
        </button>
        {/* Left-edge insert indicator shown on the drop target */}
        {isDragOver && <div style={styles.insertIndicator} />}
      </div>
      <div style={styles.meta}>
        <span style={styles.roleBadge}>{roleLabel}</span>
        <span style={styles.fname} title={inv.filename}>{shortname}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// GalleryStrip
// ---------------------------------------------------------------------------

type Props = {
  galleryIds: string[]
  invById: Map<string, InvItem>
  onRemove: (mediaId: string) => void
  /** When provided, enables drag-and-drop reorder within the strip */
  onReorderGallery?: (fromIdx: number, toIdx: number) => void
}

export function GalleryStrip({ galleryIds, invById, onRemove, onReorderGallery }: Props) {
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  function handleDragStart(e: React.DragEvent, mediaId: string, idx: number) {
    // text/plain keeps role-slot drop compatibility (gallery item → role slot still works)
    e.dataTransfer.setData("text/plain", mediaId)
    e.dataTransfer.setData(GALLERY_DRAG_TYPE, String(idx))
    e.dataTransfer.effectAllowed = "move"
    setDragFromIdx(idx)
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    if (!Array.from(e.dataTransfer.types).includes(GALLERY_DRAG_TYPE)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDragOverIdx(idx)
  }

  function handleDragLeave(e: React.DragEvent, idx: number) {
    // Only clear if the pointer is truly leaving this item (not moving to a child).
    // By the time dragLeave fires on item A, dragOver has already set dragOverIdx to
    // item B's index — so the check `dragOverIdx === idx` prevents flickering.
    if (dragOverIdx === idx && !e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverIdx(null)
    }
  }

  function handleDrop(e: React.DragEvent, toIdx: number) {
    e.preventDefault()
    const fromStr = e.dataTransfer.getData(GALLERY_DRAG_TYPE)
    setDragOverIdx(null)
    setDragFromIdx(null)
    if (!fromStr) return
    const fromIdx = parseInt(fromStr, 10)
    if (!isNaN(fromIdx) && fromIdx !== toIdx) {
      onReorderGallery?.(fromIdx, toIdx)
    }
  }

  function handleDragEnd() {
    setDragFromIdx(null)
    setDragOverIdx(null)
  }

  if (galleryIds.length === 0) return null

  return (
    <div style={styles.strip}>
      <div style={styles.header}>
        <span style={styles.label}>Галерея</span>
        <span style={styles.count}>{galleryIds.length} фото</span>
        {onReorderGallery && (
          <span style={styles.reorderHint}>↕ перетащите для изменения порядка</span>
        )}
      </div>
      <div style={styles.scroll}>
        {galleryIds.map((mediaId, idx) => {
          const inv = invById.get(mediaId)
          if (!inv) return null
          return (
            <GalleryItem
              key={mediaId}
              mediaId={mediaId}
              inv={inv}
              index={idx}
              isDragging={dragFromIdx === idx}
              // Don't show drag-over on the item being dragged itself
              isDragOver={dragOverIdx === idx && dragFromIdx !== idx}
              onRemove={onRemove}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            />
          )
        })}
      </div>
    </div>
  )
}

const styles = {
  strip: {
    borderBottom: "1px solid #eee",
    flexShrink: 0,
    background: "#fff",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 14px 4px",
  },
  label: {
    fontSize: "10px",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    color: "#888",
  },
  count: {
    fontSize: "10px",
    background: "#e0eecc",
    color: "#335500",
    borderRadius: "8px",
    padding: "1px 6px",
    fontWeight: 600,
  },
  reorderHint: {
    fontSize: "9px",
    color: "#aaa",
    marginLeft: "auto",
    letterSpacing: "0.01em",
    fontStyle: "italic" as const,
  },
  scroll: {
    display: "flex",
    gap: "8px",
    padding: "5px 14px 10px",
    overflowX: "auto" as const,
  },
  item: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: "3px",
    flexShrink: 0,
    width: "80px",
    cursor: "grab",
    borderRadius: "5px",
    transition: "opacity 0.1s, transform 0.1s",
  },
  itemDragging: {
    opacity: 0.35,
    transform: "scale(0.93)",
  },
  itemDragOver: {
    outline: "2px solid #1a3a6e",
    outlineOffset: "2px",
    borderRadius: "5px",
  },
  thumb: {
    width: "80px",
    height: "80px",
    border: "1px solid #e0e0e0",
    borderRadius: "5px",
    overflow: "hidden",
    background: "#f5f5f5",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative" as const,
    transition: "border-color 0.1s, background 0.1s",
  },
  thumbDragOver: {
    borderColor: "#1a3a6e",
    background: "#e8f0ff",
  },
  img: {
    width: "100%",
    height: "100%",
    objectFit: "contain" as const,
    display: "block",
  },
  noImg: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  removeBtn: {
    position: "absolute" as const,
    top: "3px",
    right: "3px",
    width: "18px",
    height: "18px",
    borderRadius: "50%",
    border: "1px solid rgba(0,0,0,0.15)",
    background: "rgba(255,255,255,0.9)",
    fontSize: "13px",
    cursor: "pointer",
    color: "#a33",
    fontWeight: 700,
    padding: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
    zIndex: 2,
  },
  insertIndicator: {
    position: "absolute" as const,
    left: 0,
    top: 0,
    bottom: 0,
    width: "3px",
    background: "#1a3a6e",
    borderRadius: "2px 0 0 2px",
    zIndex: 3,
  },
  meta: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: "2px",
    width: "100%",
  },
  roleBadge: {
    fontSize: "9px",
    background: "#e8f0ff",
    color: "#1a3a6e",
    borderRadius: "3px",
    padding: "1px 5px",
    fontWeight: 700,
  },
  fname: {
    fontSize: "9px",
    color: "#aaa",
    textAlign: "center" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    width: "100%",
  },
} as const
