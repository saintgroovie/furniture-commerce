"use client"

import { useMemo, useState } from "react"
import type {
  InvItem,
  ProductRow,
  V2ColorVariant,
  V2ProductState,
  V2RoleSlot,
} from "./legacy-board-v2-types"
import { ColorVariantTabs } from "./ColorVariantTabs"
import { RoleChecklistPanel, computeRoleRows } from "./RoleChecklistPanel"
import { MissingRoleStrip } from "./MissingRoleStrip"
import { GalleryStrip, GALLERY_DRAG_TYPE } from "./GalleryStrip"
import { clientPreview } from "./MediaCardV2"

type Props = {
  selectedHandle: string | null
  products: ProductRow[]
  colorVariants: V2ColorVariant[]
  activeVariantKey: string
  productState: V2ProductState | null
  invById: Map<string, InvItem>
  onSetVariant: (variantKey: string) => void
  onRemoveMain: () => void
  onRemoveFromGallery: (mediaId: string) => void
  onFocusRole: (slot: V2RoleSlot) => void
  onSetRole?: (mediaId: string, slot: V2RoleSlot) => void
  onClearRole?: (slot: V2RoleSlot) => void
  roleOverrides?: Record<string, V2RoleSlot>
  /** Reorder the gallery array: move item at fromIdx to toIdx */
  onReorderGallery?: (fromIdx: number, toIdx: number) => void
  /** Add media to gallery (append); used by role-slot "+ в гал." action */
  onAddToGallery?: (mediaId: string) => void
  /** Insert/move media into gallery at a specific position (from final-order slot drop) */
  onInsertIntoGallery?: (mediaId: string, atIdx: number) => void
}

export function ProductWorkspace({
  selectedHandle,
  products,
  colorVariants,
  activeVariantKey,
  productState,
  invById,
  onSetVariant,
  onRemoveMain,
  onRemoveFromGallery,
  onFocusRole,
  onSetRole,
  onClearRole,
  roleOverrides,
  onReorderGallery,
  onAddToGallery,
  onInsertIntoGallery,
}: Props) {
  if (!selectedHandle) {
    return (
      <main style={styles.root}>
        <div style={styles.colHeader}>Рабочая область продукта</div>
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>📦</div>
          <div style={{ fontSize: "14px", color: "#bbb" }}>Выберите продукт из левой панели</div>
          <div style={{ fontSize: "12px", color: "#ccc" }}>Используйте «↗ Быстро: co-02-1» для теста</div>
        </div>
      </main>
    )
  }

  const product = products.find((p) => p.handle === selectedHandle)

  return (
    <main style={styles.root}>
      {/* ── Sticky top section: context + navigation ── */}
      <div style={styles.topSection}>
        {/* Compact product header */}
        <div style={styles.productHeader}>
          <span style={styles.handleChip}>{selectedHandle}</span>
          {product?.title && <span style={styles.productTitle}>{product.title}</span>}
          {product?.collection && <span style={styles.collectionChip}>{product.collection}</span>}
        </div>

        {/* Color variant tabs */}
        <ColorVariantTabs
          variants={colorVariants}
          activeVariantKey={activeVariantKey}
          productState={productState}
          onSelect={onSetVariant}
        />

        {/* Missing roles — always visible task bar */}
        <MissingRoleStripDerived
          productState={productState}
          activeVariantKey={activeVariantKey}
          invById={invById}
          onFocusRole={onFocusRole}
          roleOverrides={roleOverrides}
        />

        {/* Onboarding hint — shown only before any assignment */}
        <OnboardingHint productState={productState} activeVariantKey={activeVariantKey} />
      </div>

      {/* ── Scrollable body: role slots + gallery ── */}
      <div style={styles.scrollBody}>
        <RoleChecklistPanel
          productState={productState}
          activeVariantKey={activeVariantKey}
          invById={invById}
          onFocusRole={onFocusRole}
          onRemoveMain={onRemoveMain}
          onRemoveFromGallery={onRemoveFromGallery}
          onSetRole={onSetRole}
          onClearRole={onClearRole}
          roleOverrides={roleOverrides}
          onAddToGallery={onAddToGallery}
        />

        <GalleryStrip
          galleryIds={productState?.galleriesByVariant[activeVariantKey] ?? []}
          invById={invById}
          onRemove={onRemoveFromGallery}
          onReorderGallery={onReorderGallery}
        />
      </div>

      {/* ── Apply order — pinned at bottom, always visible ── */}
      <FinalMediaOrderBlock
        mainMediaId={(productState?.rolesByVariant[activeVariantKey]?.main as string | null | undefined) ?? null}
        galleryIds={productState?.galleriesByVariant[activeVariantKey] ?? []}
        invById={invById}
        onReorderGallery={onReorderGallery}
        onInsertIntoGallery={onInsertIntoGallery}
      />
    </main>
  )
}

