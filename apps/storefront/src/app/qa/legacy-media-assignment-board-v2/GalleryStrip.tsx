"use client"

import { useEffect, useRef, useState } from "react"
import type { InvItem } from "./legacy-board-v2-types"
import { classifyVisualRole, VISUAL_ROLE_BADGE_RU } from "@/app/qa/legacy-media-assignment-board/legacy-media-visual-role-ranking"
import { clientPreview } from "./MediaCardV2"

/**
 * Custom drag MIME type for drop-time getData (not for dragover checks).
 */
export const GALLERY_DRAG_TYPE = "application/x-gallery-item"

/** Gallery card dimensions — visible at 1440×900 with horizontal scroll */
export const GALLERY_CARD_W = 172
export const GALLERY_THUMB_H = 150

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
  onDragEnter: (e: React.DragEvent, idx: number) => void
  onDragOver: (e: React.DragEvent, idx: number) => void
  onDragLeave: (e: React.DragEvent, idx: number) => void
  onDrop: (e: React.DragEvent, toIdx: number) => void
  onDragEnd: () => void
  onMoveLeft?: () => void
  onMoveRight?: () => void
  onPointerHandleDown?: (e: React.PointerEvent, idx: number) => void
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
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onMoveLeft,
  onMoveRight,
  onPointerHandleDown,
}: GalleryItemProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const preview = clientPreview(inv)
  const role = classifyVisualRole(inv)
  const roleLabel = VISUAL_ROLE_BADGE_RU[role] ?? "?"
  const showImg = preview.url !== null && !imgFailed
  const shortname = inv.filename.length > 26 ? inv.filename.slice(0, 23) + "…" : inv.filename
  const canMoveLeft = index > 0
  const canMoveRight = index < total - 1

  return (
    <div
      data-v2-gallery-item={index}
      data-v2-gallery-filename={inv.filename}
      onDragEnter={(e) => onDragEnter(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDragLeave={(e) => onDragLeave(e, index)}
      onDrop={(e) => onDrop(e, index)}
      style={{
        ...styles.item,
        ...(isDragging ? styles.itemDragging : {}),
        ...(isDragOver ? styles.itemDragOver : {}),
      }}
    >
      {/* Thumbnail — not draggable; use handle below */}
      <div style={{ ...styles.thumb, ...(isDragOver ? styles.thumbDragOver : {}) }}>
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
            <span style={{ fontSize: "32px", color: "#ddd" }}>–</span>
          </div>
        )}

        <button
          type="button"
          style={styles.removeBtn}
          onClick={(e) => { e.stopPropagation(); onRemove(mediaId) }}
          onMouseDown={(e) => e.stopPropagation()}
          title="Убрать из галереи"
          aria-label="Убрать из галереи"
        >
          ×
        </button>

        <span style={styles.positionBadge}>{index + 1}</span>
        {isDragOver && <div style={styles.insertIndicator} title="Вставить сюда" />}
      </div>

      {/* Visible drag handle — only this element starts HTML5 drag */}
      <div
        draggable
        data-v2-gallery-drag-handle
        onDragStart={(e) => {
          e.stopPropagation()
          onDragStart(e, mediaId, index)
        }}
        onDragEnd={(e) => {
          e.stopPropagation()
          onDragEnd()
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          onPointerHandleDown?.(e, index)
        }}
        style={styles.dragHandle}
        title="Перетащите для смены порядка в галерее"
        aria-label={`Перетащить «${inv.filename}»`}
      >
        <span style={styles.dragHandleIcon}>↕</span>
        <span style={styles.dragHandleText}>Перетащить</span>
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
            title="Сдвинуть влево"
            aria-label={`Сдвинуть «${inv.filename}» влево`}
            data-v2-gallery-move="left"
          >
            ←
          </button>
          <span style={styles.posLabel}>{index + 1} / {total}</span>
          <button
            type="button"
            style={{ ...styles.moveBtn, ...(canMoveRight ? {} : styles.moveBtnDisabled) }}
            disabled={!canMoveRight}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); canMoveRight && onMoveRight?.() }}
            title="Сдвинуть вправо"
            aria-label={`Сдвинуть «${inv.filename}» вправо`}
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

function resolveGalleryDropIndex(clientX: number, clientY: number): number | null {
  const el = document.elementFromPoint(clientX, clientY)
  const item = el?.closest("[data-v2-gallery-item]")
  if (!item) return null
  const raw = item.getAttribute("data-v2-gallery-item")
  if (raw === null) return null
  const idx = parseInt(raw, 10)
  return Number.isNaN(idx) ? null : idx
}

