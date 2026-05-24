"use client"

import { useRef, useState } from "react"
import type { InvItem } from "./legacy-board-v2-types"
import { classifyVisualRole, VISUAL_ROLE_BADGE_RU } from "@/app/qa/legacy-media-assignment-board/legacy-media-visual-role-ranking"
import { clientPreview } from "./MediaCardV2"

/**
 * Custom drag MIME type used in `setData`/`getData` at drop-time.
 * NOTE: This type is NOT checked during `dragover` — browsers (especially
 * Safari/WebKit on macOS) may not expose custom application/* types in
 * e.dataTransfer.types during dragover. We use a useRef flag instead.
 */
export const GALLERY_DRAG_TYPE = "application/x-gallery-item"

export const GALLERY_CARD_W = 132
export const GALLERY_THUMB_H = 132

// ---------------------------------------------------------------------------
// GalleryItem
// ---------------------------------------------------------------------------

type GalleryItemProps = {
  mediaId: string
  inv: InvItem
  index: number
  total: number
  isDragging: boolean
  isDragOver: boolean
  onRemove: (mediaId: string) => void
  onDragStart: (e: React.DragEvent, mediaId: string, idx: number) => void
  onDragOver: (e: React.DragEvent, idx: number) => void
  onDragLeave: (e: React.DragEvent, idx: number) => void
  onDrop: (e: React.DragEvent, toIdx: number) => void
  onDragEnd: () => void
  onMoveLeft?: () => void
  onMoveRight?: () => void
}

function GalleryItem({
  mediaId,
  inv,
  index,
  total,
  isDragging,
  isDragOver,
  onRemove,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onMoveLeft,
  onMoveRight,
}: GalleryItemProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const preview = clientPreview(inv)
  const role = classifyVisualRole(inv)
  const roleLabel = VISUAL_ROLE_BADGE_RU[role] ?? "?"
  const showImg = preview.url !== null && !imgFailed
  const shortname = inv.filename.length > 24 ? inv.filename.slice(0, 21) + "…" : inv.filename
  const canMoveLeft = index > 0
  const canMoveRight = index < total - 1

  return (
    <div
      data-v2-gallery-item={index}
      data-v2-gallery-filename={inv.filename}
      onDragOver={(e) => onDragOver(e, index)}
      onDragLeave={(e) => onDragLeave(e, index)}
      onDrop={(e) => onDrop(e, index)}
      style={{
        ...styles.item,
        ...(isDragging ? styles.itemDragging : {}),
        ...(isDragOver ? styles.itemDragOver : {}),
      }}
    >
      {/* Thumbnail — draggable handle (keeps ←/→ buttons clickable) */}
      <div
        draggable
        onDragStart={(e) => onDragStart(e, mediaId, index)}
        onDragEnd={onDragEnd}
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
            draggable={false}
          />
        ) : (
          <div style={styles.noImg}>
            <span style={{ fontSize: "28px", color: "#ddd" }}>–</span>
          </div>
        )}

        <button
          style={styles.removeBtn}
          onClick={(e) => { e.stopPropagation(); onRemove(mediaId) }}
          onMouseDown={(e) => e.stopPropagation()}
          title="Убрать из галереи"
          aria-label="Убрать из галереи"
        >
          ×
        </button>

        <span style={styles.positionBadge}>{index + 1}</span>
        {isDragOver && <div style={styles.insertIndicator} />}
      </div>

      <div style={styles.meta}>
        <span style={styles.roleBadge}>{roleLabel}</span>
        <span style={styles.fname} title={inv.filename}>{shortname}</span>

        <div style={styles.moveRow} data-v2-gallery-move-row>
          <button
            type="button"
            style={{ ...styles.moveBtn, ...(canMoveLeft ? {} : styles.moveBtnDisabled) }}
            disabled={!canMoveLeft}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); canMoveLeft && onMoveLeft?.() }}
            title="Сдвинуть влево в галерее"
            aria-label={`Сдвинуть «${inv.filename}» влево в галерее`}
            data-v2-gallery-move="left"
          >
            ←
          </button>
          <span style={styles.posLabel}>{index + 1}/{total}</span>
          <button
            type="button"
            style={{ ...styles.moveBtn, ...(canMoveRight ? {} : styles.moveBtnDisabled) }}
            disabled={!canMoveRight}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); canMoveRight && onMoveRight?.() }}
            title="Сдвинуть вправо в галерее"
            aria-label={`Сдвинуть «${inv.filename}» вправо в галерее`}
            data-v2-gallery-move="right"
          >
            →
          </button>
        </div>
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
  onReorderGallery?: (fromIdx: number, toIdx: number) => void
}

