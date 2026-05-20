"use client"

import { useMemo } from "react"
import type {
  InvItem,
  ProductRow,
  V2ColorVariant,
  V2ProductState,
  V2RoleSlot,
} from "./legacy-board-v2-types"
import { clientPreview } from "./MediaCardV2"
import { ColorVariantTabs } from "./ColorVariantTabs"
import { RoleChecklistPanel, computeRoleRows } from "./RoleChecklistPanel"
import { MissingRoleStrip } from "./MissingRoleStrip"
import { GalleryStrip } from "./GalleryStrip"

const SLOT_TO_FILTER = {
  main: "front",
  front_anfas: "front",
  front_3_4: "3_4",
  interior: "interior",
  detail: "detail",
  lifestyle: "lifestyle",
  scheme: "scheme",
} as const

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
          <div>Выберите продукт из левой панели</div>
        </div>
      </main>
    )
  }

  const product = products.find((p) => p.handle === selectedHandle)

  return (
    <main style={styles.root}>
      {/* Product header */}
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

      {/* Main photo area */}
      <MainPhotoArea
        activeVariantKey={activeVariantKey}
        productState={productState}
        invById={invById}
        onRemoveMain={onRemoveMain}
      />

      {/* Role checklist */}
      <RoleChecklistPanel
        productState={productState}
        activeVariantKey={activeVariantKey}
        invById={invById}
        onFocusRole={onFocusRole}
      />

      {/* Gallery strip */}
      <GalleryStrip
        galleryIds={productState?.galleriesByVariant[activeVariantKey] ?? []}
        invById={invById}
        onRemove={onRemoveFromGallery}
      />

      {/* Missing role strip */}
      <MissingRoleStripDerived
        productState={productState}
        activeVariantKey={activeVariantKey}
        invById={invById}
        onFocusRole={onFocusRole}
      />
    </main>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MainPhotoArea({
  activeVariantKey,
  productState,
  invById,
  onRemoveMain,
}: {
  activeVariantKey: string
  productState: V2ProductState | null
  invById: Map<string, InvItem>
  onRemoveMain: () => void
}) {
  const mainId = productState?.rolesByVariant[activeVariantKey]?.main ?? null
  const mainInv = mainId ? invById.get(mainId) : null
  const preview = mainInv ? clientPreview(mainInv) : null
  const showImg = preview?.url != null

  return (
    <div style={styles.mainArea}>
      <div style={styles.mainLabel}>Главное фото</div>
      {mainInv ? (
        <div style={styles.mainPhotoWrap}>
          {showImg ? (
            <img
              src={preview!.url!}
              alt={mainInv.filename}
              style={styles.mainImg}
              loading="lazy"
              onError={(e) => { e.currentTarget.style.display = "none" }}
            />
          ) : (
            <div style={styles.mainNoImg}>
              <span style={{ fontSize: "24px" }}>🖼</span>
              <span style={{ fontSize: "11px", color: "#888" }}>{mainInv.filename}</span>
            </div>
          )}
          <div style={styles.mainMeta}>
            <span style={styles.mainFilename}>{mainInv.filename}</span>
            <button style={styles.removeMainBtn} onClick={onRemoveMain} title="Убрать главное фото">
              Убрать
            </button>
          </div>
        </div>
      ) : (
        <div style={styles.mainEmpty}>
          <span style={{ fontSize: "11px", color: "#bbb" }}>
            Нажмите «Главное» на карточке пула
          </span>
        </div>
      )}
    </div>
  )
}

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
    color: "#bbb",
    fontSize: "14px",
    padding: "40px",
  },
  emptyIcon: {
    fontSize: "36px",
  },
  productHeader: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 14px",
    background: "#fff",
    borderBottom: "1px solid #eee",
    flexWrap: "wrap" as const,
    flexShrink: 0,
  },
  handleChip: {
    fontWeight: 700,
    fontSize: "13px",
    background: "#e8f0ff",
    color: "#1a3a6e",
    borderRadius: "4px",
    padding: "2px 8px",
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
    padding: "1px 6px",
  },
  mainArea: {
    padding: "8px 14px",
    borderBottom: "1px solid #eee",
    background: "#fff",
    flexShrink: 0,
  },
  mainLabel: {
    fontSize: "10px",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    color: "#888",
    marginBottom: "6px",
  },
  mainPhotoWrap: {
    display: "flex",
    gap: "10px",
    alignItems: "center",
  },
  mainImg: {
    width: "80px",
    height: "80px",
    objectFit: "contain" as const,
    borderRadius: "4px",
    border: "1px solid #e0e0e0",
    background: "#f5f5f5",
  },
  mainNoImg: {
    width: "80px",
    height: "80px",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
    borderRadius: "4px",
    border: "1px solid #e0e0e0",
    background: "#f5f5f5",
  },
  mainMeta: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "5px",
    flex: 1,
    overflow: "hidden",
  },
  mainFilename: {
    fontSize: "11px",
    color: "#555",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  removeMainBtn: {
    fontSize: "11px",
    padding: "2px 8px",
    border: "1px solid #ffbbbb",
    borderRadius: "3px",
    background: "#fff5f5",
    color: "#a33",
    cursor: "pointer",
    alignSelf: "flex-start" as const,
  },
  mainEmpty: {
    height: "44px",
    display: "flex",
    alignItems: "center",
    padding: "0 4px",
  },
} as const
