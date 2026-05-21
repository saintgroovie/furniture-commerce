"use client"

import { useMemo } from "react"
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
    </main>
  )
}

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