// ---------------------------------------------------------------------------
// Onboarding hint — only before any role is assigned
// ---------------------------------------------------------------------------

function OnboardingHint({
  productState,
  activeVariantKey,
}: {
  productState: V2ProductState | null
  activeVariantKey: string
}) {
  const hasAnyAssignment = useMemo(() => {
    if (!productState) return false
    const hasMain = !!(productState.rolesByVariant[activeVariantKey]?.main)
    const galleryCount = productState.galleriesByVariant[activeVariantKey]?.length ?? 0
    return hasMain || galleryCount > 0
  }, [productState, activeVariantKey])

  if (hasAnyAssignment) return null

  return (
    <div style={hintStyles.box}>
      <span style={hintStyles.step}>Шаг 1</span>
      <span style={hintStyles.text}>
        Найдите главное фото в правом пуле и нажмите <strong>★ Главное</strong>.
        Затем заполните недостающие роли, нажимая на чипы выше.
      </span>
    </div>
  )
}

const hintStyles = {
  box: {
    display: "flex",
    gap: "10px",
    alignItems: "flex-start",
    padding: "8px 14px 9px",
    background: "#f0f6ff",
    borderBottom: "1px solid #d0e4ff",
    flexShrink: 0,
  },
  step: {
    fontSize: "10px",
    fontWeight: 700,
    color: "#1a3a6e",
    background: "#d0e4ff",
    borderRadius: "10px",
    padding: "2px 7px",
    whiteSpace: "nowrap" as const,
    flexShrink: 0,
    marginTop: "1px",
  },
  text: {
    fontSize: "11px",
    color: "#3a5a8e",
    lineHeight: 1.5,
  },
} as const

// ---------------------------------------------------------------------------
// Derived missing strip
// ---------------------------------------------------------------------------

function MissingRoleStripDerived({
  productState,
  activeVariantKey,
  invById,
  onFocusRole,
  roleOverrides,
}: {
  productState: V2ProductState | null
  activeVariantKey: string
  invById: Map<string, InvItem>
  onFocusRole: (slot: V2RoleSlot) => void
  roleOverrides?: Record<string, V2RoleSlot>
}) {
  const missingSlots = useMemo(() => {
    const rows = computeRoleRows(productState, activeVariantKey, invById, roleOverrides)
    return rows.filter((r) => !r.isCovered).map((r) => r.slot)
  }, [productState, activeVariantKey, invById, roleOverrides])

  return <MissingRoleStrip missingSlots={missingSlots} onFocusRole={onFocusRole} />
}

// ---------------------------------------------------------------------------
// Final apply-order block — shows thumbnail + gallery[1..N] in apply order
// ---------------------------------------------------------------------------

const GALLERY_SLOT_COUNT = 5
const THUMB_SIZE = 80

