"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  buildExportDocument,
  collectAllAssignedIds,
  emptyZones,
  migrateV1ToV2,
  parsePersisted,
  removeIdFromAllZones,
  type GlobalRejection,
  type PersistedV1,
  type PersistedV2,
  type ProductZoneState,
} from "./legacy-media-board-export"
import type { CandidateEntry, InvItem, ProductRow } from "./legacy-media-board-types"
import { MediaImageCard } from "./MediaImageCard"

const LS_KEY = "furniture-legacy-media-assignment-decisions-v1"
const DND_INV = "application/x-legacy-inv"
const DND_HANDLE = "application/x-legacy-handle"
const DND_ZONE = "application/x-legacy-zone"
const POOL_LIMIT = 120
const UNKNOWN_COLLECTION = "__unknown__"
const API_BASE = "/qa/legacy-media-assignment-board/api"
const PREVIEW_ROUTE = "/qa/legacy-media-assignment-board/preview"

type PoolTab = "unassigned" | "ambiguous" | "confirmed" | "unpreviewable" | "rejected"
type ZoneDrop = "primary" | "gallery" | "reference" | "lane_reject" | "unassigned"

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

function cloneZone(z: ProductZoneState | undefined): ProductZoneState {
  if (!z) return emptyZones()
  return {
    primary: z.primary,
    gallery: [...z.gallery],
    reference_only: [...z.reference_only],
    lane_rejected: [...z.lane_rejected],
  }
}

function moveInventoryToZone(
  zones: Record<string, ProductZoneState>,
  globalRejections: GlobalRejection[],
  handle: string,
  zone: Exclude<ZoneDrop, "unassigned">,
  inventoryId: string,
  galleryInsertBeforeId: string | null
): { zones: Record<string, ProductZoneState>; globalRejections: GlobalRejection[] } {
  let next = removeIdFromAllZones(zones, inventoryId)
  const grej = globalRejections.filter((r) => r.inventory_id !== inventoryId)
  const h = handle.toLowerCase()
  const z = cloneZone(next[h])
  if (zone === "primary") {
    const prev = z.primary
    z.primary = inventoryId
    if (prev && prev !== inventoryId) z.gallery = [prev, ...z.gallery.filter((x) => x !== inventoryId)]
  } else if (zone === "gallery") {
    const g = z.gallery.filter((x) => x !== inventoryId)
    if (galleryInsertBeforeId) {
      const ix = g.indexOf(galleryInsertBeforeId)
      if (ix >= 0) g.splice(ix, 0, inventoryId)
      else g.push(inventoryId)
    } else g.push(inventoryId)
    z.gallery = g
  } else if (zone === "reference") {
    z.reference_only = [...z.reference_only.filter((x) => x !== inventoryId), inventoryId]
  } else if (zone === "lane_reject") {
    z.lane_rejected = [...z.lane_rejected.filter((x) => x !== inventoryId), inventoryId]
  }
  const has = z.primary || z.gallery.length || z.reference_only.length || z.lane_rejected.length
  if (has) next = { ...next, [h]: z }
  else {
    const { [h]: _, ...rest } = next
    next = rest
  }
  return { zones: next, globalRejections: grej }
}

function swapGallery(zones: Record<string, ProductZoneState>, handle: string, a: string, b: string): Record<string, ProductZoneState> {
  const h = handle.toLowerCase()
  const z = cloneZone(zones[h])
  const i = z.gallery.indexOf(a)
  const j = z.gallery.indexOf(b)
  if (i < 0 || j < 0) return zones
  const copy = [...z.gallery]
  ;[copy[i], copy[j]] = [copy[j], copy[i]]
  z.gallery = copy
  return { ...zones, [h]: z }
}

function loadPersistedRaw(raw: string | null): PersistedV2 | null {
  if (!raw) return null
  try {
    const o = JSON.parse(raw) as unknown
    const parsed = parsePersisted(o)
    if (parsed) return parsed
    if (o && typeof o === "object" && (o as PersistedV1).version === 1) {
      return migrateV1ToV2(o as PersistedV1)
    }
  } catch {
    return null
  }
  return null
}

function serializeV2(v: PersistedV2): string {
  return JSON.stringify(v)
}

type BoardState = { zones: Record<string, ProductZoneState>; grej: GlobalRejection[] }

