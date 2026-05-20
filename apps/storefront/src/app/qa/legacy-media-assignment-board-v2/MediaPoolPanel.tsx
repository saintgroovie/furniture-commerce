"use client"

import { useMemo, useState } from "react"
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
}

export function MediaPoolPanel({ selectedHandle, invById, candidatesByHandle, entryByInventoryId }: Props) {
  const [activeFilter, setActiveFilter] = useState<V2RoleFilter>("all")

  // Build pool items for selected handle with roles and preview status
  const poolItems = useMemo<PoolItem[]>(() => {
    if (!selectedHandle) return []
    const ids = candidatesByHandle.get(selectedHandle) ?? []
    const items: PoolItem[] = []
    for (const id of ids) {
      const inv = invById.get(id)
      if (!inv) continue
      const entry = entryByInventoryId.get(id)
      const role = classifyVisualRole(inv, { productHandle: selectedHandle })
      const preview = clientPreview(inv)
      items.push({
        inv,
        role,
        confidence: entry?.confidence,
        identityConfidence: entry?.identity_confidence,
        previewOk: preview.url !== null,
      })
    }
    return items
  }, [selectedHandle, invById, candidatesByHandle, entryByInventoryId])

  // Count per filter (for tab badges)
  const filterCounts = useMemo<Partial<Record<V2RoleFilter, number>>>(() => {
    const counts: Partial<Record<V2RoleFilter, number>> = { all: poolItems.length }
    let noPreviewCount = 0
    for (const item of poolItems) {
      const f = visualRoleToFilter(item.role)
      if (f !== "all") counts[f] = (counts[f] ?? 0) + 1
      if (!item.previewOk) noPreviewCount++
    }
    if (noPreviewCount > 0) counts["no_preview"] = noPreviewCount
    return counts
  }, [poolItems])

  // Apply active filter
  const filteredItems = useMemo<PoolItem[]>(() => {
    if (activeFilter === "all") return poolItems
    if (activeFilter === "no_preview") return poolItems.filter((i) => !i.previewOk)
    return poolItems.filter((i) => visualRoleToFilter(i.role) === activeFilter)
  }, [poolItems, activeFilter])

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

  return (
    <aside style={styles.panel}>
      <div style={styles.panelHeader}>
        <span>Media pool</span>
        <span style={styles.handleChip}>{selectedHandle}</span>
      </div>

      <RoleFilterTabs
        activeFilter={activeFilter}
        counts={filterCounts}
        onFilter={(f) => setActiveFilter(f)}
      />

      <div style={styles.countBar}>
        {totalAll === 0
          ? "Нет кандидатов для этого продукта."
          : `Показано ${displayed.length} из ${total}${activeFilter !== "all" ? ` (всего ${totalAll})` : ""}`}
      </div>

      {displayed.length === 0 && totalAll > 0 && (
        <div style={styles.empty}>Нет карточек по фильтру «{activeFilter}».</div>
      )}

      <div style={styles.grid}>
        {displayed.map((item) => (
          <MediaCardV2
            key={item.inv.id}
            inv={item.inv}
            role={item.role}
            confidence={item.confidence}
            identityConfidence={item.identityConfidence}
            selectedHandle={selectedHandle}
          />
        ))}
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
    padding: "10px 14px",
    fontWeight: 600,
    fontSize: "12px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    color: "#555",
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
    color: "#888",
    borderBottom: "1px solid #f0f0f0",
    flexShrink: 0,
  },
  empty: {
    padding: "20px 14px",
    color: "#aaa",
    fontSize: "13px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
    gap: "8px",
    padding: "10px",
    overflowY: "auto" as const,
  },
  capNote: {
    padding: "8px 12px",
    fontSize: "11px",
    color: "#aaa",
    borderTop: "1px solid #f0f0f0",
    flexShrink: 0,
  },
} as const
