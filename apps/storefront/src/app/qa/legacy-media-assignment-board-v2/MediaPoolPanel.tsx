"use client"

import React, { useMemo, useState } from "react"
import type { InvItem, CandidateEntry, V2RoleFilter, V2RoleSlot } from "./legacy-board-v2-types"
import type { VisualRole } from "@/app/qa/legacy-media-assignment-board/legacy-media-visual-role-ranking"
import {
  effectiveV2Filter,
  inferV2VisualRole,
} from "./legacy-board-v2-role-inference"
import { RoleFilterTabs } from "./RoleFilterTabs"
import { MediaCardV2, clientPreview } from "./MediaCardV2"
import {
  classifyMediaVariantScope,
  mediaMatchesVariantKey,
  type MediaVariantScope,
} from "./legacy-board-v2-color-variants"
import { resolvePoolUsageStatus } from "./legacy-board-v2-gallery-source"
import type { V2VariantRoleAssignment } from "./legacy-board-v2-types"

const POOL_LIMIT = 120

const SCOPE_SORT_ORDER: Record<MediaVariantScope, number> = {
  active: 0,
  neutral: 1,
  other_color: 2,
}

const SCOPE_GROUP_LABEL: Partial<Record<MediaVariantScope, string>> = {
  neutral: "Общие кадры",
  other_color: "Другие цвета",
}

function sortPoolByVariantScope(
  items: PoolItem[],
  productHandle: string,
  variantKey: string
): PoolItem[] {
  if (variantKey === "__all__") return items
  return [...items].sort((a, b) => {
    const sa = classifyMediaVariantScope(a.inv, productHandle, variantKey)
    const sb = classifyMediaVariantScope(b.inv, productHandle, variantKey)
    const scopeDiff = SCOPE_SORT_ORDER[sa] - SCOPE_SORT_ORDER[sb]
    if (scopeDiff !== 0) return scopeDiff
    if (a.previewOk !== b.previewOk) return a.previewOk ? -1 : 1
    return 0
  })
}

type PoolItem = {
  inv: InvItem
  role: VisualRole
  roleConfidence: "high" | "low" | "ambiguous"
  confidence: string | undefined
  identityConfidence: string | undefined
  previewOk: boolean
  /** Effective pool filter: override → v2 inference */
  effectiveFilter: V2RoleFilter
}

type Props = {
  selectedHandle: string | null
  invById: Map<string, InvItem>
  candidatesByHandle: Map<string, string[]>
  entryByInventoryId: Map<string, CandidateEntry>
  activeFilter: V2RoleFilter
  onSetFilter: (f: V2RoleFilter) => void
  onSetMain: (mediaId: string) => void
  onAddToGallery: (mediaId: string) => void
  /** ID of the current main/thumbnail for the active variant */
  currentMainId?: string | null
  /** IDs already in the gallery for the active variant */
  currentGalleryIds?: string[]
  /** Operator role overrides keyed by media ID */
  roleOverrides?: Record<string, V2RoleSlot>
  /** Called when operator changes a media item's role override */
  onSetRoleOverride?: (mediaId: string, role: V2RoleSlot | null) => void
  /** Active color tab — pool badges use only this variant's assignments */
  activeVariantKey?: string
  /** Role slots for active variant (for transparent pool status) */
  variantRoles?: V2VariantRoleAssignment
}

/** Role label used in empty-filter message */
const FILTER_LABEL_RU: Partial<Record<V2RoleFilter, string>> = {
  front: "Фронт",
  "3_4": "3/4",
  interior: "Внутри",
  detail: "Деталь",
  lifestyle: "Lifestyle",
  scheme: "Схема",
  no_preview: "Без превью",
  unused: "Свободные",
  selected: "Выбранные",
}