export function LegacyMediaAssignmentBoardClient() {
  const [loadError, setLoadError] = useState<string | null>(null)
  const [invDoc, setInvDoc] = useState<{ items: InvItem[]; summary: Record<string, unknown> } | null>(null)
  const [candDoc, setCandDoc] = useState<{ entries: CandidateEntry[]; summary: Record<string, unknown> } | null>(null)
  const [products, setProducts] = useState<ProductRow[]>([])
  const [loading, setLoading] = useState(true)

  const [sidebarCollection, setSidebarCollection] = useState<string>("")
  const [search, setSearch] = useState("")
  const [filterConfidence, setFilterConfidence] = useState("")
  const [filterSourceType, setFilterSourceType] = useState("")
  const [filterAssigned, setFilterAssigned] = useState<"" | "assigned" | "unassigned" | "rejected">("")
  const [onlyPreviewable, setOnlyPreviewable] = useState(false)
  const [productAdvanced, setProductAdvanced] = useState<"" | "no_current_media" | "has_candidates" | "has_manual">("")

  const [board, setBoard] = useState<BoardState>({ zones: {}, grej: [] })
  const [selectedHandle, setSelectedHandle] = useState<string | null>(null)
  const [poolTab, setPoolTab] = useState<PoolTab>("unassigned")
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

  const assignedInZones = useMemo(() => collectAllAssignedIds(board.zones), [board.zones])
  const globalRejectedIds = useMemo(() => new Set(board.grej.map((r) => r.inventory_id)), [board.grej])

  const isUnknownHintItem = useCallback((it: InvItem, ce: CandidateEntry | undefined) => {
    const hint = (it.collection_hint || "").trim().toLowerCase()
    const topc = (ce?.top_candidate?.medusa_collection_handle || "").trim().toLowerCase()
    return !hint && !topc
  }, [])

  const collectionMediaCount = useCallback(
    (coll: string) => {
      let n = 0
      for (const it of invDoc?.items ?? []) {
        const ce = candById.get(it.id)
        if (coll === "") {
          n++
          continue
        }
        const hint = (it.collection_hint || "").trim().toLowerCase()
        const topc = (ce?.top_candidate?.medusa_collection_handle || "").trim().toLowerCase()
        if (coll === UNKNOWN_COLLECTION) {
          if (isUnknownHintItem(it, ce)) n++
        } else if (hint === coll || topc === coll) n++
      }
      return n
    },
    [invDoc, candById, isUnknownHintItem]
  )

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
      const v2 = loadPersistedRaw(raw)
      if (v2) {
        setBoard({ zones: v2.zonesByHandle, grej: v2.globalRejections })
      }
    } catch {
      /* ignore */
    } finally {
      setHydrated(true)
    }
  }, [invDoc])

  const persist = useCallback((zones: Record<string, ProductZoneState>, grej: GlobalRejection[]) => {
    const payload: PersistedV2 = { version: 2, zonesByHandle: zones, globalRejections: grej }
    try {
      localStorage.setItem(LS_KEY, serializeV2(payload))
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (!invDoc || !hydrated) return
    if (skipNextPersist.current) {
      skipNextPersist.current = false
      return
    }
    persist(board.zones, board.grej)
  }, [invDoc, hydrated, board.zones, board.grej, persist])

  const invSummary = invDoc?.summary as {
    total_items?: number
    previewable?: number
    unpreviewable?: number
  } | undefined

  const productByHandle = useMemo(() => {
    const m = new Map<string, ProductRow>()
    for (const p of products) m.set(p.handle.toLowerCase(), p)
    return m
  }, [products])

  const collectionKeys = useMemo(() => {
    const s = new Set<string>()
    for (const p of products) {
      if (p.collection) s.add(p.collection.toLowerCase())
    }
    return Array.from(s).sort()
  }, [products])

  const sourceTypes = useMemo(() => {
    const s = new Set<string>()
    for (const it of invDoc?.items ?? []) s.add(it.source_type)
    return Array.from(s).sort()
  }, [invDoc])

  const matchesSearch = useCallback(
    (it: InvItem, q: string) => {
      if (!q) return true
      const pr = productByHandle.get((it.handle_hint || "").toLowerCase())
      const title = (pr?.title || "").toLowerCase()
      const hay = `${it.id} ${it.filename} ${it.sku_hint ?? ""} ${it.handle_hint ?? ""} ${it.source_path ?? ""} ${title}`.toLowerCase()
      return hay.includes(q)
    },
    [productByHandle]
  )

  const matchesCollectionFilter = useCallback(
    (it: InvItem, ce: CandidateEntry | undefined) => {
      if (!sidebarCollection) return true
      if (sidebarCollection === UNKNOWN_COLLECTION) return isUnknownHintItem(it, ce)
      const hint = (it.collection_hint || "").trim().toLowerCase()
      const topc = (ce?.top_candidate?.medusa_collection_handle || "").trim().toLowerCase()
      return hint === sidebarCollection || topc === sidebarCollection
    },
    [sidebarCollection, isUnknownHintItem]
  )

  const matchesFilters = useCallback(
    (it: InvItem, ce: CandidateEntry | undefined) => {
      const q = search.trim().toLowerCase()
      if (!matchesSearch(it, q)) return false
      if (!matchesCollectionFilter(it, ce)) return false
      if (filterConfidence && (ce?.confidence || "") !== filterConfidence) return false
      if (filterSourceType && it.source_type !== filterSourceType) return false
      if (onlyPreviewable && !it.previewable) return false
      const inZone = assignedInZones.has(it.id)
      const grej = globalRejectedIds.has(it.id)
      if (filterAssigned === "assigned" && (!inZone || grej)) return false
      if (filterAssigned === "unassigned" && (inZone || grej)) return false
      if (filterAssigned === "rejected" && !grej) return false
      return true
    },
    [
      search,
      matchesSearch,
      matchesCollectionFilter,
      filterConfidence,
      filterSourceType,
      onlyPreviewable,
      filterAssigned,
      assignedInZones,
      globalRejectedIds,
    ]
  )

  const unassignedPoolIds = useMemo(() => {
    const out: string[] = []
    for (const it of invDoc?.items ?? []) {
      const ce = candById.get(it.id)
      if (assignedInZones.has(it.id) || globalRejectedIds.has(it.id)) continue
      if (!matchesFilters(it, ce)) continue
      out.push(it.id)
    }
    return out
  }, [invDoc, candById, assignedInZones, globalRejectedIds, matchesFilters])

  const ambiguousPoolIds = useMemo(() => {
    return unassignedPoolIds.filter((id) => candById.get(id)?.identity_confidence === "ambiguous")
  }, [unassignedPoolIds, candById])

  const confirmedPoolIds = useMemo(() => {
    return unassignedPoolIds.filter((id) => (candById.get(id)?.confidence || "") === "confirmed")
  }, [unassignedPoolIds, candById])

  const rejectedPoolItems = useMemo(() => board.grej, [board.grej])

  const unpreviewableRows = useMemo(() => {
    return (invDoc?.items ?? []).filter((it) => {
      if (it.previewable) return false
      if (!(it.source_path || it.repo_relative_path)) return false
      const ce = candById.get(it.id)
      return matchesFilters(it, ce)
    })
  }, [invDoc, candById, matchesFilters])

  const productsFiltered = useMemo(() => {
    let list = [...products]
    if (sidebarCollection && sidebarCollection !== UNKNOWN_COLLECTION) {
      list = list.filter((p) => (p.collection || "").toLowerCase() === sidebarCollection)
    }
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (p) =>
          p.handle.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.title || "").toLowerCase().includes(q) ||
          (p.collection || "").toLowerCase().includes(q)
      )
    }
    if (productAdvanced === "no_current_media") list = list.filter((p) => (p.image_urls?.length ?? 0) === 0)
    if (productAdvanced === "has_candidates") {
      const handles = new Set(
        (candDoc?.entries ?? []).filter((e) => e.top_candidate).map((e) => e.top_candidate!.medusa_product_handle.toLowerCase())
      )
      list = list.filter((p) => handles.has(p.handle.toLowerCase()))
    }
    if (productAdvanced === "has_manual") {
      list = list.filter((p) => {
        const z = board.zones[p.handle.toLowerCase()]
        if (!z) return false
        return Boolean(z.primary || z.gallery.length || z.reference_only.length || z.lane_rejected.length)
      })
    }
    return list
  }, [products, sidebarCollection, search, productAdvanced, candDoc, board.zones])

  const laneStatus = useCallback(
    (p: ProductRow) => {
      const z = board.zones[p.handle.toLowerCase()] ?? emptyZones()
      const manual = Boolean(z.primary || z.gallery.length || z.reference_only.length || z.lane_rejected.length)
      const candN = (candDoc?.entries ?? []).filter(
        (e) => e.top_candidate?.medusa_product_handle.toLowerCase() === p.handle.toLowerCase()
      ).length
      const hasCur = (p.image_urls?.length ?? 0) > 0
      const amb = (candDoc?.entries ?? []).some(
        (e) => e.inventory_id && e.identity_confidence === "ambiguous" && e.top_candidate?.medusa_product_handle.toLowerCase() === p.handle.toLowerCase()
      )
      if (!hasCur && candN > 0) return { label: "Has candidates", tone: "#1d4ed8" as const }
      if (!hasCur) return { label: "No current media", tone: "#b45309" as const }
      if (manual && amb) return { label: "Needs review", tone: "#a16207" as const }
      if (manual) return { label: "Manually assigned", tone: "#047857" as const }
      if (candN > 0) return { label: "Has candidates", tone: "#1d4ed8" as const }
      if (hasCur) return { label: "Has current media", tone: "#475569" as const }
      return { label: "—", tone: "#64748b" as const }
    },
    [board.zones, candDoc]
  )

  const toolbarCounts = useMemo(() => {
    const total = invSummary?.total_items ?? 0
    const previewable = invSummary?.previewable ?? 0
    const assigned = assignedInZones.size
    const unassigned = (invDoc?.items ?? []).filter((it) => !assignedInZones.has(it.id) && !globalRejectedIds.has(it.id)).length
    const ambiguous = (candDoc?.entries ?? []).filter((e) => e.identity_confidence === "ambiguous").length
    const rejected = board.grej.length
    const productsWithAssigned = Object.keys(board.zones).filter((h) => {
      const z = board.zones[h]
      return z && (z.primary || z.gallery.length || z.reference_only.length || z.lane_rejected.length)
    }).length
    return { total, previewable, assigned, unassigned, ambiguous, rejected, productsWithAssigned }
  }, [invSummary, invDoc, candDoc, assignedInZones, board.grej, board.zones, globalRejectedIds])

  const setDragPayload = (e: React.DragEvent, inventoryId: string, handle?: string, zone?: string) => {
    e.dataTransfer.setData(DND_INV, inventoryId)
    if (handle) e.dataTransfer.setData(DND_HANDLE, handle)
    if (zone) e.dataTransfer.setData(DND_ZONE, zone)
    e.dataTransfer.effectAllowed = "move"
  }

  const readDragPayload = (e: React.DragEvent) => {
    const inventoryId = e.dataTransfer.getData(DND_INV)
    const handle = e.dataTransfer.getData(DND_HANDLE) || ""
    const zone = e.dataTransfer.getData(DND_ZONE) || ""
    return { inventoryId, handle, zone }
  }

  const clearLocal = () => {
    setBoard({ zones: {}, grej: [] })
    setSelectedHandle(null)
    try {
      localStorage.removeItem(LS_KEY)
    } catch {
      /* ignore */
    }
  }

  const resetFilters = () => {
    setSearch("")
    setFilterConfidence("")
    setFilterSourceType("")
    setFilterAssigned("")
    setOnlyPreviewable(false)
    setProductAdvanced("")
    setSidebarCollection("")
  }

  const markGlobalReject = (inventoryId: string) => {
    setBoard((b) => ({
      zones: removeIdFromAllZones(b.zones, inventoryId),
      grej: [...b.grej.filter((r) => r.inventory_id !== inventoryId), { inventory_id: inventoryId, reason: "not_this_product" }],
    }))
  }

  const assignToSelected = (inventoryId: string, zone: "primary" | "gallery" | "reference" | "lane_reject") => {
    if (!selectedHandle) return
    setBoard((b) => {
      const out = moveInventoryToZone(b.zones, b.grej, selectedHandle, zone, inventoryId, null)
      return { zones: out.zones, grej: out.globalRejections }
    })
  }

  const dropZoneStable = (e: React.DragEvent, handle: string, zone: ZoneDrop) => {
    e.preventDefault()
    const { inventoryId, handle: srcH, zone: srcZone } = readDragPayload(e)
    if (!inventoryId) return
    setBoard((b) => {
      if (zone === "unassigned") {
        return {
          zones: removeIdFromAllZones(b.zones, inventoryId),
          grej: b.grej.filter((r) => r.inventory_id !== inventoryId),
        }
      }
      if (zone === "gallery" && srcH === handle.toLowerCase() && srcZone === "gallery") {
        const overEl = (e.target as HTMLElement).closest("[data-inventory-id]")
        const overId = overEl?.getAttribute("data-inventory-id") || null
        if (overId && overId !== inventoryId) {
          return { ...b, zones: swapGallery(b.zones, handle, inventoryId, overId) }
        }
      }
      const overEl = (e.target as HTMLElement).closest("[data-inventory-id]")
      const insertBefore = zone === "gallery" ? overEl?.getAttribute("data-inventory-id") : null
      const out = moveInventoryToZone(
        b.zones,
        b.grej,
        handle,
        zone as "primary" | "gallery" | "reference" | "lane_reject",
        inventoryId,
        insertBefore && insertBefore !== inventoryId ? insertBefore : null
      )
      return { zones: out.zones, grej: out.globalRejections }
    })
  }

  const exportJson = useCallback(() => {
    const exportedAt = new Date().toISOString()
    return buildExportDocument({
      exportedAt,
      products: products.map((p) => ({ handle: p.handle, sku: p.sku, collection: p.collection })),
      zonesByHandle: board.zones,
      globalRejections: board.grej,
      notes: null,
    })
  }, [products, board.zones, board.grej])

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

  const poolIdsForTab = useMemo(() => {
    if (poolTab === "unassigned") return unassignedPoolIds
    if (poolTab === "ambiguous") return ambiguousPoolIds
    if (poolTab === "confirmed") return confirmedPoolIds
    if (poolTab === "rejected") return rejectedPoolItems.map((r) => r.inventory_id)
    return []
  }, [poolTab, unassignedPoolIds, ambiguousPoolIds, confirmedPoolIds, rejectedPoolItems])

  const poolShown = poolIdsForTab.slice(0, POOL_LIMIT)
  const poolOverflow = poolIdsForTab.length - poolShown.length

  if (loading) {
    return (
      <div style={{ padding: 48, fontFamily: "system-ui", color: "#64748b" }}>
        Loading legacy media workspace…
      </div>
    )
  }
  if (loadError) {
    return (
      <div style={{ padding: 32, fontFamily: "system-ui", maxWidth: 640, color: "#334155" }}>
        <h1 style={{ fontSize: 20 }}>Legacy Media Assignment Board</h1>
        <p>Could not load data: {loadError}</p>
        <p style={{ fontSize: 14, color: "#64748b" }}>
          Run from repo root: <code>node scripts/build-legacy-media-inventory.mjs</code> and{" "}
          <code>node scripts/build-legacy-media-product-candidate-map.mjs</code>. Start Next from <code>apps/storefront</code> so repo markers resolve.
        </p>
      </div>
    )
  }

  const zoneBox = (label: string, handle: string, zone: Exclude<ZoneDrop, "unassigned">, children: React.ReactNode) => (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => dropZoneStable(e, handle, zone)}
      style={{
        minHeight: 96,
        borderRadius: 10,
        border: "1px dashed #cbd5e1",
        background: "#f8fafc",
        padding: 8,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "flex-start" }}>{children}</div>
    </div>
  )

  const renderZoneThumb = (id: string, handle: string, zone: string, compact = true) => {
    const inv = invById.get(id)
    if (!inv) return null
    const pv = clientPreviewUrl(inv)
    return (
      <MediaImageCard
        key={id}
        inventoryId={id}
        inv={inv}
        previewUrl={pv.url}
        useImg={pv.useImg}
        caption={pv.caption}
        badges={["assigned"]}
        compact={compact}
        onDragStart={(e) => setDragPayload(e, id, handle, zone)}
      />
    )
  }

  const sidebarStats = (coll: string) => {
    const prodN =
      coll === UNKNOWN_COLLECTION
        ? products.length
        : coll === ""
          ? products.length
          : products.filter((p) => (p.collection || "").toLowerCase() === coll).length
    const mediaN = coll === "" ? invSummary?.total_items ?? 0 : collectionMediaCount(coll)
    let assignedN = 0
    let ambN = 0
    let unassignedN = 0
    for (const it of invDoc?.items ?? []) {
      const ce = candById.get(it.id)
      const matchColl =
        coll === ""
          ? true
          : coll === UNKNOWN_COLLECTION
            ? isUnknownHintItem(it, ce)
            : (it.collection_hint || "").toLowerCase() === coll || (ce?.top_candidate?.medusa_collection_handle || "").toLowerCase() === coll
      if (!matchColl) continue
      if (assignedInZones.has(it.id)) assignedN++
      else if (globalRejectedIds.has(it.id)) continue
      else {
        unassignedN++
        if (ce?.identity_confidence === "ambiguous") ambN++
      }
    }
    return { prodN, mediaN, assignedN, ambN, unassignedN }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f1f5f9",
        color: "#0f172a",
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        fontSize: 14,
      }}
    >
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "linear-gradient(180deg, #fff 0%, #f8fafc 100%)",
          borderBottom: "1px solid #e2e8f0",
          padding: "12px 20px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 12,
          justifyContent: "space-between",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>Legacy Media Assignment Board</h1>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>Visual triage · local only · no Medusa apply</p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {(
            [
              ["Total", toolbarCounts.total],
              ["Previewable", toolbarCounts.previewable],
              ["Assigned", toolbarCounts.assigned],
              ["Unassigned", toolbarCounts.unassigned],
              ["Ambiguous (id)", toolbarCounts.ambiguous],
              ["Rejected", toolbarCounts.rejected],
              ["Products w/ assign.", toolbarCounts.productsWithAssigned],
            ] as const
          ).map(([k, v]) => (
            <span
              key={k}
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "6px 10px",
                borderRadius: 8,
                background: "#e2e8f0",
                color: "#334155",
              }}
            >
              {k}: <span style={{ color: "#0f172a" }}>{v}</span>
            </span>
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" onClick={() => void copyJson()} style={btnPrimary}>
            Copy JSON
          </button>
          <button type="button" onClick={downloadJson} style={btnPrimary}>
            Download JSON
          </button>
          <button type="button" onClick={clearLocal} style={btnGhost}>
            Clear local decisions
          </button>
          <button type="button" onClick={resetFilters} style={btnGhost}>
            Reset filters
          </button>
        </div>
      </header>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "stretch", minHeight: "calc(100vh - 88px)" }}>
        <aside
          style={{
            width: 260,
            flexShrink: 0,
            borderRight: "1px solid #e2e8f0",
            background: "#fff",
            padding: 16,
            position: "sticky",
            top: 88,
            alignSelf: "flex-start",
            maxHeight: "calc(100vh - 88px)",
            overflowY: "auto",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 10 }}>Collections</div>
          <button
            type="button"
            onClick={() => setSidebarCollection("")}
            style={navItem(sidebarCollection === "")}
          >
            <div style={{ fontWeight: 600 }}>All collections</div>
            <div style={navMeta}>{sidebarStats("").prodN} products · {sidebarStats("").mediaN} media refs</div>
          </button>
          {collectionKeys.map((ck) => {
            const st = sidebarStats(ck)
            const active = sidebarCollection === ck
            return (
              <button key={ck} type="button" onClick={() => setSidebarCollection(ck)} style={navItem(active)}>
                <div style={{ fontWeight: 600, textTransform: "capitalize" }}>{ck.replace(/-/g, " ")}</div>
                <div style={navMeta}>
                  {st.prodN} pr. · {st.mediaN} media · {st.assignedN} asg · {st.ambN} amb · {st.unassignedN} unasg
                </div>
              </button>
            )
          })}
          <button type="button" onClick={() => setSidebarCollection(UNKNOWN_COLLECTION)} style={navItem(sidebarCollection === UNKNOWN_COLLECTION)}>
            <div style={{ fontWeight: 600 }}>Unknown / unmatched hints</div>
            <div style={navMeta}>{collectionMediaCount(UNKNOWN_COLLECTION)} media rows</div>
          </button>
        </aside>

        <main style={{ flex: 1, minWidth: 0, padding: 16, overflowY: "auto" }}>
          <section
            style={{
              background: "#fff",
              borderRadius: 12,
              border: "1px solid #e2e8f0",
              padding: 12,
              marginBottom: 12,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 10,
            }}
          >
            <label style={labelStyle}>
              Search
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="SKU, handle, filename, product name…" style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Confidence
              <select value={filterConfidence} onChange={(e) => setFilterConfidence(e.target.value)} style={inputStyle}>
                <option value="">All</option>
                {["confirmed", "probable", "ambiguous", "unmatched", "unpreviewable"].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              Source type
              <select value={filterSourceType} onChange={(e) => setFilterSourceType(e.target.value)} style={inputStyle}>
                <option value="">All</option>
                {sourceTypes.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              Assignment
              <select value={filterAssigned} onChange={(e) => setFilterAssigned(e.target.value as typeof filterAssigned)} style={inputStyle}>
                <option value="">All</option>
                <option value="assigned">Assigned to product</option>
                <option value="unassigned">Unassigned</option>
                <option value="rejected">Globally rejected</option>
              </select>
            </label>
            <label style={{ ...labelStyle, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={onlyPreviewable} onChange={(e) => setOnlyPreviewable(e.target.checked)} />
              Previewable only
            </label>
            <label style={labelStyle}>
              Product focus
              <select value={productAdvanced} onChange={(e) => setProductAdvanced(e.target.value as typeof productAdvanced)} style={inputStyle}>
                <option value="">All products</option>
                <option value="no_current_media">No current media</option>
                <option value="has_candidates">Has candidates</option>
                <option value="has_manual">Has manual assignments</option>
              </select>
            </label>
          </section>

          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>
            {selectedHandle ? (
              <>
                Selected product: <strong>{selectedHandle}</strong> — use quick actions in the media pool or drag into zones.
              </>
            ) : (
              <>Click a product card to select it for quick assignment from the pool.</>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {productsFiltered.map((p) => {
              const h = p.handle.toLowerCase()
              const z = board.zones[h] ?? emptyZones()
              const st = laneStatus(p)
              const selected = selectedHandle?.toLowerCase() === h
              return (
                <article
                  key={p.handle}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedHandle(p.handle)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      setSelectedHandle(p.handle)
                    }
                  }}
                  style={{
                    borderRadius: 14,
                    border: selected ? "2px solid #2563eb" : "1px solid #e2e8f0",
                    background: "#fff",
                    boxShadow: selected ? "0 4px 14px rgba(37,99,235,0.15)" : "0 1px 3px rgba(15,23,42,0.06)",
                    padding: 14,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-start" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div style={{ display: "flex", gap: 4 }}>
                        {p.image_urls.slice(0, 3).map((u) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={u} src={u} alt="" width={52} height={52} style={{ borderRadius: 8, objectFit: "cover", border: "1px solid #e2e8f0" }} />
                        ))}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{p.handle}</div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>
                          {p.sku} · {p.collection || "—"}
                        </div>
                        {p.title ? <div style={{ fontSize: 12, marginTop: 4, maxWidth: 360 }}>{p.title}</div> : null}
                        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                          <span style={{ ...badge, background: "#f1f5f9", color: "#475569" }}>Current: {p.image_urls.length}</span>
                          <span style={{ ...badge, background: "#eff6ff", color: "#1d4ed8" }}>
                            Candidates:{" "}
                            {(candDoc?.entries ?? []).filter((e) => e.top_candidate?.medusa_product_handle.toLowerCase() === h).length}
                          </span>
                          <span style={{ ...badge, background: "#f0fdf4", color: "#047857" }}>
                            Manual: {z.primary ? 1 : 0} + {z.gallery.length} gal + {z.reference_only.length} ref
                          </span>
                          <span style={{ ...badge, background: "#fff7ed", color: st.tone }}>{st.label}</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 280 }} onClick={(e) => e.stopPropagation()}>
                      <div
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => dropZoneStable(e, p.handle, "unassigned")}
                        style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}
                      >
                        Drag items here to return to unassigned pool
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                        {zoneBox("Primary", p.handle, "primary", z.primary ? renderZoneThumb(z.primary, p.handle, "primary") : <span style={muted}>Drop one primary</span>)}
                        {zoneBox(
                          "Gallery",
                          p.handle,
                          "gallery",
                          <>
                            {z.gallery.map((id) => renderZoneThumb(id, p.handle, "gallery"))}
                            <span style={muted}>Drop to append · reorder by dragging onto another tile</span>
                          </>
                        )}
                        {zoneBox(
                          "Reference only",
                          p.handle,
                          "reference",
                          z.reference_only.map((id) => renderZoneThumb(id, p.handle, "reference"))
                        )}
                        {zoneBox(
                          "Rejected (this product)",
                          p.handle,
                          "lane_reject",
                          z.lane_rejected.map((id) => renderZoneThumb(id, p.handle, "lane_reject"))
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </main>

        <aside
          style={{
            width: 400,
            flexShrink: 0,
            borderLeft: "1px solid #e2e8f0",
            background: "#fff",
            display: "flex",
            flexDirection: "column",
            maxHeight: "calc(100vh - 88px)",
            position: "sticky",
            top: 88,
            alignSelf: "flex-start",
          }}
        >
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 8 }}>Media pool</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {(
                [
                  ["unassigned", "Unassigned"],
                  ["ambiguous", "Ambiguous"],
                  ["confirmed", "Confirmed"],
                  ["unpreviewable", "Unpreviewable"],
                  ["rejected", "Rejected"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPoolTab(key)}
                  style={{
                    ...tabBtn,
                    background: poolTab === key ? "#0f172a" : "#f1f5f9",
                    color: poolTab === key ? "#fff" : "#334155",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
            {poolTab === "unpreviewable" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {unpreviewableRows.slice(0, POOL_LIMIT).map((it) => (
                  <div
                    key={it.id}
                    style={{
                      fontSize: 11,
                      padding: 10,
                      borderRadius: 10,
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      fontFamily: "ui-monospace, monospace",
                      color: "#475569",
                    }}
                  >
                    <div style={{ fontWeight: 600, color: "#0f172a", marginBottom: 4 }}>{it.filename}</div>
                    <div>{it.preview_reason || "unpreviewable"}</div>
                    <div style={{ marginTop: 4, wordBreak: "break-all" }}>{it.source_path || it.repo_relative_path || ""}</div>
                  </div>
                ))}
                {unpreviewableRows.length > POOL_LIMIT ? (
                  <p style={{ fontSize: 12, color: "#64748b" }}>Showing first {POOL_LIMIT} rows. Narrow filters to see more.</p>
                ) : null}
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))", gap: 10 }}>
                  {poolShown.map((id) => {
                    const inv = invById.get(id)
                    if (!inv) return null
                    const ce = candById.get(id)
                    const pv = clientPreviewUrl(inv)
                    return (
                      <div key={id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <MediaImageCard
                          inventoryId={id}
                          inv={inv}
                          previewUrl={pv.url}
                          useImg={pv.useImg}
                          caption={pv.caption}
                          badges={[ce?.confidence || "—", inv.source_type, inv.collection_hint || ""].filter(Boolean)}
                          compact
                          onDragStart={(e) => setDragPayload(e, id)}
                        />
                        <div style={{ fontSize: 9, color: "#64748b", lineHeight: 1.3 }}>
                          {(inv.sku_hint || "—") + " · " + (inv.handle_hint || "—")}
                          <br />
                          {(inv.collection_hint || ce?.top_candidate?.medusa_collection_handle || "—") + ""}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <button type="button" style={miniBtn} disabled={!selectedHandle} onClick={() => assignToSelected(id, "primary")}>
                            → Primary
                          </button>
                          <button type="button" style={miniBtn} disabled={!selectedHandle} onClick={() => assignToSelected(id, "gallery")}>
                            → Gallery
                          </button>
                          <button type="button" style={miniBtn} disabled={!selectedHandle} onClick={() => assignToSelected(id, "reference")}>
                            → Reference
                          </button>
                          <button type="button" style={miniBtn} disabled={!selectedHandle} onClick={() => assignToSelected(id, "lane_reject")}>
                            Reject for product
                          </button>
                          <button type="button" style={miniBtn} onClick={() => markGlobalReject(id)}>
                            Reject (global)
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {poolOverflow > 0 ? (
                  <p style={{ marginTop: 12, fontSize: 12, color: "#64748b", lineHeight: 1.4 }}>
                    Showing first {POOL_LIMIT} of {poolIdsForTab.length} items. Narrow filters or switch collection to load more.
                  </p>
                ) : null}
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

const btnPrimary: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "none",
  background: "#0f172a",
  color: "#fff",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
}
const btnGhost: React.CSSProperties = {
  ...btnPrimary,
  background: "#e2e8f0",
  color: "#0f172a",
}
const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 600, color: "#64748b" }
const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  fontSize: 13,
}
const navMeta: React.CSSProperties = { fontSize: 10, color: "#94a3b8", marginTop: 4, lineHeight: 1.3 }
function navItem(active: boolean): React.CSSProperties {
  return {
    width: "100%",
    textAlign: "left",
    padding: "10px 12px",
    marginBottom: 8,
    borderRadius: 10,
    border: active ? "2px solid #2563eb" : "1px solid #e2e8f0",
    background: active ? "#eff6ff" : "#f8fafc",
    cursor: "pointer",
  }
}
const badge: React.CSSProperties = { fontSize: 10, fontWeight: 700, padding: "4px 8px", borderRadius: 999 }
const muted: React.CSSProperties = { fontSize: 11, color: "#94a3b8", padding: 8 }
const tabBtn: React.CSSProperties = { fontSize: 11, fontWeight: 600, padding: "6px 10px", borderRadius: 999, border: "none", cursor: "pointer" }
const miniBtn: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  padding: "4px 6px",
  borderRadius: 6,
  border: "1px solid #cbd5e1",
  background: "#fff",
  cursor: "pointer",
}
