"use client"

import { useMemo } from "react"
import type {
  InvItem,
  ProductRow,
  V2ColorVariant,
  V2OperatorRemovedVariant,
  V2ProductState,
  V2RoleSlot,
} from "./legacy-board-v2-types"
import { ColorVariantTabs } from "./ColorVariantTabs"
import { NEEDS_COLOR_VARIANT_KEY, NEEDS_COLOR_VARIANT_TITLE_RU } from "./legacy-board-v2-color-variants"
import { RoleChecklistPanel, computeRoleRows } from "./RoleChecklistPanel"
import { MissingRoleStrip } from "./MissingRoleStrip"
import { StorefrontGallerySection } from "./GalleryStrip"

type Props = {
  selectedHandle: string | null
  products: ProductRow[]
  colorVariants: V2ColorVariant[]
  activeVariantKey: string
  primaryVariantKey?: string | null
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
  onSetVariantLabel?: (variantKey: string, label: string | null) => void
  onAddVariant?: (label: string) => { ok: boolean; key?: string; message?: string }
  onRemoveVariant?: (variantKey: string, label: string) => void
  onRestoreVariant?: (variantKey: string) => void
  removedVariants?: V2OperatorRemovedVariant[]
}

export function ProductWorkspace({
  selectedHandle,
  products,
  colorVariants,
  activeVariantKey,
  primaryVariantKey = null,
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
  onSetVariantLabel,
  onAddVariant,
  onRemoveVariant,
  onRestoreVariant,
  removedVariants,
}: Props) {
  const galleryIds = productState?.galleriesByVariant[activeVariantKey] ?? []
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
          primaryVariantKey={primaryVariantKey}
          productState={productState}
          onSelect={onSetVariant}
          onSetVariantLabel={onSetVariantLabel}
          onAddVariant={onAddVariant}
          onRemoveVariant={onRemoveVariant}
          onRestoreVariant={onRestoreVariant}
          removedVariants={removedVariants}
        />

        {/* Readiness: missing roles + one compact instruction card */}
        <div style={styles.readinessBlock}>
          {activeVariantKey === NEEDS_COLOR_VARIANT_KEY && <SharedColorlessHint />}
          <MissingRoleStripDerived
            productState={productState}
            activeVariantKey={activeVariantKey}
            invById={invById}
            onFocusRole={onFocusRole}
            roleOverrides={roleOverrides}
          />
          <WorkspaceInstructionCard
            productState={productState}
            activeVariantKey={activeVariantKey}
          />
        </div>
      </div>

      {/* ── Scrollable body: role board (primary) then gallery dock ── */}
      <div style={styles.scrollBody} data-v2-workspace-variant={activeVariantKey}>
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
          galleryIds={galleryIds}
          productHandle={selectedHandle}
        />

        <StorefrontGallerySection
          mainMediaId={(productState?.rolesByVariant[activeVariantKey]?.main as string | null | undefined) ?? null}
          galleryIds={productState?.galleriesByVariant[activeVariantKey] ?? []}
          variantRoles={productState?.rolesByVariant[activeVariantKey] ?? {}}
          invById={invById}
          onRemoveFromGallery={onRemoveFromGallery}
          onRemoveMain={onRemoveMain}
          onReorderGallery={onReorderGallery}
          onInsertIntoGallery={onInsertIntoGallery}
        />
      </div>
    </main>
  )
}

// ---------------------------------------------------------------------------
// Onboarding hint — only before any role is assigned
// ---------------------------------------------------------------------------

function SharedColorlessHint() {
  return (
    <div style={sharedHintStyles.card} data-v2-shared-colorless-hint>
      <p style={sharedHintStyles.text}>{NEEDS_COLOR_VARIANT_TITLE_RU}</p>
      <p style={sharedHintStyles.sub}>
        Используйте <strong>+ Галерея</strong> — кадр добавится в конец галереи каждого цвета.{" "}
        <strong>★ Главное</strong> назначайте на конкретном цвете.
      </p>
    </div>
  )
}

const sharedHintStyles = {
  card: {
    margin: "8px 14px 0",
    padding: "10px 12px",
    background: "#f5f7fb",
    border: "1px dashed #b8c4d8",
    borderRadius: "8px",
    flexShrink: 0,
  },
  text: {
    margin: "0 0 4px",
    fontSize: "12px",
    color: "#3a4460",
    lineHeight: 1.45,
    fontWeight: 500,
  },
  sub: {
    margin: 0,
    fontSize: "11px",
    color: "#5a6478",
    lineHeight: 1.45,
  },
} as const

function WorkspaceInstructionCard({
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
    <div style={hintStyles.card} data-v2-workspace-instruction>
      <p style={hintStyles.text}>
        <strong>Шаг 1.</strong> Назначьте <strong>★ Главное</strong> в пуле, затем заполните{" "}
        <strong>слоты ролей</strong> — витрина обновится автоматически. Перетащите карточки в
        галерее ниже, если нужно поменять порядок.
      </p>
    </div>
  )
}

const hintStyles = {
  card: {
    margin: "8px 14px 0",
    padding: "10px 12px",
    background: "#f0f6ff",
    border: "1px solid #d0e4ff",
    borderRadius: "8px",
    flexShrink: 0,
  },
  text: {
    margin: 0,
    fontSize: "12px",
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
    background: "#f8f9fb",
    borderBottom: "1px solid #e4e8ee",
  },
  readinessBlock: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0",
    paddingBottom: "2px",
  },
  scrollBody: {
    flex: 1,
    overflowY: "auto" as const,
    minHeight: 0,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "stretch",
    justifyContent: "flex-start",
    gap: "0",
    paddingTop: "0",
    paddingBottom: "8px",
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
    padding: "6px 12px",
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
