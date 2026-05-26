"use client"

import { useEffect, useRef, useState } from "react"
import type { InvItem, V2VariantRoleAssignment } from "./legacy-board-v2-types"
import { resolveGallerySource } from "./legacy-board-v2-gallery-source"
import { clientPreview } from "./MediaCardV2"

export const GALLERY_DRAG_TYPE = "application/x-gallery-item"

/** Compact preview strip — smaller than role slots */
export const GALLERY_CARD_W = 132
export const GALLERY_THUMB_H = 84
export const GALLERY_SLOT_COUNT = 5

// ---------------------------------------------------------------------------
// StorefrontGallerySection — unified hub (main strip + apply summary)
// ---------------------------------------------------------------------------

type HubProps = {
  mainMediaId: string | null
  galleryIds: string[]
  variantRoles: V2VariantRoleAssignment
  invById: Map<string, InvItem>
  onRemoveFromGallery: (mediaId: string) => void
  onRemoveMain?: () => void
  onReorderGallery?: (fromIdx: number, toIdx: number) => void
  onInsertIntoGallery?: (mediaId: string, atIdx: number) => void
}

export function StorefrontGallerySection({
  mainMediaId,
  galleryIds,
  variantRoles,
  invById,
  onRemoveFromGallery,
  onRemoveMain,
  onReorderGallery,
  onInsertIntoGallery,
}: HubProps) {
  return (
    <div style={hubStyles.root} data-v2-gallery-hub data-v2-gallery-variant-scoped="true">
      <GalleryStrip
        mainMediaId={mainMediaId}
        galleryIds={galleryIds}
        variantRoles={variantRoles}
        invById={invById}
        onRemoveFromGallery={onRemoveFromGallery}
        onRemoveMain={onRemoveMain}
        onReorderGallery={onReorderGallery}
        onInsertIntoGallery={onInsertIntoGallery}
      />
    </div>
  )
}

const hubStyles = {
  root: {
    flexShrink: 0,
    margin: "2px 12px 4px",
    border: "1px solid #d8e0ec",
    borderRadius: "6px",
    background: "#f8fafc",
    overflow: "hidden",
    boxShadow: "none",
  },
} as const

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
  isHovered: boolean
  canReorder: boolean
  onRemove: (mediaId: string) => void
  onDragStart: (e: React.DragEvent, mediaId: string, idx: number) => void
  onDragEnter: (e: React.DragEvent, idx: number) => void
  onDragOver: (e: React.DragEvent, idx: number) => void
  onDragLeave: (e: React.DragEvent, idx: number) => void
  onDrop: (e: React.DragEvent, toIdx: number) => void
  onDragEnd: () => void
  onMoveEarlier?: () => void
  onMoveLater?: () => void
  onHover: (idx: number | null) => void
  sourceLabel: string
  sourceShort: string
}

