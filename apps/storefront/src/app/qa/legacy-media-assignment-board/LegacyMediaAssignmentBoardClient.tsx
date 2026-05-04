"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

const LS_KEY = "furniture-legacy-media-assignment-decisions-v1"
const DND_TYPE = "application/x-legacy-inventory-id"
const DND_ROLE = "application/x-legacy-slot-role"

const API_BASE = "/qa/legacy-media-assignment-board/api"
const PREVIEW_ROUTE = "/qa/legacy-media-assignment-board/preview"

type AssignmentRole = "primary_candidate" | "gallery_candidate" | "reference_only" | "do_not_use"

type InvItem = {
  id: string
  source_type: string
  source_path: string | null
  repo_relative_path: string | null
  filename: string
  collection_hint: string | null
  sku_hint: string | null
  handle_hint: string | null
  exists_locally: boolean
  previewable: boolean
  preview_reason: string | null
}

type CandidateEntry = {
  inventory_id: string
  confidence: string
  identity_confidence: string
  filename: string
  source_type: string
  previewable: boolean
  top_candidate: {
    medusa_product_handle: string
    medusa_variant_sku: string
    medusa_collection_handle: string
    score: number
    basis: string[]
  } | null
  candidates: Array<{
    medusa_product_handle: string
    medusa_variant_sku: string
    medusa_collection_handle: string
    score: number
    basis: string[]
  }>
}

type ProductRow = {
  handle: string
  sku: string
  collection: string
  title: string | null
  image_urls: string[]
}

type LaneSlot = {
  inventory_id: string
  role: AssignmentRole
  sort_order: number
}

type Rejection = { inventory_id: string; reason: string }

type Persisted = {
  version: 1
  assignments: Array<{
    inventory_id: string
    target_handle: string
    role: AssignmentRole
    sort_order: number
  }>
  rejections: Rejection[]
}

function medusaOrigin(): string {
  const u = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
  return u.replace(/\/$/, "")
}

