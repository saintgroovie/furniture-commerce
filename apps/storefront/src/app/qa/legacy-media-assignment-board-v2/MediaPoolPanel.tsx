"use client"

import React, { useMemo } from "react"
import type { InvItem, CandidateEntry, V2RoleFilter } from "./legacy-board-v2-types"
import { classifyVisualRole } from "@/app/qa/legacy-media-assignment-board/legacy-media-visual-role-ranking"
import type { VisualRole } from "@/app/qa/legacy-media-assignment-board/legacy-media-visual-role-ranking"
import { RoleFilterTabs } from "./RoleFilterTabs"
import { MediaCardV2, clientPreview } from "./MediaCardV2"

const POOL_LIMIT = 120

function visualRoleToFilter(role: VisualRole): V2RoleFilter {
  if (role === "closed_front" || role === "hero_front" || role === "front_anfas") return "front"
  if (role === "front_3_4") return "3_4"
  if (role === "interior") return "interior"
  if (role === "detail") return "detail"
  if (role === "lifestyle") return "lifestyle"
  if (role === "scheme") return "scheme"
  return "all"
}

type PoolItem = {
  inv: InvItem
  role: VisualRole
  confidence: string | undefined
  identityConfidence: string | undefined
  previewOk: boolean
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
}: Props) {

  // Build pool items — previewable sorted first in "all" view
  const poolItems = useMemo<PoolItem[]>(() => {
    if (!selectedHandle) return []
    const ids = candidatesByHandle.get(selectedHandle) ?? []
    const withPreview: PoolItem[] = []
    const noPreview: PoolItem[] = []
    for (const id of ids) {
      const inv = invById.get(id)
      if (!inv) continue
      const entry = entryByInventoryId.get(id)
      const role = classifyVisualRole(inv, { productHandle: selectedHandle })
      const preview = clientPreview(inv)
      const item: PoolItem = {
        inv,
        role,
        confidence: entry?.confidence,
        identityConfidence: entry?.identity_confidence,
        previewOk: preview.url !== null,
      }
      if (item.previewOk) withPreview.push(item)
      else noPreview.push(item)
    }
    // Previewable first, non-previewable after separator
    return [...withPreview, ...noPreview]
  }, [selectedHandle, invById, candidatesByHandle, entryByInventoryId])

  const previewableCount = useMemo(() => poolItems.filter((i) => i.previewOk).length, [poolItems])
  const noPreviewCount = useMemo(() => poolItems.filter((i) => !i.previewOk).length, [poolItems])

  // Count per filter (for tab badges)
  const filterCounts = useMemo<Partial<Record<V2RoleFilter, number>>>(() => {
    const counts: Partial<Record<V2RoleFilter, number>> = { all: poolItems.length }
    for (const item of poolItems) {
      const f = visualRoleToFilter(item.role)
      if (f !== "all") counts[f] = (counts[f] ?? 0) + 1
    }
    if (noPreviewCount > 0) counts["no_preview"] = noPreviewCount
    return counts
  }, [poolItems, noPreviewCount])

  // Apply active filter — in "all" mode items are already sorted previewable-first
  const filteredItems = useMemo<PoolItem[]>(() => {
    if (activeFilter === "all") return poolItems
    if (activeFilter === "no_preview") return poolItems.filter((i) => !i.previewOk)
    return poolItems.filter((i) => visualRoleToFilter(i.role) === activeFilter)
  }, [poolItems, activeFilter])

  // Index at which non-previewable starts (only relevant in "all" mode)
  const separatorIdx = activeFilter === "all" ? previewableCount : -1

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
      <div style={styles.panelHeader}>
        <span>Media pool</span>
        <span style={styles.handleChip}>{selectedHandle}</span>
      </div>

      <RoleFilterTabs
        activeFilter={activeFilter}
        counts={filterCounts}
        onFilter={onSetFilter}
      />

      <div style={styles.countBar}>{countBarText}</div>

      {/* Empty filter — helpful message + reset */}
      {displayed.length === 0 && totalAll > 0 && (
        <div style={styles.emptyFilter}>
          <div style={styles.emptyFilterTitle}>
            Для роли «{FILTER_LABEL_RU[activeFilter] ?? activeFilter}» кандидатов не найдено.
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
          const showSeparator = idx === separatorIdx && separatorIdx > 0 && noPreviewCount > 0
          return (
            <React.Fragment key={item.inv.id}>
              {showSeparator && (
                <div style={styles.separator}>
                  <span style={styles.separatorLabel}>Без превью · {noPreviewCount}</span>
                </div>
              )}
              <MediaCardV2
                inv={item.inv}
                role={item.role}
                confidence={item.confidence}
                identityConfidence={item.identityConfidence}
                selectedHandle={selectedHandle}
                onSetMain={onSetMain}
                onAddToGallery={onAddToGallery}
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
    </aside>
  )
}

const styles = {
  panel: {
    borderLeft: "1px solid #ddd",
    overflowY: "auto" as const,
    background: "#fff",
    display: "flex",
    flexDirection: "column" as const,
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
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "8px",
    padding: "10px",
    overflowY: "auto" as const,
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
