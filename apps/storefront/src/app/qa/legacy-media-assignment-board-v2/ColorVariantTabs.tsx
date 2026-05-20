"use client"

import type { V2ColorVariant, V2ProductState } from "./legacy-board-v2-types"

type VariantStatus = "empty" | "partial" | "filled"

function getVariantStatus(variantKey: string, productState: V2ProductState | null): VariantStatus {
  if (!productState) return "empty"
  const hasMain = !!(productState.rolesByVariant[variantKey]?.main)
  const galleryCount = productState.galleriesByVariant[variantKey]?.length ?? 0
  if (hasMain && galleryCount > 0) return "filled"
  if (hasMain || galleryCount > 0) return "partial"
  return "empty"
}

const STATUS_DOT: Record<VariantStatus, { color: string; label: string }> = {
  filled: { color: "#2d7a2d", label: "●" },
  partial: { color: "#e09000", label: "◑" },
  empty: { color: "#ccc", label: "○" },
}

type Props = {
  variants: V2ColorVariant[]
  activeVariantKey: string
  productState: V2ProductState | null
  onSelect: (variantKey: string) => void
}

export function ColorVariantTabs({ variants, activeVariantKey, productState, onSelect }: Props) {
  if (variants.length === 0) {
    return (
      <div style={styles.strip}>
        <span style={styles.empty}>Цветовые варианты не определены</span>
      </div>
    )
  }

  return (
    <div style={styles.strip}>
      {variants.map(({ variantKey, label }) => {
        const isActive = activeVariantKey === variantKey
        const status = getVariantStatus(variantKey, productState)
        const dot = STATUS_DOT[status]
        return (
          <button
            key={variantKey}
            onClick={() => onSelect(variantKey)}
            style={{ ...styles.tab, ...(isActive ? styles.tabActive : {}) }}
            title={`${label} — ${status}`}
          >
            <span style={{ color: dot.color, fontSize: "13px", lineHeight: 1 }}>{dot.label}</span>
            <span>{label}</span>
          </button>
        )
      })}
    </div>
  )
}

const styles = {
  strip: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "4px",
    padding: "8px 14px",
    borderBottom: "1px solid #eee",
    background: "#fafafa",
    flexShrink: 0,
  },
  tab: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "4px 10px",
    fontSize: "12px",
    border: "1px solid #ddd",
    borderRadius: "12px",
    background: "#fff",
    color: "#333",
    cursor: "pointer",
    fontWeight: 500,
  },
  tabActive: {
    background: "#1a3a6e",
    borderColor: "#1a3a6e",
    color: "#fff",
  },
  empty: {
    fontSize: "12px",
    color: "#aaa",
    fontStyle: "italic",
  },
} as const