function clientPreviewUrl(inv: InvItem): { url: string | null; useImg: boolean; caption: string } {
  if (!inv.previewable) {
    return { url: null, useImg: false, caption: inv.preview_reason || "Unpreviewable" }
  }
  const rr = (inv.repo_relative_path || "").replace(/\\/g, "/").replace(/^\//, "")
  const spo = (inv.source_path || "").replace(/\\/g, "/").replace(/^\//, "")
  const hub = rr.startsWith("data/") || rr.startsWith("apps/") ? rr : spo.startsWith("data/") || spo.startsWith("apps/") ? spo : ""

  if (hub.startsWith("data/")) {
    const q = new URLSearchParams({ rel: hub }).toString()
    return { url: `${PREVIEW_ROUTE}?${q}`, useImg: true, caption: "" }
  }
  if (hub.startsWith("apps/backend/static/")) {
    const suffix = hub.replace(/^apps\/backend\/static\//, "")
    return { url: `${medusaOrigin()}/static/${suffix}`, useImg: true, caption: "" }
  }
  const primary = rr || spo
  if (primary.startsWith("http://") || primary.startsWith("https://")) {
    return { url: primary, useImg: true, caption: "" }
  }
  if (primary.startsWith("/static/")) {
    return { url: `${medusaOrigin()}${primary}`, useImg: true, caption: "" }
  }
  return { url: null, useImg: false, caption: inv.preview_reason || "No preview rule" }
}

function normalizePersisted(raw: unknown): Persisted | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  if (o.version !== 1) return null
  const assignments = Array.isArray(o.assignments) ? o.assignments : []
  const rejections = Array.isArray(o.rejections) ? o.rejections : []
  return {
    version: 1,
    assignments: assignments
      .filter((a) => a && typeof a === "object")
      .map((a) => {
        const x = a as Record<string, unknown>
        return {
          inventory_id: String(x.inventory_id ?? ""),
          target_handle: String(x.target_handle ?? "").toLowerCase(),
          role: (String(x.role ?? "gallery_candidate") as AssignmentRole) || "gallery_candidate",
          sort_order: typeof x.sort_order === "number" ? x.sort_order : 0,
        }
      })
      .filter((a) => a.inventory_id && a.target_handle),
    rejections: rejections
      .filter((r) => r && typeof r === "object")
      .map((r) => {
        const x = r as Record<string, unknown>
        return { inventory_id: String(x.inventory_id ?? ""), reason: String(x.reason ?? "") }
      })
      .filter((r) => r.inventory_id),
  }
}

function buildExport(
  meta: Record<string, unknown>,
  assignments: Persisted["assignments"],
  rejections: Rejection[],
  laneOrders: Record<string, string[]>
): Record<string, unknown> {
  return {
    review_meta: meta,
    assignments,
    rejections,
    lane_orders: laneOrders,
  }
}

export function LegacyMediaAssignmentBoardClient() {
  const [loadError, setLoadError] = useState<string | null>(null)
  const [invDoc, setInvDoc] = useState<{ items: InvItem[]; summary: Record<string, unknown> } | null>(null)
  const [candDoc, setCandDoc] = useState<{ entries: CandidateEntry[]; summary: Record<string, unknown> } | null>(null)
  const [products, setProducts] = useState<ProductRow[]>([])
  const [loading, setLoading] = useState(true)

  const [filterCollection, setFilterCollection] = useState("")
  const [filterConfidence, setFilterConfidence] = useState("")
  const [filterPreviewable, setFilterPreviewable] = useState<"" | "yes" | "no">("")
  const [filterSourceType, setFilterSourceType] = useState("")
  const [filterAssigned, setFilterAssigned] = useState<"" | "assigned" | "unassigned">("")
  const [search, setSearch] = useState("")

  const [lanes, setLanes] = useState<Record<string, LaneSlot[]>>({})
  const [rejections, setRejections] = useState<Rejection[]>([])
  const [hydrated, setHydrated] = useState(false)
  const skipNextPersist = useRef(false)

  const invById = useMemo(() => {
    const m = new Map<string, InvItem>()
    for (const it of invDoc?.items ?? []) m.set(it.id, it)
    return m
  }, [invDoc])

  const candById = useMemo(() => {
    const m = new Map<string, CandidateEntry>()
    for (const e of candDoc?.entries ?? []) m.set(e.inventory_id, e)
    return m
  }, [candDoc])

  const assignedIds = useMemo(() => {
    const s = new Set<string>()
    for (const slots of Object.values(lanes)) {
      for (const sl of slots) s.add(sl.inventory_id)
    }
    return s
  }, [lanes])

  const rejectedIds = useMemo(() => new Set(rejections.map((r) => r.inventory_id)), [rejections])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError(null)
      try {
        const [r1, r2, r3] = await Promise.all([
          fetch(`${API_BASE}/inventory`),
          fetch(`${API_BASE}/candidates`),
          fetch(`${API_BASE}/products`),
        ])
        if (!r1.ok) throw new Error(`inventory ${r1.status}`)
        if (!r2.ok) throw new Error(`candidates ${r2.status}`)
        if (!r3.ok) throw new Error(`products ${r3.status}`)
        const j1 = (await r1.json()) as { items: InvItem[]; summary: Record<string, unknown> }
        const j2 = (await r2.json()) as { entries: CandidateEntry[]; summary: Record<string, unknown> }
        const j3 = (await r3.json()) as { products: ProductRow[] }
        if (cancelled) return
        setInvDoc(j1)
        setCandDoc(j2)
        setProducts(j3.products.filter((p) => p.handle))
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!invDoc || typeof window === "undefined") return
    skipNextPersist.current = true
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) {
        const p = normalizePersisted(JSON.parse(raw))
        if (p) {
          const nextLanes: Record<string, LaneSlot[]> = {}
          for (const a of p.assignments) {
            if (!nextLanes[a.target_handle]) nextLanes[a.target_handle] = []
            nextLanes[a.target_handle].push({
              inventory_id: a.inventory_id,
              role: a.role,
              sort_order: a.sort_order,
            })
          }
          for (const h of Object.keys(nextLanes)) {
            nextLanes[h].sort((x, y) => x.sort_order - y.sort_order)
          }
          setLanes(nextLanes)
          setRejections(p.rejections)
        }
      }
    } catch {
      /* ignore */
    } finally {
      setHydrated(true)
    }
  }, [invDoc])

  const persist = useCallback(
    (nextLanes: Record<string, LaneSlot[]>, nextRejections: Rejection[]) => {
      const assignments: Persisted["assignments"] = []
      const lane_orders: Record<string, string[]> = {}
      for (const [handle, slots] of Object.entries(nextLanes)) {
        lane_orders[handle] = slots.map((s) => s.inventory_id)
        slots.forEach((s, idx) => {
          assignments.push({
            inventory_id: s.inventory_id,
            target_handle: handle,
            role: s.role,
            sort_order: idx,
          })
        })
      }
      const payload: Persisted = { version: 1, assignments, rejections: nextRejections }
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(payload))
      } catch {
        /* ignore */
      }
    },
    []
  )

  const filteredInventoryIds = useMemo(() => {
    const items = invDoc?.items ?? []
    const q = search.trim().toLowerCase()
    return items
      .filter((it) => {
        const ce = candById.get(it.id)
        if (filterCollection) {
          const coll = String(ce?.top_candidate?.medusa_collection_handle || it.collection_hint || "").toLowerCase()
          if (coll !== filterCollection.toLowerCase()) return false
        }
        if (filterConfidence && (ce?.confidence || "") !== filterConfidence) return false
        if (filterPreviewable === "yes" && !it.previewable) return false
        if (filterPreviewable === "no" && it.previewable) return false
        if (filterSourceType && it.source_type !== filterSourceType) return false
        const isAssigned = assignedIds.has(it.id)
        if (filterAssigned === "assigned" && !isAssigned) return false
        if (filterAssigned === "unassigned" && (isAssigned || rejectedIds.has(it.id))) return false
        if (q) {
          const hay = `${it.id} ${it.filename} ${it.sku_hint ?? ""} ${it.handle_hint ?? ""} ${it.source_path ?? ""}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .map((it) => it.id)
  }, [
    invDoc,
    candById,
    search,
    filterCollection,
    filterConfidence,
    filterPreviewable,
    filterSourceType,
    filterAssigned,
    assignedIds,
    rejectedIds,
  ])

  const unassignedIds = useMemo(() => {
    const all = invDoc?.items.map((i) => i.id) ?? []
    return all.filter((id) => !assignedIds.has(id) && !rejectedIds.has(id) && filteredInventoryIds.includes(id))
  }, [invDoc, assignedIds, rejectedIds, filteredInventoryIds])

  const ambiguousIds = useMemo(() => {
    return (candDoc?.entries ?? []).filter((e) => e.identity_confidence === "ambiguous").map((e) => e.inventory_id)
  }, [candDoc])

  const unpreviewableItems = useMemo(() => {
    return (invDoc?.items ?? []).filter((it) => !it.previewable && (it.source_path || it.repo_relative_path))
  }, [invDoc])

  const collections = useMemo(() => {
    const s = new Set<string>()
    for (const p of products) {
      if (p.collection) s.add(p.collection)
    }
    return Array.from(s).sort()
  }, [products])

  const sourceTypes = useMemo(() => {
    const s = new Set<string>()
    for (const it of invDoc?.items ?? []) s.add(it.source_type)
    return Array.from(s).sort()
  }, [invDoc])

  const summary = useMemo(() => {
    const inv = invDoc?.summary as Record<string, number | Record<string, number>> | undefined
    const cd = candDoc?.summary as { by_confidence?: Record<string, number> } | undefined
    return { inv, cd }
  }, [invDoc, candDoc])

  const onDragStart = (e: React.DragEvent, inventoryId: string, role?: AssignmentRole) => {
    e.dataTransfer.setData(DND_TYPE, inventoryId)
    if (role) e.dataTransfer.setData(DND_ROLE, role)
    e.dataTransfer.effectAllowed = "move"
  }

  const removeFromLanes = (prev: Record<string, LaneSlot[]>, inventoryId: string): Record<string, LaneSlot[]> => {
    const next: Record<string, LaneSlot[]> = {}
    for (const [h, slots] of Object.entries(prev)) {
      const filt = slots.filter((s) => s.inventory_id !== inventoryId)
      if (filt.length) next[h] = filt
    }
    return next
  }

  const addToLane = (handle: string, inventoryId: string, role: AssignmentRole = "gallery_candidate") => {
    setRejections((prev) => prev.filter((r) => r.inventory_id !== inventoryId))
    setLanes((prev) => {
      const cleaned = removeFromLanes(prev, inventoryId)
      const slotList = cleaned[handle] ? [...cleaned[handle]] : []
      slotList.push({ inventory_id: inventoryId, role, sort_order: slotList.length })
      return { ...cleaned, [handle]: slotList }
    })
  }

  const dropOnLane = (e: React.DragEvent, handle: string) => {
    e.preventDefault()
    const id = e.dataTransfer.getData(DND_TYPE)
    if (!id) return
    const role = (e.dataTransfer.getData(DND_ROLE) as AssignmentRole) || "gallery_candidate"
    addToLane(handle, id, role)
  }

  const dropUnassigned = (e: React.DragEvent) => {
    e.preventDefault()
    const id = e.dataTransfer.getData(DND_TYPE)
    if (!id) return
    setLanes((prev) => removeFromLanes(prev, id))
  }

  const markReject = (inventoryId: string) => {
    setLanes((prev) => removeFromLanes(prev, inventoryId))
    setRejections((prev) => {
      const rest = prev.filter((r) => r.inventory_id !== inventoryId)
      return [...rest, { inventory_id: inventoryId, reason: "not_this_product" }]
    })
  }

  const clearLocal = () => {
    setLanes({})
    setRejections([])
    try {
      localStorage.removeItem(LS_KEY)
    } catch {
      /* ignore */
    }
  }

  const setSlotRole = (handle: string, inventoryId: string, role: AssignmentRole) => {
    setLanes((prev) => {
      const next = { ...prev }
      const list = (next[handle] || []).map((s) => (s.inventory_id === inventoryId ? { ...s, role } : s))
      next[handle] = list
      return next
    })
  }

  useEffect(() => {
    if (!invDoc || !hydrated) return
    if (skipNextPersist.current) {
      skipNextPersist.current = false
      return
    }
    persist(lanes, rejections)
  }, [invDoc, hydrated, lanes, rejections, persist])

  const exportJson = useCallback(() => {
    const meta = {
      scope: "legacy_media_assignment_board",
      status: "exported_from_storefront_qa",
      exported_at: new Date().toISOString(),
      local_dev_only: true,
      production_rollout: false,
      compatible_filename: "data/normalized/legacy-media-assignment-decisions.json",
    }
    const assignments: Persisted["assignments"] = []
    const lane_orders: Record<string, string[]> = {}
    for (const [handle, slots] of Object.entries(lanes)) {
      lane_orders[handle] = slots.map((s) => s.inventory_id)
      slots.forEach((s, idx) => {
        assignments.push({
          inventory_id: s.inventory_id,
          target_handle: handle,
          role: s.role,
          sort_order: idx,
        })
      })
    }
    return buildExport(meta, assignments, rejections, lane_orders)
  }, [lanes, rejections])

  const copyJson = async () => {
    const text = JSON.stringify(exportJson(), null, 2)
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      window.prompt("Copy JSON", text)
    }
  }

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(exportJson(), null, 2)], { type: "application/json" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = "legacy-media-assignment-decisions.json"
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (loading) {
    return <div style={{ padding: 24, fontFamily: "system-ui" }}>Loading legacy media artifacts…</div>
  }
  if (loadError) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 720 }}>
        <h1>Legacy media board</h1>
        <p>Failed to load QA data: {loadError}</p>
        <p style={{ fontSize: 14, color: "#555" }}>
          Run from repo root: <code>node scripts/build-legacy-media-inventory.mjs</code> and{" "}
          <code>node scripts/build-legacy-media-product-candidate-map.mjs</code>, then ensure the storefront resolves the monorepo root (see{" "}
          <code>docs/project/CODEMAP.md</code> / furniture-repo markers).
        </p>
      </div>
    )
  }

  const chip = (inventoryId: string, opts?: { showReject?: boolean; narrow?: boolean }) => {
    const inv = invById.get(inventoryId)
    const ce = candById.get(inventoryId)
    if (!inv) return null
    const pv = clientPreviewUrl(inv)
    return (
      <div
        key={inventoryId}
        draggable
        onDragStart={(e) => onDragStart(e, inventoryId, undefined)}
        style={{
          width: opts?.narrow ? 100 : 120,
          border: "1px solid #ccc",
          borderRadius: 8,
          padding: 6,
          margin: 4,
          background: "#fafafa",
          cursor: "grab",
          fontSize: 11,
          display: "inline-block",
          verticalAlign: "top",
        }}
      >
        {pv.useImg && pv.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pv.url} alt="" width={100} height={100} style={{ objectFit: "cover", borderRadius: 4, display: "block" }} />
        ) : (
          <div
            style={{
              width: 100,
              height: 100,
              borderRadius: 4,
              background: "#eee",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              padding: 4,
              color: "#444",
              fontSize: 10,
            }}
          >
            {pv.caption || "No preview"}
          </div>
        )}
        <div style={{ marginTop: 4, wordBreak: "break-all" }}>{inv.filename}</div>
        {ce ? <div style={{ color: "#666" }}>{ce.confidence}</div> : null}
        {opts?.showReject ? (
          <button type="button" style={{ marginTop: 4, fontSize: 10 }} onClick={() => markReject(inventoryId)}>
            Reject
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif", maxWidth: "100%" }}>
      <h1 style={{ fontSize: 22 }}>Legacy media assignment board</h1>
      <p style={{ maxWidth: 900, fontSize: 14, color: "#333" }}>
        QA-only triage: drag legacy images onto product lanes, set roles, export JSON. Decisions stay in <strong>localStorage</strong> until you
        copy/download. <strong>No Medusa apply</strong> from this page.
      </p>

      <section style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <button type="button" onClick={clearLocal}>
          Clear local decisions
        </button>
        <button type="button" onClick={() => void copyJson()}>
          Copy JSON
        </button>
        <button type="button" onClick={downloadJson}>
          Download JSON
        </button>
      </section>

      <section style={{ marginBottom: 16, padding: 12, background: "#f4f4f4", borderRadius: 8 }}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Summary</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 13 }}>
          <div>
            <strong>Inventory</strong>
            <pre style={{ margin: 4, fontSize: 12 }}>{JSON.stringify(summary.inv, null, 0)}</pre>
          </div>
          <div>
            <strong>Confidence (map)</strong>
            <pre style={{ margin: 4, fontSize: 12 }}>{JSON.stringify(summary.cd?.by_confidence, null, 0)}</pre>
          </div>
          <div>
            <strong>Board</strong>
            <ul style={{ margin: 4, paddingLeft: 18 }}>
              <li>Assigned slots: {Object.values(lanes).reduce((n, a) => n + a.length, 0)}</li>
              <li>Rejections: {rejections.length}</li>
              <li>Unassigned (filtered): {unassignedIds.length}</li>
            </ul>
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 16, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
        <label>
          Collection
          <select value={filterCollection} onChange={(e) => setFilterCollection(e.target.value)} style={{ display: "block", width: "100%" }}>
            <option value="">(all)</option>
            {collections.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          Confidence
          <select value={filterConfidence} onChange={(e) => setFilterConfidence(e.target.value)} style={{ display: "block", width: "100%" }}>
            <option value="">(all)</option>
            {["confirmed", "probable", "ambiguous", "unmatched", "unpreviewable"].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          Previewable
          <select value={filterPreviewable} onChange={(e) => setFilterPreviewable(e.target.value as "" | "yes" | "no")} style={{ display: "block", width: "100%" }}>
            <option value="">(all)</option>
            <option value="yes">yes</option>
            <option value="no">no</option>
          </select>
        </label>
        <label>
          Source type
          <select value={filterSourceType} onChange={(e) => setFilterSourceType(e.target.value)} style={{ display: "block", width: "100%" }}>
            <option value="">(all)</option>
            {sourceTypes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          Assigned
          <select value={filterAssigned} onChange={(e) => setFilterAssigned(e.target.value as "" | "assigned" | "unassigned")} style={{ display: "block", width: "100%" }}>
            <option value="">(all)</option>
            <option value="assigned">assigned</option>
            <option value="unassigned">unassigned</option>
          </select>
        </label>
        <label style={{ gridColumn: "span 2" }}>
          Search SKU / handle / filename
          <input value={search} onChange={(e) => setSearch(e.target.value)} style={{ display: "block", width: "100%" }} placeholder="e.g. co-02-1" />
        </label>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16, alignItems: "start" }}>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={dropUnassigned}
          style={{ border: "2px dashed #aaa", borderRadius: 8, padding: 8, minHeight: 320, maxHeight: "70vh", overflow: "auto" }}
        >
          <h3 style={{ fontSize: 14, marginTop: 0 }}>Unassigned pool</h3>
          <p style={{ fontSize: 11, color: "#666" }}>Drop here to unassign. Drag onto a product lane.</p>
          <div>{unassignedIds.slice(0, 200).map((id) => chip(id, { showReject: true }))}</div>
          {unassignedIds.length > 200 ? <div style={{ fontSize: 12 }}>… {unassignedIds.length - 200} more (narrow filters)</div> : null}
        </div>

        <div style={{ maxHeight: "75vh", overflow: "auto" }}>
          <h3 style={{ fontSize: 14 }}>Product lanes</h3>
          {products.map((p) => {
            const slots = lanes[p.handle] || []
            const suggested = (candDoc?.entries ?? [])
              .filter(
                (e) =>
                  e.top_candidate?.medusa_product_handle === p.handle &&
                  !assignedIds.has(e.inventory_id) &&
                  !rejectedIds.has(e.inventory_id)
              )
              .slice(0, 12)
            return (
              <div
                key={p.handle}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => dropOnLane(e, p.handle)}
                style={{ border: "1px solid #ddd", borderRadius: 8, padding: 8, marginBottom: 10, background: "#fff" }}
              >
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
                  <div style={{ flex: "1 1 200px" }}>
                    <strong>{p.handle}</strong> · {p.sku}
                    <div style={{ fontSize: 12, color: "#555" }}>{p.collection}</div>
                    <div style={{ fontSize: 12 }}>{p.title}</div>
                    <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                      {p.image_urls.slice(0, 4).map((u) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={u} src={u} alt="" width={48} height={48} style={{ objectFit: "cover", borderRadius: 4 }} />
                      ))}
                    </div>
                  </div>
                  <div style={{ flex: "2 1 320px" }}>
                    <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Candidates (auto, not assigned)</div>
                    <div style={{ minHeight: 40 }}>
                      {suggested.map((e) => {
                        const inv = invById.get(e.inventory_id)
                        if (!inv) return null
                        const pv = clientPreviewUrl(inv)
                        return (
                          <span key={e.inventory_id} draggable onDragStart={(ev) => onDragStart(ev, e.inventory_id)} style={{ display: "inline-block" }}>
                            {pv.useImg && pv.url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={pv.url} alt="" width={56} height={56} style={{ objectFit: "cover", borderRadius: 4, margin: 2 }} />
                            ) : (
                              <span
                                style={{
                                  display: "inline-block",
                                  width: 56,
                                  height: 56,
                                  margin: 2,
                                  background: "#eee",
                                  fontSize: 9,
                                  verticalAlign: "top",
                                  overflow: "hidden",
                                }}
                              >
                                {pv.caption}
                              </span>
                            )}
                          </span>
                        )
                      })}
                    </div>
                    <div style={{ fontSize: 12, color: "#666", margin: "8px 0 4px" }}>Manually assigned</div>
                    <div style={{ minHeight: 80, background: "#fafafa", borderRadius: 6, padding: 4 }}>
                      {slots.length === 0 ? <span style={{ fontSize: 12, color: "#999" }}>Drop images here</span> : null}
                      {slots.map((s) => {
                        const inv = invById.get(s.inventory_id)
                        if (!inv) return null
                        const pv = clientPreviewUrl(inv)
                        return (
                          <div
                            key={s.inventory_id}
                            draggable
                            onDragStart={(ev) => onDragStart(ev, s.inventory_id, s.role)}
                            style={{ display: "inline-flex", flexDirection: "column", alignItems: "stretch", margin: 4, verticalAlign: "top" }}
                          >
                            {pv.useImg && pv.url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={pv.url} alt="" width={72} height={72} style={{ objectFit: "cover", borderRadius: 4 }} />
                            ) : (
                              <div style={{ width: 72, height: 72, background: "#eee", fontSize: 9, padding: 2 }}>{pv.caption}</div>
                            )}
                            <select
                              value={s.role}
                              onChange={(ev) => setSlotRole(p.handle, s.inventory_id, ev.target.value as AssignmentRole)}
                              style={{ fontSize: 10, marginTop: 4 }}
                            >
                              <option value="primary_candidate">primary_candidate</option>
                              <option value="gallery_candidate">gallery_candidate</option>
                              <option value="reference_only">reference_only</option>
                              <option value="do_not_use">do_not_use</option>
                            </select>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <section style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 14 }}>Ambiguous (identity)</h3>
        <div style={{ display: "flex", flexWrap: "wrap", maxHeight: 240, overflow: "auto", border: "1px solid #eee", padding: 8 }}>
          {ambiguousIds.slice(0, 80).map((id) => (
            <span key={id}>{chip(id, { narrow: true })}</span>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 14 }}>Unpreviewable references (no broken img)</h3>
        <div style={{ fontSize: 12, color: "#555", maxHeight: 220, overflow: "auto", border: "1px solid #eee", padding: 8 }}>
          {unpreviewableItems.slice(0, 150).map((it) => (
            <div key={it.id} style={{ marginBottom: 6, fontFamily: "monospace", fontSize: 11 }}>
              <strong>{it.filename}</strong> — {it.preview_reason || "unpreviewable"} — {it.source_path || it.repo_relative_path || ""}
            </div>
          ))}
          {unpreviewableItems.length > 150 ? <div>… {unpreviewableItems.length - 150} more</div> : null}
        </div>
      </section>
    </div>
  )
}