function FinalMediaOrderBlock({
  mainMediaId,
  galleryIds,
  invById,
  onReorderGallery,
  onInsertIntoGallery,
}: {
  mainMediaId: string | null
  galleryIds: string[]
  invById: Map<string, InvItem>
  /** Reorder gallery: move item at fromIdx to toIdx */
  onReorderGallery?: (fromIdx: number, toIdx: number) => void
  /** Insert/move a media item into gallery at a specific position (from pool drops) */
  onInsertIntoGallery?: (mediaId: string, atIdx: number) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [applyDragFrom, setApplyDragFrom] = useState<number | null>(null)
  const [applyDragOver, setApplyDragOver] = useState<number | null>(null)

  function handleSlotDragStart(e: React.DragEvent, idx: number) {
    const mediaId = galleryIds[idx]
    if (!mediaId) return
    e.dataTransfer.setData("text/plain", mediaId)
    e.dataTransfer.setData(GALLERY_DRAG_TYPE, String(idx))
    e.dataTransfer.effectAllowed = "move"
    setApplyDragFrom(idx)
  }

  function handleSlotDragOver(e: React.DragEvent, idx: number) {
    const types = Array.from(e.dataTransfer.types)
    const hasGalleryType = types.includes(GALLERY_DRAG_TYPE)
    const hasTextPlain = types.includes("text/plain")
    // Accept both gallery-item reorders and media-pool card drops
    if (!hasGalleryType && !hasTextPlain) return
    e.preventDefault()
    e.dataTransfer.dropEffect = hasGalleryType ? "move" : "copy"
    setApplyDragOver(idx)
  }

  function handleSlotDragLeave(e: React.DragEvent, idx: number) {
    if (applyDragOver === idx && !e.currentTarget.contains(e.relatedTarget as Node)) {
      setApplyDragOver(null)
    }
  }

  function handleSlotDrop(e: React.DragEvent, toIdx: number) {
    e.preventDefault()
    setApplyDragOver(null)
    setApplyDragFrom(null)

    // Gallery-item reorder takes priority (it also sets text/plain)
    const fromStr = e.dataTransfer.getData(GALLERY_DRAG_TYPE)
    if (fromStr) {
      const fromIdx = parseInt(fromStr, 10)
      if (!isNaN(fromIdx) && fromIdx !== toIdx) {
        onReorderGallery?.(fromIdx, toIdx)
      }
      return
    }

    // Pool-card drop → insert/move media into gallery at this position
    const mediaId = e.dataTransfer.getData("text/plain")
    if (mediaId) {
      onInsertIntoGallery?.(mediaId, toIdx)
    }
  }

  function handleSlotDragEnd() {
    setApplyDragFrom(null)
    setApplyDragOver(null)
  }

  const hasContent = mainMediaId || galleryIds.length > 0
  if (!hasContent) return null

  const thumbInv = mainMediaId ? invById.get(mainMediaId) : null
  const thumbPreview = thumbInv ? clientPreview(thumbInv) : null
  const galleryFilledCount = Math.min(galleryIds.length, GALLERY_SLOT_COUNT)
  const galleryComplete = galleryFilledCount === GALLERY_SLOT_COUNT

  const countColor = galleryComplete ? "#1a5e20" : galleryFilledCount > 0 ? "#7a4800" : "#888"
  const countBg = galleryComplete ? "#e8f5e9" : galleryFilledCount > 0 ? "#fff8e1" : "#f5f5f5"

  const slots = Array.from({ length: GALLERY_SLOT_COUNT }, (_, i) => {
    const mediaId = galleryIds[i] ?? null
    const inv = mediaId ? invById.get(mediaId) : null
    const preview = inv ? clientPreview(inv) : null
    return { mediaId, inv, preview, pos: i + 1 }
  })

  return (
    <div style={fmoStyles.block}>
      <div style={fmoStyles.header}>
        <span style={fmoStyles.headerLabel}>Порядок на витрине</span>
        {!collapsed && (
          <span style={{ ...fmoStyles.countPill, color: countColor, background: countBg }}>
            Обложка + {galleryFilledCount}/{GALLERY_SLOT_COUNT} фото
          </span>
        )}
        <span style={fmoStyles.headerSub} />
        <button
          style={fmoStyles.collapseBtn}
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Развернуть" : "Свернуть"}
        >
          {collapsed ? "▸ Порядок фото" : "▾"}
        </button>
      </div>

      {!collapsed && (
        <div style={fmoStyles.subtitle}>
          Порядок фото в карточке товара: обложка + галерея.
          Перетащите фото из пула в слот или переставьте галерею.
        </div>
      )}

      {!collapsed && (
        <div style={fmoStyles.strip}>
          {/* Slot 0: thumbnail / main photo */}
          <div style={{ ...fmoStyles.slot, width: `${THUMB_SIZE}px` }}>
            <div style={fmoStyles.slotNum}>Гл.</div>
            <div style={{ ...fmoStyles.thumb, ...fmoStyles.thumbMain, width: `${THUMB_SIZE}px`, height: `${THUMB_SIZE}px` }}>
              {thumbPreview?.url ? (
                <img src={thumbPreview.url} alt="thumbnail" style={fmoStyles.thumbImg} loading="lazy" />
              ) : (
                <span style={fmoStyles.thumbEmpty}>
                  {mainMediaId ? "?" : "–"}
                </span>
              )}
            </div>
            <div style={{ ...fmoStyles.slotLabel, width: `${THUMB_SIZE}px` }}>
              {thumbInv
                ? (thumbInv.filename.length > 16 ? thumbInv.filename.slice(0, 13) + "…" : thumbInv.filename)
                : <span style={fmoStyles.emptyLabel}>не задано</span>}
            </div>
          </div>

          {/* Divider */}
          <div style={{ ...fmoStyles.divider, height: `${THUMB_SIZE}px` }} />

          {/* Gallery slots 1–N */}
          {slots.map(({ mediaId, inv, preview, pos }) => {
            const idx = pos - 1
            const isDragSrc = applyDragFrom === idx
            const isDragTarget = applyDragOver === idx && applyDragFrom !== idx
            return (
              <div
                key={pos}
                style={{ ...fmoStyles.slot, width: `${THUMB_SIZE}px` }}
                draggable={!!mediaId}
                onDragStart={mediaId ? (e) => handleSlotDragStart(e, idx) : undefined}
                onDragOver={(e) => handleSlotDragOver(e, idx)}
                onDragLeave={(e) => handleSlotDragLeave(e, idx)}
                onDrop={(e) => handleSlotDrop(e, idx)}
                onDragEnd={handleSlotDragEnd}
              >
                <div style={fmoStyles.slotNum}>{pos}</div>
                <div style={{
                  ...fmoStyles.thumb,
                  width: `${THUMB_SIZE}px`,
                  height: `${THUMB_SIZE}px`,
                  ...(mediaId ? {} : fmoStyles.thumbEmptySlot),
                  ...(isDragSrc ? fmoStyles.thumbDragSrc : {}),
                  ...(isDragTarget ? fmoStyles.thumbDragTarget : {}),
                  ...(mediaId ? { cursor: "grab" } : { cursor: "copy" }),
                }}>
                  {preview?.url ? (
                    <img src={preview.url} alt={`gallery ${pos}`} style={fmoStyles.thumbImg} loading="lazy" />
                  ) : (
                    <span style={fmoStyles.thumbEmpty}>
                      {mediaId ? "?" : isDragTarget ? "⊕" : "↓"}
                    </span>
                  )}
                </div>
                <div style={{ ...fmoStyles.slotLabel, width: `${THUMB_SIZE}px` }}>
                  {inv
                    ? (inv.filename.length > 16 ? inv.filename.slice(0, 13) + "…" : inv.filename)
                    : <span style={fmoStyles.emptyLabel}>{isDragTarget ? "Отпустите" : "Перетащите сюда"}</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const fmoStyles = {
  block: {
    borderTop: "3px solid #1a3a6e",
    background: "#eef3ff",
    flexShrink: 0,
    boxShadow: "0 -2px 8px rgba(26,58,110,0.08)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "7px 14px 6px",
    borderBottom: "1px solid #d4dff5",
  },
  subtitle: {
    padding: "3px 14px 5px",
    fontSize: "10px",
    color: "#6a7a9e",
    lineHeight: 1.4,
    borderBottom: "1px solid #d4dff5",
  },
  headerLabel: {
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.07em",
    color: "#1a3a6e",
  },
  countPill: {
    fontSize: "11px",
    fontWeight: 700,
    borderRadius: "8px",
    padding: "1px 8px",
    letterSpacing: "0.01em",
  },
  headerSub: {
    flex: 1,
  },
  collapseBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: "11px",
    color: "#1a3a6e",
    padding: "0 2px",
    lineHeight: 1,
    flexShrink: 0,
    fontWeight: 600,
  },
  strip: {
    display: "flex",
    alignItems: "flex-start",
    gap: "6px",
    padding: "8px 14px 12px",
    overflowX: "auto" as const,
  },
  slot: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: "4px",
    flexShrink: 0,
  },
  slotNum: {
    fontSize: "10px",
    fontWeight: 700,
    color: "#1a3a6e",
    letterSpacing: "0.04em",
  },
  thumb: {
    border: "1px solid #c8d5f0",
    borderRadius: "5px",
    background: "#e8eeff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
  thumbMain: {
    border: "2px solid #1a3a6e",
    background: "#dce8ff",
  },
  thumbEmptySlot: {
    background: "#f0f0f0",
    border: "1px dashed #ccc",
  },
  thumbDragSrc: {
    opacity: 0.35,
    transform: "scale(0.93)",
  },
  thumbDragTarget: {
    border: "2px solid #1a3a6e",
    background: "#e0ecff",
    boxShadow: "0 0 0 2px rgba(26,58,110,0.2)",
  },
  thumbImg: {
    width: "100%",
    height: "100%",
    objectFit: "contain" as const,
    display: "block",
  },
  thumbEmpty: {
    fontSize: "18px",
    color: "#ccc",
    lineHeight: 1,
  },
  slotLabel: {
    fontSize: "9px",
    color: "#555",
    textAlign: "center" as const,
    lineHeight: 1.2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  emptyLabel: {
    color: "#bbb",
    fontStyle: "italic" as const,
  },
  divider: {
    width: "1px",
    background: "#c8d5f0",
    marginTop: "18px",
    flexShrink: 0,
    alignSelf: "flex-start" as const,
  },
} as const

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  root: {
    overflow: "hidden" as const,
    background: "#fafafa",
    display: "flex",
    flexDirection: "column" as const,
    minHeight: 0,
  },
  topSection: {
    flexShrink: 0,
  },
  scrollBody: {
    flex: 1,
    overflowY: "auto" as const,
    minHeight: "80px",
    display: "flex",
    flexDirection: "column" as const,
  },
  colHeader: {
    padding: "9px 14px",
    fontWeight: 600,
    fontSize: "11px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    color: "#555",
    borderBottom: "1px solid #eee",
    background: "#f5f5f5",
    flexShrink: 0,
  },
  emptyState: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    padding: "40px 20px",
  },
  emptyIcon: {
    fontSize: "40px",
    opacity: 0.4,
  },
  productHeader: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 14px",
    background: "#fff",
    borderBottom: "1px solid #eee",
    flexWrap: "wrap" as const,
    flexShrink: 0,
  },
  handleChip: {
    fontWeight: 700,
    fontSize: "14px",
    background: "#e8f0ff",
    color: "#1a3a6e",
    borderRadius: "5px",
    padding: "3px 10px",
    letterSpacing: "0.02em",
  },
  productTitle: {
    fontSize: "13px",
    color: "#333",
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  collectionChip: {
    fontSize: "11px",
    background: "#f0f0f0",
    color: "#777",
    borderRadius: "3px",
    padding: "2px 7px",
  },
} as const