export function GalleryStrip({ galleryIds, invById, onRemove, onReorderGallery }: Props) {
  const stripRef = useRef<HTMLDivElement>(null)
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const dragSrcRef = useRef<number | null>(null)
  const pointerFromRef = useRef<number | null>(null)
  const pointerOverRef = useRef<number | null>(null)

  useEffect(() => {
    if (galleryIds.length > 0) {
      stripRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    }
  }, [galleryIds.length])

  function clearPointerDrag() {
    pointerFromRef.current = null
    pointerOverRef.current = null
    setDragFromIdx(null)
    setDragOverIdx(null)
  }

  function handlePointerHandleDown(e: React.PointerEvent, fromIdx: number) {
    if (!onReorderGallery) return
    e.preventDefault()
    e.stopPropagation()
    pointerFromRef.current = fromIdx
    pointerOverRef.current = fromIdx
    setDragFromIdx(fromIdx)
    setDragOverIdx(fromIdx)

    function onWindowPointerMove(ev: PointerEvent) {
      const over = resolveGalleryDropIndex(ev.clientX, ev.clientY)
      if (over === null) return
      pointerOverRef.current = over
      setDragOverIdx(over)
    }

    function endPointerDrag(ev: PointerEvent) {
      window.removeEventListener("pointermove", onWindowPointerMove)
      window.removeEventListener("pointerup", endPointerDrag)
      window.removeEventListener("pointercancel", endPointerDrag)
      const toIdx = resolveGalleryDropIndex(ev.clientX, ev.clientY) ?? pointerOverRef.current ?? fromIdx
      const src = pointerFromRef.current
      clearPointerDrag()
      if (src !== null && src !== toIdx) {
        onReorderGallery(src, toIdx)
      }
    }

    window.addEventListener("pointermove", onWindowPointerMove)
    window.addEventListener("pointerup", endPointerDrag)
    window.addEventListener("pointercancel", endPointerDrag)
  }

  function isInternalDrag(): boolean {
    return dragSrcRef.current !== null || pointerFromRef.current !== null
  }

  function handleDragStart(e: React.DragEvent, mediaId: string, idx: number) {
    e.dataTransfer.setData("text/plain", mediaId)
    e.dataTransfer.setData(GALLERY_DRAG_TYPE, String(idx))
    e.dataTransfer.effectAllowed = "move"
    // Transparent 1×1 drag image avoids browser blocking drag on custom divs (Safari)
    try {
      const img = new Image()
      img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
      e.dataTransfer.setDragImage(img, 0, 0)
    } catch {
      // ignore
    }
    dragSrcRef.current = idx
    setDragFromIdx(idx)
  }

  function handleDragEnter(e: React.DragEvent, idx: number) {
    if (!isInternalDrag()) return
    e.preventDefault()
    setDragOverIdx(idx)
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    if (!isInternalDrag()) return
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
    e.stopPropagation()
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

  function handleScrollDragOver(e: React.DragEvent) {
    if (!isInternalDrag()) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
  }

  if (galleryIds.length === 0) return null

  return (
    <div ref={stripRef} style={styles.strip} data-v2-gallery-strip>
      <div style={styles.header}>
        <span style={styles.label} data-v2-gallery-section-label>ГАЛЕРЕЯ</span>
        <span style={styles.count}>{galleryIds.length} фото</span>
        {onReorderGallery && (
          <span style={styles.reorderHint}>
            ↕ «Перетащить» на карточке или кнопки ← →
          </span>
        )}
      </div>
      <div
        style={styles.scroll}
        data-v2-gallery-scroll
        onDragOver={handleScrollDragOver}
        onDrop={(e) => {
          // Drop on scroll gutter → move to last position
          if (!isInternalDrag()) return
          e.preventDefault()
          const fromIdx = dragSrcRef.current
          if (fromIdx === null) return
          const toIdx = galleryIds.length - 1
          dragSrcRef.current = null
          setDragFromIdx(null)
          setDragOverIdx(null)
          if (fromIdx !== toIdx) onReorderGallery?.(fromIdx, toIdx)
        }}
      >
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
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
              onMoveLeft={onReorderGallery ? () => onReorderGallery(idx, idx - 1) : undefined}
              onMoveRight={onReorderGallery ? () => onReorderGallery(idx, idx + 1) : undefined}
              onPointerHandleDown={onReorderGallery ? handlePointerHandleDown : undefined}
            />
          )
        })}
      </div>
    </div>
  )
}