export function MediaPoolPanel({
  selectedHandle,
  invById,
  candidatesByHandle,
  entryByInventoryId,
  activeFilter,
  onSetFilter,
  onSetMain,
  onAddToGallery,
  currentMainId,
  currentGalleryIds,
  roleOverrides,
  onSetRoleOverride,
  activeVariantKey = "__all__",
  variantRoles = {},
}: Props) {
  const [hideNoPreview, setHideNoPreview] = useState(false)

  // Build pool items — previewable sorted first in "all" view
  const poolItems = useMemo<PoolItem[]>(() => {
    if (!selectedHandle) return []
    const ids = candidatesByHandle.get(selectedHandle) ?? []
    const overrides = roleOverrides ?? {}
    const withPreview: PoolItem[] = []
    const noPreview: PoolItem[] = []
    for (const id of ids) {
      const inv = invById.get(id)
      if (!inv) continue
      const entry = entryByInventoryId.get(id)
      const inferred = inferV2VisualRole(inv, { productHandle: selectedHandle })
      const preview = clientPreview(inv)
      const effectiveFilter = effectiveV2Filter(inv, overrides, { productHandle: selectedHandle })
      const item: PoolItem = {
        inv,
        role: inferred.role,
        roleConfidence: inferred.confidence,
        confidence: entry?.confidence,
        identityConfidence: entry?.identity_confidence,
        previewOk: preview.url !== null,
        effectiveFilter,
      }
      if (item.previewOk) withPreview.push(item)
      else noPreview.push(item)
    }
    return [...withPreview, ...noPreview]
  }, [selectedHandle, invById, candidatesByHandle, entryByInventoryId, roleOverrides])

  const previewableCount = useMemo(() => poolItems.filter((i) => i.previewOk).length, [poolItems])
  const noPreviewCount = useMemo(() => poolItems.filter((i) => !i.previewOk).length, [poolItems])

  // Sets for fast membership checks
  const gallerySet = useMemo(() => new Set(currentGalleryIds ?? []), [currentGalleryIds])

  // Count per filter (for tab badges)
  const filterCounts = useMemo<Partial<Record<V2RoleFilter, number>>>(() => {
    const counts: Partial<Record<V2RoleFilter, number>> = { all: poolItems.length }
    for (const item of poolItems) {
      const f = item.effectiveFilter
      if (f !== "all") counts[f] = (counts[f] ?? 0) + 1
    }
    if (noPreviewCount > 0) counts["no_preview"] = noPreviewCount

    // Usage-state counts
    const selectedCount = poolItems.filter((i) => {
      if (!selectedHandle || !mediaMatchesVariantKey(i.inv, selectedHandle, activeVariantKey)) {
        return false
      }
      return i.inv.id === (currentMainId ?? null) || gallerySet.has(i.inv.id)
    }).length
    counts["selected"] = selectedCount
    counts["unused"] = poolItems.length - selectedCount

    return counts
  }, [poolItems, noPreviewCount, currentMainId, gallerySet, selectedHandle, activeVariantKey])

  // Apply active filter — in "all" mode items are already sorted previewable-first
  const filteredItems = useMemo<PoolItem[]>(() => {
    let items = poolItems

    // hideNoPreview toggle applies across all role filters
    if (hideNoPreview) items = items.filter((i) => i.previewOk)

    if (activeFilter === "all") {
      return selectedHandle
        ? sortPoolByVariantScope(items, selectedHandle, activeVariantKey)
        : items
    }
    if (activeFilter === "no_preview") return items.filter((i) => !i.previewOk)
    if (activeFilter === "unused") {
      return items.filter((i) => i.inv.id !== (currentMainId ?? null) && !gallerySet.has(i.inv.id))
    }
    if (activeFilter === "selected") {
      return items.filter((i) => i.inv.id === (currentMainId ?? null) || gallerySet.has(i.inv.id))
    }
    return items.filter((i) => i.effectiveFilter === activeFilter)
  }, [poolItems, activeFilter, hideNoPreview, currentMainId, gallerySet, selectedHandle, activeVariantKey])

  // Index at which non-previewable starts (only relevant in "all" mode without hideNoPreview)
  const separatorIdx =
    activeFilter === "all" && !hideNoPreview ? previewableCount : -1

  const displayed = filteredItems.slice(0, POOL_LIMIT)
  const total = filteredItems.length
  const totalAll = poolItems.length

  if (!selectedHandle) {
    return (
      <aside style={styles.panel}>
        <div style={styles.panelHeader}>Media pool</div>
        <div style={styles.empty}>Выберите продукт в левой панели.</div>
      </aside>
    )
  }

  // Rich count bar text
  const countBarText = (() => {
    if (totalAll === 0) return "Нет кандидатов для этого продукта."
    if (activeFilter === "all") {
      return `${totalAll} фото · ${previewableCount} с превью · ${noPreviewCount} без превью`
    }
    return `Показано ${displayed.length} из ${total} (всего ${totalAll})`
  })()

  return (
    <aside style={styles.panel}>
      {/* ── Sticky top: header + filters + toggles ── */}
      <div style={styles.poolStickyTop}>
        <div style={styles.panelHeader}>
          <span>Media pool</span>
          <span style={styles.handleChip}>{selectedHandle}</span>
        </div>

        <RoleFilterTabs
          activeFilter={activeFilter}
          counts={filterCounts}
          onFilter={onSetFilter}
        />

        {/* Hide-no-preview toggle */}
        <label style={styles.toggleRow}>
          <input
            type="checkbox"
            checked={hideNoPreview}
            onChange={(e) => setHideNoPreview(e.target.checked)}
            style={styles.toggleCheck}
          />
          <span style={styles.toggleLabel}>Скрыть без превью</span>
          {noPreviewCount > 0 && (
            <span style={styles.toggleCount}>{noPreviewCount}</span>
          )}
        </label>

        <div style={styles.countBar}>{countBarText}</div>
      </div>

      {/* ── Scrollable pool body ── */}
      <div style={styles.poolScroll}>
        {/* Empty filter — helpful message + reset */}
        {displayed.length === 0 && totalAll > 0 && (
          <div style={styles.emptyFilter}>
            <div style={styles.emptyFilterTitle}>
              {activeFilter === "selected"
                ? "Ни одного элемента не назначено — сначала выберите главное или добавьте в галерею."
                : activeFilter === "unused"
                ? "Все элементы уже назначены."
                : `Для роли «${FILTER_LABEL_RU[activeFilter] ?? activeFilter}» кандидатов не найдено.`}
            </div>
            <div style={styles.emptyFilterHint}>
              Попробуйте «Все» или назначьте роль вручную позже.
            </div>
            <button style={styles.resetBtn} onClick={() => onSetFilter("all")}>
              ← Сбросить фильтр
            </button>
          </div>
        )}

        <div style={styles.grid}>
          {displayed.map((item, idx) => {
            const showNoPreviewSeparator =
              idx === separatorIdx && separatorIdx > 0 && noPreviewCount > 0
            const scope =
              selectedHandle
                ? classifyMediaVariantScope(item.inv, selectedHandle, activeVariantKey)
                : "active"
            const prevScope =
              idx > 0 && selectedHandle && activeVariantKey !== "__all__" && activeFilter === "all"
                ? classifyMediaVariantScope(
                    displayed[idx - 1].inv,
                    selectedHandle,
                    activeVariantKey
                  )
                : null
            const scopeGroupLabel =
              activeFilter === "all" &&
              activeVariantKey !== "__all__" &&
              prevScope !== null &&
              prevScope !== scope
                ? SCOPE_GROUP_LABEL[scope]
                : null
            const usage = resolvePoolUsageStatus(
              item.inv.id,
              variantRoles,
              currentGalleryIds ?? [],
              scope
            )
            return (
              <React.Fragment key={item.inv.id}>
                {scopeGroupLabel && (
                  <div style={styles.scopeSeparator} data-v2-pool-scope-group={scope}>
                    <span style={styles.scopeSeparatorLabel}>{scopeGroupLabel}</span>
                  </div>
                )}
                {showNoPreviewSeparator && (
                  <div style={styles.separator}>
                    <span style={styles.separatorLabel}>Без превью · {noPreviewCount}</span>
                  </div>
                )}
                <MediaCardV2
                  inv={item.inv}
                  role={item.role}
                  roleConfidence={item.roleConfidence}
                  confidence={item.confidence}
                  identityConfidence={item.identityConfidence}
                  selectedHandle={selectedHandle}
                  onSetMain={onSetMain}
                  onAddToGallery={onAddToGallery}
                  compact={!item.previewOk}
                  isMain={usage.isMain}
                  isInGallery={usage.isInGallery}
                  poolUsageLine={usage.statusLine || undefined}
                  poolMuted={usage.poolMuted}
                  isDimmed={false}
                  roleOverride={(roleOverrides ?? {})[item.inv.id] ?? null}
                  onSetRoleOverride={onSetRoleOverride}
                />
              </React.Fragment>
            )
          })}
        </div>

        {total > POOL_LIMIT && (
          <div style={styles.capNote}>
            Показаны первые {POOL_LIMIT} из {total}. Используйте фильтры для сужения выборки.
          </div>
        )}
      </div>
    </aside>
  )
}