function GalleryItem({
  mediaId,
  inv,
  index,
  total,
  isDragging,
  isDragOver,
  isHovered,
  canReorder,
  sourceLabel,
  sourceShort,
  onRemove,
  onDragStart,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onMoveEarlier,
  onMoveLater,
  onHover,
}: GalleryItemProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const preview = clientPreview(inv)
  const showImg = preview.url !== null && !imgFailed
  const canMoveEarlier = index > 0
  const canMoveLater = index < total - 1

  return (
    <div
      data-v2-gallery-item={index}
      data-v2-gallery-filename={inv.filename}
      data-v2-gallery-source-label={sourceLabel}
      data-v2-gallery-media-id={mediaId}
      data-v2-gallery-card-draggable={canReorder ? "true" : undefined}
      draggable={canReorder}
      onDragStart={canReorder ? (e) => onDragStart(e, mediaId, index) : undefined}
      onDragEnd={canReorder ? onDragEnd : undefined}
      onDragEnter={(e) => onDragEnter(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDragLeave={(e) => onDragLeave(e, index)}
      onDrop={(e) => onDrop(e, index)}
      onMouseEnter={() => onHover(index)}
      onMouseLeave={() => onHover(null)}
      style={{
        ...styles.item,
        ...(isDragging ? styles.itemDragging : {}),
        ...(isDragOver ? styles.itemDragOver : {}),
        ...(isHovered && canReorder ? styles.itemHover : {}),
      }}
    >
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
            <span style={{ fontSize: "28px", color: "#ddd" }}>–</span>
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

        <span style={styles.positionBadge}>#{index + 1}</span>

        {isDragOver && <div style={styles.insertIndicator} title="Вставить сюда" />}

        {isHovered && canReorder && !isDragging && (
          <div style={styles.hoverHint}>↕ тащите</div>
        )}
      </div>

      <div style={styles.meta} data-v2-gallery-drag-handle>
        <span style={styles.sourceBadge} title={sourceLabel}>
          {sourceLabel}
        </span>
        <span style={styles.fname} title={inv.filename}>
          {inv.filename}
          <span style={styles.fnameMeta}> · {sourceShort}</span>
        </span>

        <div style={styles.moveRow} data-v2-gallery-move-row>
          <button
            type="button"
            style={{ ...styles.moveBtn, ...(canMoveEarlier ? {} : styles.moveBtnDisabled) }}
            disabled={!canMoveEarlier}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); canMoveEarlier && onMoveEarlier?.() }}
            title="Сдвинуть раньше в галерее"
            aria-label={`Сдвинуть «${inv.filename}» раньше`}
            data-v2-gallery-move="left"
          >
            раньше
          </button>
          <span style={styles.posLabel}>{index + 1} / {total}</span>
          <button
            type="button"
            style={{ ...styles.moveBtn, ...(canMoveLater ? {} : styles.moveBtnDisabled) }}
            disabled={!canMoveLater}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); canMoveLater && onMoveLater?.() }}
            title="Сдвинуть позже в галерее"
            aria-label={`Сдвинуть «${inv.filename}» позже`}
            data-v2-gallery-move="right"
          >
            позже
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// VitrineMainCard — TH preview (export main, not in gallery[])
// ---------------------------------------------------------------------------

function VitrineMainCard({
  mediaId,
  inv,
  onRemoveMain,
}: {
  mediaId: string
  inv: InvItem
  onRemoveMain?: () => void
}) {
  const [imgFailed, setImgFailed] = useState(false)
  const preview = clientPreview(inv)
  const showImg = preview.url !== null && !imgFailed

  return (
    <div
      style={styles.mainItem}
      data-v2-vitrine-main-card="true"
      data-v2-vitrine-main-media-id={mediaId}
      data-v2-vitrine-main-filename={inv.filename}
    >
      <div style={styles.mainThumb}>
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
        <span style={styles.mainPositionBadge}>TH</span>
        {onRemoveMain && (
          <button
            type="button"
            style={styles.removeBtn}
            onClick={(e) => {
              e.stopPropagation()
              onRemoveMain()
            }}
            onMouseDown={(e) => e.stopPropagation()}
            title="Убрать главное (TH)"
            aria-label="Убрать главное"
          >
            ×
          </button>
        )}
      </div>
      <div style={styles.meta}>
        <span style={styles.mainSourceBadge} title="из слота: Главное">
          из слота: Главное
        </span>
        <span style={styles.mainTitle}>Главное</span>
        <span style={styles.fname} title={inv.filename}>
          {inv.filename}
        </span>
        <span style={styles.mainFixedHint}>Первый кадр витрины · не в gallery export</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty state + drop gaps
// ---------------------------------------------------------------------------

function VitrineEmptyState() {
  return (
    <div style={styles.emptyWrap} data-v2-vitrine-empty>
      <p style={styles.emptyLine}>
        Назначьте Главное и роли — витрина появится здесь
      </p>
    </div>
  )
}

function GalleryEmptySlotsRow({
  onInsertIntoGallery,
}: {
  onInsertIntoGallery?: (mediaId: string, atIdx: number) => void
}) {
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null)

  function handleSlotDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    e.dataTransfer.dropEffect = "copy"
    setDragOverSlot(idx)
  }

  function handleSlotDrop(e: React.DragEvent, idx: number) {
    e.preventDefault()
    setDragOverSlot(null)
    const mediaId = e.dataTransfer.getData("text/plain")
    if (mediaId) onInsertIntoGallery?.(mediaId, idx)
  }

  return (
    <div style={styles.emptySlotsRow} data-v2-gallery-empty-slots>
      {Array.from({ length: GALLERY_SLOT_COUNT }, (_, i) => (
        <div
          key={i}
          style={{
            ...styles.emptySlot,
            ...(dragOverSlot === i ? styles.emptySlotActive : {}),
          }}
          data-v2-gallery-empty-slot={i}
          onDragOver={(e) => handleSlotDragOver(e, i)}
          onDragLeave={() => setDragOverSlot((p) => (p === i ? null : p))}
          onDrop={(e) => handleSlotDrop(e, i)}
        >
          #{i + 1}
        </div>
      ))}
    </div>
  )
}