const styles = {
  strip: {
    borderBottom: "2px solid #c8d5f0",
    flexShrink: 0,
    background: "#f8faff",
    boxShadow: "inset 0 2px 0 #1a3a6e",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 14px 4px",
    flexWrap: "wrap" as const,
  },
  label: {
    fontSize: "12px",
    fontWeight: 800,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    color: "#1a3a6e",
  },
  count: {
    fontSize: "11px",
    background: "#e0eecc",
    color: "#335500",
    borderRadius: "8px",
    padding: "2px 8px",
    fontWeight: 600,
  },
  reorderHint: {
    fontSize: "10px",
    color: "#666",
    marginLeft: "auto",
    letterSpacing: "0.01em",
    fontStyle: "italic" as const,
  },
  scroll: {
    display: "flex",
    gap: "12px",
    padding: "8px 14px 14px",
    overflowX: "auto" as const,
    alignItems: "flex-start",
  },
  item: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "stretch",
    gap: "6px",
    flexShrink: 0,
    width: `${GALLERY_CARD_W}px`,
    borderRadius: "8px",
    border: "1px solid #e8e8e8",
    padding: "6px",
    background: "#fafafa",
    boxSizing: "border-box" as const,
    transition: "opacity 0.12s, box-shadow 0.12s",
    userSelect: "none" as const,
  },
  itemDragging: {
    opacity: 0.45,
    boxShadow: "0 4px 12px rgba(26,58,110,0.15)",
  },
  itemDragOver: {
    outline: "3px solid #1a3a6e",
    outlineOffset: "2px",
    background: "#eef3ff",
  },
  thumb: {
    width: "100%",
    height: `${GALLERY_THUMB_H}px`,
    border: "1px solid #d8d8d8",
    borderRadius: "6px",
    overflow: "hidden",
    background: "#f0f0f0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative" as const,
  },
  thumbDragOver: {
    borderColor: "#1a3a6e",
    background: "#e0ecff",
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
  dragHandle: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    width: "100%",
    padding: "6px 8px",
    border: "1px dashed #aacaff",
    borderRadius: "5px",
    background: "#e8f0ff",
    color: "#1a3a6e",
    cursor: "grab",
    fontSize: "11px",
    fontWeight: 700,
    lineHeight: 1.2,
    boxSizing: "border-box" as const,
  },
  dragHandleIcon: {
    fontSize: "14px",
    lineHeight: 1,
  },
  dragHandleText: {
    letterSpacing: "0.02em",
  },
  removeBtn: {
    position: "absolute" as const,
    top: "6px",
    right: "6px",
    width: "24px",
    height: "24px",
    borderRadius: "50%",
    border: "1px solid rgba(0,0,0,0.15)",
    background: "rgba(255,255,255,0.95)",
    fontSize: "15px",
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
    top: "6px",
    left: "6px",
    fontSize: "11px",
    fontWeight: 700,
    background: "rgba(26,58,110,0.85)",
    color: "#fff",
    borderRadius: "4px",
    padding: "2px 7px",
    lineHeight: 1.3,
    zIndex: 2,
  },
  insertIndicator: {
    position: "absolute" as const,
    left: 0,
    top: 0,
    bottom: 0,
    width: "4px",
    background: "#1a3a6e",
    borderRadius: "2px 0 0 2px",
    zIndex: 3,
    boxShadow: "0 0 6px rgba(26,58,110,0.5)",
  },
  meta: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "stretch",
    gap: "4px",
    width: "100%",
  },
  roleBadge: {
    fontSize: "11px",
    background: "#e8f0ff",
    color: "#1a3a6e",
    borderRadius: "4px",
    padding: "2px 8px",
    fontWeight: 700,
    alignSelf: "center",
  },
  fname: {
    fontSize: "11px",
    color: "#444",
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
    gap: "6px",
    width: "100%",
    marginTop: "2px",
  },
  moveBtn: {
    flex: 1,
    minWidth: "48px",
    height: "36px",
    border: "2px solid #aacaff",
    borderRadius: "5px",
    background: "#e8f0ff",
    color: "#1a3a6e",
    fontSize: "18px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    lineHeight: 1,
    fontWeight: 700,
  },
  moveBtnDisabled: {
    opacity: 0.3,
    cursor: "default",
    background: "#f5f5f5",
    borderColor: "#e0e0e0",
    color: "#aaa",
  },
  posLabel: {
    fontSize: "11px",
    color: "#666",
    flexShrink: 0,
    textAlign: "center" as const,
    fontWeight: 600,
    minWidth: "36px",
  },
} as const