export function GalleryStrip({ galleryIds, invById, onRemove, onReorderGallery }: Props) {
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const dragSrcRef = useRef<number | null>(null)

  function handleDragStart(e: React.DragEvent, mediaId: string, idx: number) {
    e.dataTransfer.setData("text/plain", mediaId)
    e.dataTransfer.setData(GALLERY_DRAG_TYPE, String(idx))
    e.dataTransfer.effectAllowed = "move"
    dragSrcRef.current = idx
    setDragFromIdx(idx)
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    if (dragSrcRef.current === null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDragOverIdx(idx)
  }

  function handleDragLeave(e: React.DragEvent, idx: number) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverIdx((prev) => (prev === idx ? null : prev))
    }
  }

  function handleDrop(e: React.DragEvent, toIdx: number) {
    e.preventDefault()
    const fromIdx = dragSrcRef.current
    dragSrcRef.current = null
    setDragOverIdx(null)
    setDragFromIdx(null)
    if (fromIdx !== null && fromIdx !== toIdx) {
      onReorderGallery?.(fromIdx, toIdx)
    }
  }

  function handleDragEnd() {
    dragSrcRef.current = null
    setDragFromIdx(null)
    setDragOverIdx(null)
  }

  if (galleryIds.length === 0) return null

  return (
    <div style={styles.strip} data-v2-gallery-strip>
      <div style={styles.header}>
        <span style={styles.label}>Галерея</span>
        <span style={styles.count}>{galleryIds.length} фото</span>
        {onReorderGallery && (
          <span style={styles.reorderHint}>↕ перетащите фото или ← →</span>
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
              total={galleryIds.length}
              isDragging={dragFromIdx === idx}
              isDragOver={dragOverIdx === idx && dragFromIdx !== idx}
              onRemove={onRemove}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
              onMoveLeft={onReorderGallery ? () => onReorderGallery(idx, idx - 1) : undefined}
              onMoveRight={onReorderGallery ? () => onReorderGallery(idx, idx + 1) : undefined}
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
    gap: "10px",
    padding: "6px 14px 12px",
    overflowX: "auto" as const,
  },
  item: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: "5px",
    flexShrink: 0,
    width: `${GALLERY_CARD_W}px`,
    borderRadius: "6px",
    transition: "opacity 0.1s, transform 0.1s",
    userSelect: "none" as const,
  },
  itemDragging: {
    opacity: 0.35,
    transform: "scale(0.94)",
  },
  itemDragOver: {
    outline: "2px solid #1a3a6e",
    outlineOffset: "3px",
    borderRadius: "6px",
  },
  thumb: {
    width: `${GALLERY_CARD_W}px`,
    height: `${GALLERY_THUMB_H}px`,
    border: "1px solid #e0e0e0",
    borderRadius: "6px",
    overflow: "hidden",
    background: "#f5f5f5",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative" as const,
    transition: "border-color 0.1s, background 0.1s",
    cursor: "grab",
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
    pointerEvents: "none" as const,
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
    top: "4px",
    right: "4px",
    width: "22px",
    height: "22px",
    borderRadius: "50%",
    border: "1px solid rgba(0,0,0,0.15)",
    background: "rgba(255,255,255,0.9)",
    fontSize: "14px",
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
  positionBadge: {
    position: "absolute" as const,
    top: "4px",
    left: "4px",
    fontSize: "10px",
    fontWeight: 700,
    background: "rgba(26,58,110,0.75)",
    color: "#fff",
    borderRadius: "3px",
    padding: "1px 6px",
    lineHeight: 1.4,
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
    gap: "3px",
    width: "100%",
  },
  roleBadge: {
    fontSize: "10px",
    background: "#e8f0ff",
    color: "#1a3a6e",
    borderRadius: "3px",
    padding: "1px 6px",
    fontWeight: 700,
  },
  fname: {
    fontSize: "10px",
    color: "#666",
    textAlign: "center" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    width: "100%",
    fontWeight: 500,
  },
  moveRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "4px",
    width: "100%",
    marginTop: "2px",
  },
  moveBtn: {
    width: "32px",
    height: "24px",
    border: "1px solid #aacaff",
    borderRadius: "4px",
    background: "#e8f0ff",
    color: "#1a3a6e",
    fontSize: "13px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    lineHeight: 1,
    flexShrink: 0,
    fontWeight: 700,
  },
  moveBtnDisabled: {
    opacity: 0.25,
    cursor: "default",
    background: "#f8f8f8",
    borderColor: "#e0e0e0",
    color: "#999",
  },
  posLabel: {
    fontSize: "10px",
    color: "#888",
    flex: 1,
    textAlign: "center" as const,
    lineHeight: 1,
    fontWeight: 600,
  },
} as const
