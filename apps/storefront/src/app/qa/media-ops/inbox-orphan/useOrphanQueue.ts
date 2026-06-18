"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { isOrphanDecision } from "../../source-media-orphan-review/source-orphan-review-persistence"
import { loadInboxOrphanRows, patchInboxOrphanRow } from "../media-ops-session"
import type {
  BootstrapPayload,
  OrphanDecision,
  PriorityTier,
  ReviewRow,
} from "./orphan-queue-types"

export const ORPHAN_API_BASE = "/qa/source-media-orphan-review/api"

export type TierFilter = PriorityTier | "all"

function mergePersisted(items: ReviewRow[]): ReviewRow[] {
  const persisted = loadInboxOrphanRows()
  if (!Object.keys(persisted).length) return items
  return items.map((item) => {
    const p = persisted[item.source_id]
    if (!p) return item
    return {
      ...item,
      operator_decision: isOrphanDecision(p.operator_decision)
        ? p.operator_decision
        : item.operator_decision,
      operator_notes: p.operator_notes ?? item.operator_notes,
    }
  })
}

export function useOrphanQueue() {
  const [payload, setPayload] = useState<BootstrapPayload | null>(null)
  const [items, setItems] = useState<ReviewRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [tier, setTier] = useState<TierFilter>("P0_review_first")
  const [crossSkuOnly, setCrossSkuOnly] = useState(false)
  const [search, setSearch] = useState("")
  const [displayLimit, setDisplayLimit] = useState(50)

  useEffect(() => {
    fetch(`${ORPHAN_API_BASE}/bootstrap`, { signal: AbortSignal.timeout(120000) })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `HTTP ${res.status}`)
        }
        return res.json() as Promise<BootstrapPayload>
      })
      .then((data) => {
        setPayload(data)
        setItems(mergePersisted(data.items))
      })
      .catch((e) => setError(String(e.message || e)))
  }, [])

  const filtered = useMemo(() => {
    let list = items
    if (tier !== "all") list = list.filter((r) => r.priority_tier === tier)
    if (crossSkuOnly) list = list.filter((r) => r.cross_sku_risk)
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (r) =>
          r.basename.toLowerCase().includes(q) ||
          (r.sku_guess || "").toLowerCase().includes(q) ||
          (r.handle_guess || "").toLowerCase().includes(q) ||
          (r.collection_guess || "").toLowerCase().includes(q)
      )
    }
    return list
  }, [items, tier, crossSkuOnly, search])

  const visible = useMemo(() => filtered.slice(0, displayLimit), [filtered, displayLimit])

  const decisionCounts = useMemo(() => {
    const c: Record<string, number> = { pending: 0 }
    for (const i of items) {
      c[i.operator_decision] = (c[i.operator_decision] || 0) + 1
    }
    return c
  }, [items])

  const setDecision = useCallback((sourceId: string, decision: OrphanDecision) => {
    setItems((prev) => {
      const next = prev.map((i) =>
        i.source_id === sourceId ? { ...i, operator_decision: decision } : i
      )
      patchInboxOrphanRow(sourceId, { operator_decision: decision })
      return next
    })
  }, [])

  const setNotes = useCallback((sourceId: string, notes: string) => {
    setItems((prev) => {
      const next = prev.map((i) => (i.source_id === sourceId ? { ...i, operator_notes: notes } : i))
      patchInboxOrphanRow(sourceId, { operator_notes: notes })
      return next
    })
  }, [])

  const exportItems = useMemo(
    () => items.filter((i) => i.operator_decision !== "pending"),
    [items]
  )

  return {
    payload,
    items,
    error,
    tier,
    setTier,
    crossSkuOnly,
    setCrossSkuOnly,
    search,
    setSearch,
    displayLimit,
    setDisplayLimit,
    filtered,
    visible,
    decisionCounts,
    setDecision,
    setNotes,
    exportItems,
    loading: !payload && !error,
  }
}
