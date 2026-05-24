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
import { GalleryStrip } from "./GalleryStrip"
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

      {/* Missing roles — always visible task bar, near top */}
      <MissingRoleStripDerived
        productState={productState}
        activeVariantKey={activeVariantKey}
        invById={invById}
        onFocusRole={onFocusRole}
      />

      {/* Onboarding hint — shown only before any assignment */}
      <OnboardingHint productState={productState} activeVariantKey={activeVariantKey} />

      {/* Role slots grid — the assignment canvas */}
      <RoleChecklistPanel
        productState={productState}
        activeVariantKey={activeVariantKey}
        invById={invById}
        onFocusRole={onFocusRole}
        onRemoveMain={onRemoveMain}
        onRemoveFromGallery={onRemoveFromGallery}
      />

      {/* Gallery — all assigned items, horizontal scroll */}
      <GalleryStrip
        galleryIds={productState?.galleriesByVariant[activeVariantKey] ?? []}
        invById={invById}
        onRemove={onRemoveFromGallery}
      />

      {/* Final apply-order preview */}
      <FinalMediaOrderBlock
        mainMediaId={(productState?.rolesByVariant[activeVariantKey]?.main as string | null | undefined) ?? null}
        galleryIds={productState?.galleriesByVariant[activeVariantKey] ?? []}
        invById={invById}
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
}: {
  productState: V2ProductState | null
  activeVariantKey: string
  invById: Map<string, InvItem>
  onFocusRole: (slot: V2RoleSlot) => void
}) {
  const missingSlots = useMemo(() => {
    const rows = computeRoleRows(productState, activeVariantKey, invById)
    return rows.filter((r) => !r.isCovered).map((r) => r.slot)
  }, [productState, activeVariantKey, invById])

  return <MissingRoleStrip missingSlots={missingSlots} onFocusRole={onFocusRole} />
}

// ---------------------------------------------------------------------------
// Final apply-order block — shows thumbnail + gallery[1..N] in apply order
// ---------------------------------------------------------------------------

const GALLERY_SLOT_COUNT = 5

function FinalMediaOrderBlock({
  mainMediaId,
  galleryIds,
  invById,
}: {
  mainMediaId: string | null
  galleryIds: string[]
  invById: Map<string, InvItem>
}) {
  const [collapsed, setCollapsed] = useState(false)

  const hasContent = mainMediaId || galleryIds.length > 0
  if (!hasContent) return null

  const thumbInv = mainMediaId ? invById.get(mainMediaId) : null
  const thumbPreview = thumbInv ? clientPreview(thumbInv) : null

  const slots = Array.from({ length: GALLERY_SLOT_COUNT }, (_, i) => {
    const mediaId = galleryIds[i] ?? null
    const inv = mediaId ? invById.get(mediaId) : null
    const preview = inv ? clientPreview(inv) : null
    return { mediaId, inv, preview, pos: i + 1 }
  })

  return (
    <div style={fmoStyles.block}>
      <div style={fmoStyles.header}>
        <span style={fmoStyles.headerLabel}>Порядок экспорта</span>
        <span style={fmoStyles.headerSub}>thumbnail + gallery[1–{GALLERY_SLOT_COUNT}]</span>
        <button
          style={fmoStyles.collapseBtn}
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Развернуть" : "Свернуть"}
        >
          {collapsed ? "▸" : "▾"}
        </button>
      </div>

      {!collapsed && (
        <div style={fmoStyles.strip}>
          {/* Slot 0: thumbnail */}
          <div style={fmoStyles.slot}>
            <div style={fmoStyles.slotNum}>TH</div>
            <div style={{ ...fmoStyles.thumb, ...fmoStyles.thumbMain }}>
              {thumbPreview?.url ? (
                <img src={thumbPreview.url} alt="thumbnail" style={fmoStyles.thumbImg} loading="lazy" />
              ) : (
                <span style={fmoStyles.thumbEmpty}>
                  {mainMediaId ? "?" : "–"}
                </span>
              )}
            </div>
            <div style={fmoStyles.slotLabel}>
              {thumbInv
                ? (thumbInv.filename.length > 14 ? thumbInv.filename.slice(0, 11) + "…" : thumbInv.filename)
                : <span style={fmoStyles.emptyLabel}>не задано</span>}
            </div>
          </div>

          {/* Divider */}
          <div style={fmoStyles.divider} />

          {/* Gallery slots 1–N */}
          {slots.map(({ mediaId, inv, preview, pos }) => (
            <div key={pos} style={fmoStyles.slot}>
              <div style={fmoStyles.slotNum}>{pos}</div>
              <div style={fmoStyles.thumb}>
                {preview?.url ? (
                  <img src={preview.url} alt={`gallery ${pos}`} style={fmoStyles.thumbImg} loading="lazy" />
                ) : (
                  <span style={fmoStyles.thumbEmpty}>
                    {mediaId ? "?" : "–"}
                  </span>
                )}
              </div>
              <div style={fmoStyles.slotLabel}>
                {inv
                  ? (inv.filename.length > 14 ? inv.filename.slice(0, 11) + "…" : inv.filename)
                  : <span style={fmoStyles.emptyLabel}>пусто</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const fmoStyles = {
  block: {
    borderTop: "2px solid #e8f0ff",
    background: "#f8faff",
    flexShrink: 0,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 14px 5px",
  },
  headerLabel: {
    fontSize: "10px",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    color: "#1a3a6e",
  },
  headerSub: {
    fontSize: "10px",
    color: "#aaa",
    flex: 1,
  },
  collapseBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: "12px",
    color: "#aaa",
    padding: "0 2px",
    lineHeight: 1,
    flexShrink: 0,
  },
  strip: {
    display: "flex",
    alignItems: "flex-start",
    gap: "4px",
    padding: "4px 14px 10px",
    overflowX: "auto" as const,
  },
  slot: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: "3px",
    flexShrink: 0,
    width: "62px",
  },
  slotNum: {
    fontSize: "9px",
    fontWeight: 700,
    color: "#999",
    letterSpacing: "0.04em",
  },
  thumb: {
    width: "62px",
    height: "62px",
    border: "1px solid #e0e0e0",
    borderRadius: "4px",
    background: "#f0f0f0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
  thumbMain: {
    border: "2px solid #1a3a6e",
    background: "#eef3ff",
  },
  thumbImg: {
    width: "100%",
    height: "100%",
    objectFit: "contain" as const,
    display: "block",
  },
  thumbEmpty: {
    fontSize: "16px",
    color: "#ccc",
    lineHeight: 1,
  },
  slotLabel: {
    fontSize: "9px",
    color: "#888",
    textAlign: "center" as const,
    lineHeight: 1.2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    width: "100%",
  },
  emptyLabel: {
    color: "#ccc",
    fontStyle: "italic" as const,
  },
  divider: {
    width: "1px",
    height: "62px",
    background: "#dde4f5",
    marginTop: "16px",
    flexShrink: 0,
    alignSelf: "flex-start" as const,
  },
} as const

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  root: {
    overflowY: "auto" as const,
    background: "#fafafa",
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