function GalleryEmptyState({
  onInsertIntoGallery,
}: {
  onInsertIntoGallery?: (mediaId: string, atIdx: number) => void
}) {
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null)

  function handleSlotDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    e.dataTransfer.dropEffect = "copy"
    setDragOverSlot(idx)
  }

  function handleSlotDrop(e: React.DragEvent, idx: number) {
    e.preventDefault()
    setDragOverSlot(null)
    const mediaId = e.dataTransfer.getData("text/plain")
    if (mediaId) onInsertIntoGallery?.(mediaId, idx)
  }

  return (
    <div style={styles.emptyWrap} data-v2-gallery-empty>
      <p style={styles.emptyLine}>
        Галерея пустая — добавьте фото кнопкой «+ Галерея»
      </p>
      <div style={styles.emptySlotsRow}>
        {Array.from({ length: GALLERY_SLOT_COUNT }, (_, i) => (
          <div
            key={i}
            style={{
              ...styles.emptySlot,
              ...(dragOverSlot === i ? styles.emptySlotActive : {}),
            }}
            data-v2-gallery-empty-slot={i + 1}
            onDragEnter={(e) => handleSlotDragOver(e, i)}
            onDragOver={(e) => handleSlotDragOver(e, i)}
            onDragLeave={() => setDragOverSlot((p) => (p === i ? null : p))}
            onDrop={(e) => handleSlotDrop(e, i)}
          >
            <span style={styles.emptySlotNum}>{i + 1}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function GalleryDropGap({
  insertBefore,
  isActive,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  insertBefore: number
  isActive: boolean
  onDragEnter: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}) {
  return (
    <div
      data-v2-gallery-drop-gap
      data-insert-before={insertBefore}
      data-active={isActive ? "true" : "false"}
      style={{ ...styles.dropGap, ...(isActive ? styles.dropGapActive : {}) }}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    />
  )
}

// ---------------------------------------------------------------------------
// GalleryStrip
// ---------------------------------------------------------------------------

type StripProps = {
  mainMediaId: string | null
  galleryIds: string[]
  variantRoles: V2VariantRoleAssignment
  invById: Map<string, InvItem>
  onRemoveFromGallery: (mediaId: string) => void
  onRemoveMain?: () => void
  onReorderGallery?: (fromIdx: number, toIdx: number) => void
  onInsertIntoGallery?: (mediaId: string, atIdx: number) => void
}

export function GalleryStrip({
  mainMediaId,
  galleryIds,
  variantRoles,
  invById,
  onRemoveFromGallery,
  onRemoveMain,
  onReorderGallery,
  onInsertIntoGallery,
}: StripProps) {
  const stripRef = useRef<HTMLDivElement>(null)
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [insertBefore, setInsertBefore] = useState<number | null>(null)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const dragSrcRef = useRef<number | null>(null)

  useEffect(() => {
    if (galleryIds.length === 1) {
      stripRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    }
  }, [galleryIds.length])

  function isInternalDrag(): boolean {
    return dragSrcRef.current !== null
  }

  function clearDrag() {
    dragSrcRef.current = null
    setDragFromIdx(null)
    setDragOverIdx(null)
    setInsertBefore(null)
  }

  function handleDragStart(e: React.DragEvent, mediaId: string, idx: number) {
    e.dataTransfer.setData("text/plain", mediaId)
    e.dataTransfer.setData(GALLERY_DRAG_TYPE, String(idx))
    e.dataTransfer.effectAllowed = "move"
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
    e.preventDefault()
    setDragOverIdx(idx)
    setInsertBefore(null)
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    handleExternalDragOver(e)
    setDragOverIdx(idx)
    setInsertBefore(null)
  }

  function handleDragLeave(e: React.DragEvent, idx: number) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverIdx((prev) => (prev === idx ? null : prev))
    }
  }

  function handleExternalDrop(e: React.DragEvent, atIdx: number) {
    const mediaId = e.dataTransfer.getData("text/plain")
    if (mediaId) onInsertIntoGallery?.(mediaId, atIdx)
  }

  function handleDrop(e: React.DragEvent, toIdx: number) {
    e.preventDefault()
    e.stopPropagation()
    const fromIdx = dragSrcRef.current
    if (fromIdx === null) {
      clearDrag()
      handleExternalDrop(e, toIdx)
      return
    }
    clearDrag()
    if (fromIdx !== toIdx) {
      onReorderGallery?.(fromIdx, toIdx)
    }
  }

  function handleGapDrop(e: React.DragEvent, beforeIdx: number) {
    e.preventDefault()
    e.stopPropagation()
    const fromIdx = dragSrcRef.current
    if (fromIdx === null) {
      clearDrag()
      handleExternalDrop(e, beforeIdx)
      return
    }
    clearDrag()
    let toIdx = beforeIdx
    if (fromIdx < beforeIdx) toIdx = beforeIdx - 1
    if (fromIdx !== toIdx) onReorderGallery?.(fromIdx, toIdx)
  }

  function handleExternalDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = isInternalDrag() ? "move" : "copy"
  }

  function handleDragEnd() {
    clearDrag()
  }

  function handleScrollDragOver(e: React.DragEvent) {
    if (!isInternalDrag()) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
  }

  const hasMain = !!mainMediaId
  const hasGallery = galleryIds.length > 0
  const hasVitrine = hasMain || hasGallery
  const filledCount = Math.min(galleryIds.length, GALLERY_SLOT_COUNT)
  const mainInv = mainMediaId ? invById.get(mainMediaId) : null

  return (
    <div ref={stripRef} style={styles.strip} data-v2-gallery-strip>
      <div style={styles.header}>
        <div style={styles.headerMain}>
          <span style={styles.label} data-v2-gallery-section-label>
            ВИТРИНА: главное + галерея
          </span>
          <span style={styles.headerLead} data-v2-gallery-header-lead>
            Главное фото показывается первым. Ниже — порядок gallery export ·{" "}
            {hasMain ? "TH" : "—"} + {filledCount}/{GALLERY_SLOT_COUNT}
          </span>
          <span style={styles.headerHint}>
            Карточки #1…#5 — только gallery[]; TH не дублируется в export.
          </span>
        </div>
        <GalleryHeaderRail
          mainMediaId={mainMediaId}
          galleryIds={galleryIds}
          variantRoles={variantRoles}
          invById={invById}
        />
      </div>

      {!hasVitrine ? (
        <VitrineEmptyState />
      ) : (
        <div
          style={styles.scroll}
          data-v2-vitrine-scroll
          data-v2-gallery-scroll
          onDragOver={handleScrollDragOver}
          onDrop={(e) => {
            if (!isInternalDrag()) return
            e.preventDefault()
            const fromIdx = dragSrcRef.current
            if (fromIdx === null) return
            const toIdx = galleryIds.length - 1
            clearDrag()
            if (fromIdx !== toIdx) onReorderGallery?.(fromIdx, toIdx)
          }}
        >
          {hasMain && mainInv && mainMediaId && (
            <span style={styles.cardWithGap} data-v2-vitrine-main-wrap>
              <VitrineMainCard
                mediaId={mainMediaId}
                inv={mainInv}
                onRemoveMain={onRemoveMain}
              />
            </span>
          )}

          {hasMain && !hasGallery && (
            <GalleryEmptySlotsRow onInsertIntoGallery={onInsertIntoGallery} />
          )}

          {galleryIds.map((mediaId, idx) => {
            const inv = invById.get(mediaId)
            if (!inv) return null
            const source = resolveGallerySource(variantRoles, mediaId)
            return (
              <span key={mediaId} style={styles.cardWithGap}>
                <GalleryDropGap
                  insertBefore={idx}
                  isActive={insertBefore === idx}
                  onDragEnter={(e) => {
                    e.preventDefault()
                    setInsertBefore(idx)
                    setDragOverIdx(null)
                  }}
                  onDragOver={(e) => {
                    handleExternalDragOver(e)
                    setInsertBefore(idx)
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setInsertBefore((p) => (p === idx ? null : p))
                    }
                  }}
                  onDrop={(e) => handleGapDrop(e, idx)}
                />
                <GalleryItem
                  mediaId={mediaId}
                  inv={inv}
                  index={idx}
                  total={galleryIds.length}
                  sourceLabel={source.label}
                  sourceShort={source.short}
                  isDragging={dragFromIdx === idx}
                  isDragOver={dragOverIdx === idx && dragFromIdx !== idx}
                  isHovered={hoveredIdx === idx}
                  canReorder={!!onReorderGallery}
                  onRemove={onRemoveFromGallery}
                  onDragStart={handleDragStart}
                  onDragEnter={handleDragEnter}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                  onMoveEarlier={onReorderGallery ? () => onReorderGallery(idx, idx - 1) : undefined}
                  onMoveLater={onReorderGallery ? () => onReorderGallery(idx, idx + 1) : undefined}
                  onHover={setHoveredIdx}
                />
              </span>
            )
          })}
          <GalleryDropGap
            insertBefore={galleryIds.length}
            isActive={insertBefore === galleryIds.length}
            onDragEnter={(e) => {
              e.preventDefault()
              setInsertBefore(galleryIds.length)
              setDragOverIdx(null)
            }}
            onDragOver={(e) => {
              handleExternalDragOver(e)
              setInsertBefore(galleryIds.length)
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setInsertBefore((p) => (p === galleryIds.length ? null : p))
              }
            }}
            onDrop={(e) => handleGapDrop(e, galleryIds.length)}
          />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// GalleryHeaderRail — mini apply-order proof in header (not a second panel)
// ---------------------------------------------------------------------------

function GalleryHeaderRail({
  mainMediaId,
  galleryIds,
  variantRoles,
  invById,
}: {
  mainMediaId: string | null
  galleryIds: string[]
  variantRoles: V2VariantRoleAssignment
  invById: Map<string, InvItem>
}) {
  const filled = Math.min(galleryIds.length, GALLERY_SLOT_COUNT)
  const thumbInv = mainMediaId ? invById.get(mainMediaId) : null
  const thumbPreview = thumbInv ? clientPreview(thumbInv) : null

  return (
    <div style={railStyles.wrap} data-v2-apply-order-summary title="Итоговый порядок применения">
      <span style={railStyles.label}>Итог: TH + {filled}/{GALLERY_SLOT_COUNT}</span>
      <div style={railStyles.row}>
        <div style={railStyles.chip} data-v2-final-order-slot="thumb">
          <span style={railStyles.chipNum}>TH</span>
          <div style={railStyles.chipThumb}>
            {thumbPreview?.url ? (
              <img src={thumbPreview.url} alt="TH" style={railStyles.chipImg} draggable={false} />
            ) : (
              <span style={railStyles.chipEmpty}>–</span>
            )}
          </div>
        </div>
        {Array.from({ length: GALLERY_SLOT_COUNT }, (_, i) => {
          const mediaId = galleryIds[i] ?? null
          const inv = mediaId ? invById.get(mediaId) : null
          const preview = inv ? clientPreview(inv) : null
          const filename = inv?.filename ?? ""
          const source = mediaId ? resolveGallerySource(variantRoles, mediaId) : null
          return (
            <div
              key={i}
              style={railStyles.chip}
              data-v2-final-order-slot={i}
              data-v2-final-order-filename={filename}
              data-v2-final-order-source={source?.short ?? ""}
            >
              <span style={railStyles.chipNum} title={source?.label ?? ""}>
                {i + 1}
                {source ? ` · ${source.short}` : ""}
              </span>
              <div style={{ ...railStyles.chipThumb, ...(mediaId ? {} : railStyles.chipThumbEmpty) }}>
                {preview?.url ? (
                  <img src={preview.url} alt={`#${i + 1}`} style={railStyles.chipImg} draggable={false} />
                ) : (
                  <span style={railStyles.chipEmpty}>·</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const railStyles = {
  wrap: {
    display: "flex",
    flexDirection: "row" as const,
    alignItems: "center",
    gap: "4px",
    flexShrink: 1,
    minWidth: 0,
    overflow: "hidden" as const,
    opacity: 0.92,
  },
  label: {
    fontSize: "9px",
    fontWeight: 700,
    color: "#7a8aa8",
    letterSpacing: "0.03em",
    whiteSpace: "nowrap" as const,
    flexShrink: 0,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    height: "44px",
    overflowX: "auto" as const,
    flexShrink: 1,
    minWidth: 0,
  },
  chip: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: "2px",
    flexShrink: 0,
  },
  chipNum: {
    fontSize: "9px",
    fontWeight: 800,
    color: "#1a3a6e",
    lineHeight: 1,
  },
  chipThumb: {
    width: "28px",
    height: "28px",
    borderRadius: "3px",
    border: "1px solid #c8d5e8",
    background: "#fff",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  chipThumbEmpty: {
    border: "1px dashed #ccc",
    background: "#fafafa",
  },
  chipImg: {
    width: "100%",
    height: "100%",
    objectFit: "contain" as const,
    display: "block",
  },
  chipEmpty: {
    fontSize: "12px",
    color: "#ccc",
  },
} as const

const styles = {
  strip: {
    flexShrink: 0,
    background: "#f8faff",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    padding: "5px 10px",
    flexWrap: "wrap" as const,
    borderBottom: "1px solid #e0e6f0",
    minHeight: 0,
  },
  headerMain: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "1px",
    flex: "0 1 auto",
    minWidth: "140px",
    maxWidth: "280px",
  },
  label: {
    fontSize: "12px",
    fontWeight: 800,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    color: "#1a3a6e",
    lineHeight: 1.2,
  },
  headerLead: {
    fontSize: "10px",
    fontWeight: 500,
    color: "#6a7a9e",
    lineHeight: 1.3,
  },
  headerHint: {
    fontSize: "10px",
    fontWeight: 500,
    color: "#7a8aa8",
    lineHeight: 1.3,
  },
  sourceBadge: {
    fontSize: "10px",
    background: "#e8f4ff",
    color: "#1a3a6e",
    border: "1px solid #c5d8f5",
    borderRadius: "4px",
    padding: "3px 6px",
    fontWeight: 700,
    alignSelf: "stretch",
    textAlign: "center" as const,
    lineHeight: 1.25,
  },
  fnameMeta: {
    color: "#6a7a9e",
    fontWeight: 600,
  },
  countPill: {
    fontSize: "11px",
    background: "#e8f0ff",
    color: "#1a3a6e",
    borderRadius: "6px",
    padding: "3px 8px",
    fontWeight: 800,
    border: "1px solid #c8d5f0",
    flexShrink: 0,
  },
  scroll: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    gap: "8px",
    padding: "6px 10px 8px",
    overflowX: "auto" as const,
    overflowY: "hidden" as const,
    minHeight: `${GALLERY_THUMB_H + 52}px`,
  },
  cardWithGap: {
    display: "inline-flex",
    alignItems: "flex-start",
    flexShrink: 0,
  },
  dropGap: {
    width: "6px",
    minHeight: `${GALLERY_THUMB_H + 52}px`,
    borderRadius: "3px",
    flexShrink: 0,
    alignSelf: "stretch",
    transition: "background 0.1s, width 0.1s",
  },
  dropGapActive: {
    width: "10px",
    background: "#1a3a6e",
  },
  mainItem: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "stretch",
    gap: "4px",
    flexShrink: 0,
    width: `${GALLERY_CARD_W}px`,
    borderRadius: "7px",
    border: "2px solid #1a3a6e",
    padding: "5px",
    background: "#f0f6ff",
    boxSizing: "border-box" as const,
    boxShadow: "0 1px 4px rgba(26,58,110,0.1)",
  },
  mainThumb: {
    width: "100%",
    height: `${GALLERY_THUMB_H}px`,
    border: "2px solid #1a3a6e",
    borderRadius: "5px",
    overflow: "hidden",
    background: "#e8f0ff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative" as const,
  },
  mainPositionBadge: {
    position: "absolute" as const,
    top: "4px",
    left: "4px",
    fontSize: "11px",
    fontWeight: 800,
    background: "#1a3a6e",
    color: "#fff",
    borderRadius: "4px",
    padding: "2px 6px",
    lineHeight: 1.2,
    zIndex: 2,
  },
  mainSourceBadge: {
    fontSize: "10px",
    background: "#dce8ff",
    color: "#1a3a6e",
    border: "1px solid #a8c0f0",
    borderRadius: "4px",
    padding: "3px 6px",
    fontWeight: 700,
    alignSelf: "stretch",
    textAlign: "center" as const,
    lineHeight: 1.25,
  },
  mainTitle: {
    fontSize: "11px",
    fontWeight: 800,
    color: "#1a3a6e",
    lineHeight: 1.2,
  },
  mainFixedHint: {
    fontSize: "9px",
    color: "#6a7a9e",
    lineHeight: 1.25,
    display: "none",
  },
  item: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "stretch",
    gap: "4px",
    flexShrink: 0,
    width: `${GALLERY_CARD_W}px`,
    borderRadius: "7px",
    border: "1px solid #c8d5f0",
    padding: "5px",
    background: "#fff",
    boxSizing: "border-box" as const,
    transition: "opacity 0.1s, box-shadow 0.1s, border-color 0.1s",
    userSelect: "none" as const,
  },
  itemHover: {
    borderColor: "#1a3a6e",
    boxShadow: "0 2px 10px rgba(26,58,110,0.12)",
  },
  itemDragging: {
    opacity: 0.45,
    boxShadow: "0 4px 12px rgba(26,58,110,0.15)",
  },
  itemDragOver: {
    outline: "2px solid #1a3a6e",
    outlineOffset: "2px",
    background: "#eef3ff",
  },
  thumb: {
    width: "100%",
    height: `${GALLERY_THUMB_H}px`,
    border: "1px solid #d0d8e8",
    borderRadius: "5px",
    overflow: "hidden",
    background: "#f0f4fa",
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
  hoverHint: {
    position: "absolute" as const,
    left: 0,
    right: 0,
    bottom: 0,
    padding: "4px",
    background: "rgba(26,58,110,0.82)",
    color: "#fff",
    fontSize: "9px",
    fontWeight: 700,
    textAlign: "center" as const,
    zIndex: 4,
  },
  removeBtn: {
    position: "absolute" as const,
    top: "4px",
    right: "4px",
    width: "22px",
    height: "22px",
    borderRadius: "50%",
    border: "1px solid rgba(0,0,0,0.1)",
    background: "rgba(255,255,255,0.95)",
    fontSize: "14px",
    cursor: "pointer",
    color: "#a33",
    fontWeight: 700,
    padding: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
    zIndex: 5,
  },
  positionBadge: {
    position: "absolute" as const,
    top: "4px",
    left: "4px",
    fontSize: "14px",
    fontWeight: 800,
    background: "#1a3a6e",
    color: "#fff",
    borderRadius: "4px",
    padding: "2px 7px",
    lineHeight: 1.2,
    zIndex: 5,
  },
  insertIndicator: {
    position: "absolute" as const,
    left: 0,
    top: 0,
    bottom: 0,
    width: "4px",
    background: "#1a3a6e",
    zIndex: 6,
  },
  meta: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "stretch",
    gap: "4px",
    width: "100%",
  },
  roleBadge: {
    fontSize: "9px",
    background: "#e8f0ff",
    color: "#1a3a6e",
    borderRadius: "3px",
    padding: "2px 6px",
    fontWeight: 700,
    alignSelf: "center",
  },
  fname: {
    fontSize: "9px",
    color: "#444",
    textAlign: "center" as const,
    overflow: "hidden",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical" as const,
    lineHeight: 1.2,
    maxHeight: "2.4em",
    width: "100%",
    fontWeight: 500,
    wordBreak: "break-all" as const,
  },
  moveRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "4px",
    width: "100%",
  },
  moveBtn: {
    flex: 1,
    minWidth: "0",
    height: "24px",
    border: "1px solid #aacaff",
    borderRadius: "4px",
    background: "#e8f0ff",
    color: "#1a3a6e",
    fontSize: "10px",
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 4px",
    lineHeight: 1.1,
  },
  moveBtnDisabled: {
    opacity: 0.3,
    cursor: "default",
    background: "#f5f5f5",
    borderColor: "#e0e0e0",
    color: "#aaa",
  },
  posLabel: {
    fontSize: "9px",
    color: "#666",
    flexShrink: 0,
    fontWeight: 600,
    minWidth: "28px",
    textAlign: "center" as const,
  },
  emptyWrap: {
    padding: "10px 12px 12px",
    maxHeight: "150px",
  },
  emptyLine: {
    margin: "0 0 8px",
    fontSize: "12px",
    fontWeight: 600,
    color: "#4a5a7a",
    lineHeight: 1.35,
  },
  emptySlotsRow: {
    display: "flex",
    justifyContent: "flex-start",
    gap: "8px",
    flexWrap: "nowrap" as const,
    overflowX: "auto" as const,
  },
  emptySlot: {
    width: "56px",
    height: "64px",
    border: "1px dashed #aacaff",
    borderRadius: "6px",
    background: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    transition: "border-color 0.1s, background 0.1s",
  },
  emptySlotActive: {
    borderColor: "#1a3a6e",
    background: "#eef3ff",
  },
  emptySlotNum: {
    fontSize: "13px",
    fontWeight: 800,
    color: "#1a3a6e",
  },
} as const