const styles = {
  panel: {
    borderLeft: "1px solid #ddd",
    overflow: "hidden" as const,
    background: "#fff",
    display: "flex",
    flexDirection: "column" as const,
  },
  poolStickyTop: {
    flexShrink: 0,
  },
  poolScroll: {
    flex: 1,
    overflowY: "auto" as const,
    minHeight: 0,
  },
  panelHeader: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "9px 14px",
    fontWeight: 700,
    fontSize: "11px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    color: "#333",
    borderBottom: "1px solid #eee",
    background: "#f5f5f5",
    flexShrink: 0,
  },
  handleChip: {
    fontSize: "11px",
    background: "#e8f0ff",
    color: "#1a3a6e",
    borderRadius: "4px",
    padding: "1px 6px",
    fontWeight: 600,
    textTransform: "none" as const,
    letterSpacing: 0,
  },
  toggleRow: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "5px 12px",
    borderBottom: "1px solid #f0f0f0",
    cursor: "pointer",
    flexShrink: 0,
    userSelect: "none" as const,
  },
  toggleCheck: {
    cursor: "pointer",
    flexShrink: 0,
  },
  toggleLabel: {
    fontSize: "11px",
    color: "#555",
    flex: 1,
  },
  toggleCount: {
    fontSize: "10px",
    background: "#e8e8e8",
    color: "#666",
    borderRadius: "8px",
    padding: "0 5px",
    fontWeight: 600,
  },
  countBar: {
    padding: "5px 12px",
    fontSize: "11px",
    color: "#666",
    borderBottom: "1px solid #f0f0f0",
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums" as const,
  },
  empty: {
    padding: "20px 14px",
    color: "#aaa",
    fontSize: "13px",
  },
  emptyFilter: {
    padding: "16px 16px 18px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "6px",
    borderBottom: "1px solid #f0f0f0",
    background: "#fafafa",
  },
  emptyFilterTitle: {
    fontSize: "13px",
    color: "#555",
    fontWeight: 500,
  },
  emptyFilterHint: {
    fontSize: "12px",
    color: "#aaa",
  },
  resetBtn: {
    alignSelf: "flex-start" as const,
    marginTop: "4px",
    padding: "5px 12px",
    fontSize: "12px",
    border: "1px solid #ddd",
    borderRadius: "4px",
    background: "#fff",
    color: "#1a3a6e",
    cursor: "pointer",
    fontWeight: 600,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "5px",
    padding: "6px",
    alignItems: "start",
    // No overflowY here — let the parent aside scroll (double scroll-container bug)
  },
  scopeSeparator: {
    gridColumn: "1 / -1",
    display: "flex",
    alignItems: "center",
    minHeight: "18px",
    maxHeight: "22px",
    padding: "2px 2px 0",
    margin: 0,
    borderTop: "1px solid #eceef2",
  },
  scopeSeparatorLabel: {
    fontSize: "9px",
    fontWeight: 700,
    color: "#7a8494",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    whiteSpace: "nowrap" as const,
    lineHeight: 1.2,
  },
  separator: {
    gridColumn: "1 / -1",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 0 2px",
  },
  separatorLabel: {
    fontSize: "10px",
    color: "#bbb",
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    padding: "2px 8px",
    background: "#f5f5f5",
    borderRadius: "10px",
    border: "1px solid #e8e8e8",
  },
  capNote: {
    padding: "8px 12px",
    fontSize: "11px",
    color: "#aaa",
    borderTop: "1px solid #f0f0f0",
    flexShrink: 0,
  },
} as const
