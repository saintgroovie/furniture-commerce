"use client"

import { useState } from "react"
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
  onSetVariantLabel?: (variantKey: string, label: string | null) => void
}

export function ColorVariantTabs({
  variants,
  activeVariantKey,
  productState,
  onSelect,
  onSetVariantLabel,
}: Props) {
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [draft, setDraft] = useState("")

  if (variants.length === 0) {
    return (
      <div style={styles.strip}>
        <span style={styles.empty}>Цветовые варианты не определены</span>
      </div>
    )
  }

  function displayLabel(variantKey: string, defaultLabel: string): string {
    return productState?.variantLabelOverrides?.[variantKey] ?? defaultLabel
  }

  function startEdit(variantKey: string, current: string) {
    setEditingKey(variantKey)
    setDraft(current)
  }

  function commitEdit(variantKey: string, defaultLabel: string) {
    const trimmed = draft.trim()
    if (!onSetVariantLabel) {
      setEditingKey(null)
      return
    }
    if (!trimmed || trimmed === defaultLabel) {
      onSetVariantLabel(variantKey, null)
    } else {
      onSetVariantLabel(variantKey, trimmed)
    }
    setEditingKey(null)
  }

  return (
    <div style={styles.strip}>
      {variants.map(({ variantKey, label: defaultLabel }) => {
        const isActive = activeVariantKey === variantKey
        const status = getVariantStatus(variantKey, productState)
        const dot = STATUS_DOT[status]
        const label = displayLabel(variantKey, defaultLabel)
        const isEditing = editingKey === variantKey
        const canEdit = variantKey !== "__all__" && !!onSetVariantLabel

        return (
          <div
            key={variantKey}
            style={{ ...styles.tabWrap, ...(isActive ? styles.tabWrapActive : {}) }}
          >
            {isEditing ? (
              <input
                style={styles.editInput}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit(variantKey, defaultLabel)
                  if (e.key === "Escape") setEditingKey(null)
                }}
                onBlur={() => commitEdit(variantKey, defaultLabel)}
                autoFocus
                aria-label="Название цвета"
              />
            ) : (
              <button
                onClick={() => onSelect(variantKey)}
                style={{ ...styles.tab, ...(isActive ? styles.tabActive : {}) }}
                title={`${label} — ${status}`}
              >
                <span style={{ color: dot.color, fontSize: "13px", lineHeight: 1 }}>{dot.label}</span>
                <span>{label}</span>
              </button>
            )}
            {canEdit && !isEditing && (
              <button
                type="button"
                style={{ ...styles.editBtn, ...(isActive ? styles.editBtnActive : {}) }}
                onClick={(e) => {
                  e.stopPropagation()
                  startEdit(variantKey, label)
                }}
                title="Изменить название цвета"
                aria-label={`Изменить «${label}»`}
              >
                ✎
              </button>
            )}
          </div>
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
  tabWrap: {
    display: "inline-flex",
    alignItems: "center",
    gap: "2px",
    borderRadius: "12px",
    border: "1px solid #ddd",
    background: "#fff",
  },
  tabWrapActive: {
    borderColor: "#1a3a6e",
    background: "#1a3a6e",
  },
  tab: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "4px 10px",
    fontSize: "12px",
    border: "none",
    borderRadius: "12px",
    background: "transparent",
    color: "#333",
    cursor: "pointer",
    fontWeight: 500,
  },
  tabActive: {
    color: "#fff",
  },
  editBtn: {
    padding: "2px 6px 2px 0",
    fontSize: "11px",
    border: "none",
    background: "transparent",
    color: "#888",
    cursor: "pointer",
    lineHeight: 1,
  },
  editBtnActive: {
    color: "#fff",
  },
  editInput: {
    fontSize: "12px",
    padding: "4px 8px",
    border: "1px solid #1a3a6e",
    borderRadius: "8px",
    minWidth: "100px",
    outline: "none",
  },
  empty: {
    fontSize: "12px",
    color: "#aaa",
    fontStyle: "italic",
  },
} as const
