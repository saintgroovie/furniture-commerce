"use client"

import { useState } from "react"
import type {
  V2ColorVariant,
  V2OperatorRemovedVariant,
  V2ProductState,
} from "./legacy-board-v2-types"
import { labelToVariantKey, isPseudoColorVariantKey } from "./legacy-board-v2-color-variants"

type VariantStatus = "empty" | "partial" | "filled"

const REMOVE_CONFIRM =
  "Удалить цвет из этой QA-разметки? Назначения этого цвета будут скрыты из export. Это не меняет базу и каталог."

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
  /** Primary/default color tab (milk-like) — shows «основной» badge */
  primaryVariantKey?: string | null
  onSelect: (variantKey: string) => void
  onSetVariantLabel?: (variantKey: string, label: string | null) => void
  onAddVariant?: (label: string) => { ok: boolean; key?: string; message?: string }
  onRemoveVariant?: (variantKey: string, label: string) => void
  onRestoreVariant?: (variantKey: string) => void
  removedVariants?: V2OperatorRemovedVariant[]
}

export function ColorVariantTabs({
  variants,
  activeVariantKey,
  productState,
  primaryVariantKey = null,
  onSelect,
  onSetVariantLabel,
  onAddVariant,
  onRemoveVariant,
  onRestoreVariant,
  removedVariants = [],
}: Props) {
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [showAddForm, setShowAddForm] = useState(false)
  const [addLabel, setAddLabel] = useState("")
  const [addHint, setAddHint] = useState<string | null>(null)
  const [pendingRemove, setPendingRemove] = useState<{ key: string; label: string } | null>(null)

  if (variants.length === 0 && removedVariants.length === 0) {
    return (
      <div style={styles.strip}>
        <span style={styles.empty}>Цветовые варианты не определены</span>
        {onAddVariant && (
          <AddColorButton onClick={() => setShowAddForm(true)} />
        )}
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

  function handleAddSubmit() {
    if (!onAddVariant) return
    const result = onAddVariant(addLabel)
    if (result.ok && result.key) {
      setAddLabel("")
      setAddHint(null)
      setShowAddForm(false)
      onSelect(result.key)
      return
    }
    if (result.key) {
      setAddHint(result.message ?? "Цвет уже есть — переключились на вкладку.")
      onSelect(result.key)
    } else {
      setAddHint(result.message ?? "Введите название цвета.")
    }
  }

  function handleRemoveConfirm() {
    if (!pendingRemove || !onRemoveVariant) return
    onRemoveVariant(pendingRemove.key, pendingRemove.label)
    setPendingRemove(null)
  }

  const previewKey = addLabel.trim() ? labelToVariantKey(addLabel) : ""

  return (
    <div style={styles.wrap}>
      <div style={styles.strip}>
        {variants.map(({ variantKey, label: defaultLabel, source }) => {
          const isActive = activeVariantKey === variantKey
          const status = getVariantStatus(variantKey, productState)
          const dot = STATUS_DOT[status]
          const label = displayLabel(variantKey, defaultLabel)
          const isEditing = editingKey === variantKey
          const isPseudo = isPseudoColorVariantKey(variantKey)
          const canEdit = !isPseudo && !!onSetVariantLabel
          const canRemove = !isPseudo && !!onRemoveVariant
          const isPrimary = primaryVariantKey === variantKey && !isPseudo

          return (
            <div
              key={variantKey}
              style={{
                ...styles.tabWrap,
                ...(isActive ? styles.tabWrapActive : {}),
                ...(variantKey === "__needs_color__" ? styles.tabWrapUnresolved : {}),
              }}
              data-v2-color-tab={variantKey}
              data-v2-color-primary={isPrimary ? "true" : undefined}
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
                  type="button"
                  onClick={() => onSelect(variantKey)}
                  style={{ ...styles.tab, ...(isActive ? styles.tabActive : {}) }}
                  title={`${label}${isPrimary ? " · основной" : ""} — ${status}${source === "operator" ? " · добавлен" : ""}`}
                >
                  <span style={{ color: dot.color, fontSize: "13px", lineHeight: 1 }}>{dot.label}</span>
                  <span>{label}</span>
                  {isPrimary && (
                    <span style={{ ...styles.primaryBadge, ...(isActive ? styles.primaryBadgeActive : {}) }}>
                      основной
                    </span>
                  )}
                  {source === "operator" && <span style={styles.opBadge}>+</span>}
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
              {canRemove && !isEditing && (
                <button
                  type="button"
                  style={{ ...styles.removeBtn, ...(isActive ? styles.removeBtnActive : {}) }}
                  onClick={(e) => {
                    e.stopPropagation()
                    setPendingRemove({ key: variantKey, label })
                  }}
                  title="Удалить цвет из QA-разметки"
                  aria-label={`Удалить «${label}»`}
                >
                  ×
                </button>
              )}
            </div>
          )
        })}

        {onAddVariant && !showAddForm && <AddColorButton onClick={() => setShowAddForm(true)} />}
      </div>

      {showAddForm && onAddVariant && (
        <div style={styles.addForm} data-v2-add-color-form>
          <label style={styles.addLabel}>
            Название цвета
            <input
              style={styles.addInput}
              value={addLabel}
              onChange={(e) => {
                setAddLabel(e.target.value)
                setAddHint(null)
              }}
              placeholder="Молочный"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddSubmit()
                if (e.key === "Escape") setShowAddForm(false)
              }}
              autoFocus
            />
          </label>
          {previewKey && (
            <span style={styles.keyPreview}>ключ: {previewKey}</span>
          )}
          <div style={styles.addActions}>
            <button type="button" style={styles.addConfirm} onClick={handleAddSubmit}>
              Добавить
            </button>
            <button
              type="button"
              style={styles.addCancel}
              onClick={() => {
                setShowAddForm(false)
                setAddLabel("")
                setAddHint(null)
              }}
            >
              Отмена
            </button>
          </div>
          {addHint && <div style={styles.addHint}>{addHint}</div>}
        </div>
      )}

      {removedVariants.length > 0 && onRestoreVariant && (
        <div style={styles.removedRow}>
          <span style={styles.removedLabel}>Скрытые:</span>
          {removedVariants.map((r) => (
            <button
              key={r.key}
              type="button"
              style={styles.restoreBtn}
              onClick={() => onRestoreVariant(r.key)}
              title={`Восстановить «${r.label}» (${r.assignment_counts.gallery} гал., ${r.assignment_counts.roles} ролей)`}
            >
              ↩ {r.label}
            </button>
          ))}
        </div>
      )}

      {pendingRemove && (
        <div style={styles.confirmBox} role="alertdialog" aria-label="Подтверждение удаления цвета">
          <p style={styles.confirmText}>{REMOVE_CONFIRM}</p>
          <p style={styles.confirmMeta}>
            Цвет: <strong>{pendingRemove.label}</strong> ({pendingRemove.key})
          </p>
          <div style={styles.confirmActions}>
            <button type="button" style={styles.confirmDanger} onClick={handleRemoveConfirm}>
              Удалить цвет
            </button>
            <button type="button" style={styles.confirmCancel} onClick={() => setPendingRemove(null)}>
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function AddColorButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" style={styles.addColorBtn} onClick={onClick} data-v2-add-color-trigger>
      + Цвет
    </button>
  )
}

const styles = {
  wrap: {
    flexShrink: 0,
    borderBottom: "1px solid #eee",
    background: "#fafafa",
  },
  strip: {
    display: "flex",
    flexWrap: "wrap" as const,
    alignItems: "center",
    gap: "4px",
    padding: "5px 12px 4px",
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
  tabWrapUnresolved: {
    borderStyle: "dashed" as const,
    borderColor: "#c9a227",
    background: "#fffbf0",
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
  opBadge: {
    fontSize: "9px",
    fontWeight: 700,
    opacity: 0.85,
  },
  primaryBadge: {
    fontSize: "9px",
    fontWeight: 600,
    padding: "1px 5px",
    borderRadius: "6px",
    background: "#e8f0ff",
    color: "#1a3a6e",
    lineHeight: 1.2,
  },
  primaryBadgeActive: {
    background: "rgba(255,255,255,0.22)",
    color: "#fff",
  },
  editBtn: {
    padding: "2px 4px 2px 0",
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
  removeBtn: {
    padding: "2px 6px 2px 0",
    fontSize: "13px",
    border: "none",
    background: "transparent",
    color: "#a33",
    cursor: "pointer",
    lineHeight: 1,
    fontWeight: 700,
  },
  removeBtnActive: {
    color: "#ffcccc",
  },
  editInput: {
    fontSize: "12px",
    padding: "4px 8px",
    border: "1px solid #1a3a6e",
    borderRadius: "8px",
    minWidth: "100px",
    outline: "none",
  },
  addColorBtn: {
    padding: "4px 10px",
    fontSize: "12px",
    border: "1px dashed #1a3a6e",
    borderRadius: "12px",
    background: "#eef3ff",
    color: "#1a3a6e",
    cursor: "pointer",
    fontWeight: 600,
  },
  addForm: {
    display: "flex",
    flexWrap: "wrap" as const,
    alignItems: "center",
    gap: "8px",
    padding: "6px 14px 10px",
    borderTop: "1px solid #eee",
    background: "#f5f8ff",
  },
  addLabel: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "4px",
    fontSize: "11px",
    color: "#555",
    fontWeight: 600,
  },
  addInput: {
    fontSize: "12px",
    padding: "5px 8px",
    border: "1px solid #aacaff",
    borderRadius: "4px",
    minWidth: "140px",
  },
  keyPreview: {
    fontSize: "10px",
    color: "#888",
  },
  addActions: {
    display: "flex",
    gap: "6px",
  },
  addConfirm: {
    padding: "5px 12px",
    fontSize: "12px",
    border: "1px solid #1a3a6e",
    borderRadius: "4px",
    background: "#1a3a6e",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 600,
  },
  addCancel: {
    padding: "5px 12px",
    fontSize: "12px",
    border: "1px solid #ddd",
    borderRadius: "4px",
    background: "#fff",
    color: "#555",
    cursor: "pointer",
  },
  addHint: {
    flex: "1 1 100%",
    fontSize: "11px",
    color: "#7a4800",
    background: "#fff8e8",
    padding: "4px 8px",
    borderRadius: "4px",
    border: "1px solid #f0d080",
  },
  removedRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    alignItems: "center",
    gap: "6px",
    padding: "4px 14px 8px",
    fontSize: "11px",
  },
  removedLabel: {
    color: "#888",
    fontWeight: 600,
  },
  restoreBtn: {
    padding: "2px 8px",
    fontSize: "11px",
    border: "1px solid #ddd",
    borderRadius: "10px",
    background: "#fff",
    color: "#1a3a6e",
    cursor: "pointer",
  },
  confirmBox: {
    margin: "0 14px 10px",
    padding: "10px 12px",
    background: "#fff5f5",
    border: "1px solid #ffcccc",
    borderRadius: "6px",
  },
  confirmText: {
    margin: "0 0 6px",
    fontSize: "12px",
    color: "#633",
    lineHeight: 1.45,
  },
  confirmMeta: {
    margin: "0 0 8px",
    fontSize: "11px",
    color: "#666",
  },
  confirmActions: {
    display: "flex",
    gap: "8px",
  },
  confirmDanger: {
    padding: "5px 12px",
    fontSize: "12px",
    border: "1px solid #c44",
    borderRadius: "4px",
    background: "#fee",
    color: "#a33",
    cursor: "pointer",
    fontWeight: 700,
  },
  confirmCancel: {
    padding: "5px 12px",
    fontSize: "12px",
    border: "1px solid #ddd",
    borderRadius: "4px",
    background: "#fff",
    cursor: "pointer",
  },
  empty: {
    fontSize: "12px",
    color: "#aaa",
    fontStyle: "italic",
  },
} as const
