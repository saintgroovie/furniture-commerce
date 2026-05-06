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

async function fetchBoardJson(url: string): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; status: number; body: Record<string, unknown> }> {
  const res = await fetch(url)
  const text = await res.text()
  let body: Record<string, unknown> = {}
  try {
    body = JSON.parse(text) as Record<string, unknown>
  } catch {
    body = { _non_json_response: text.slice(0, 500) }
  }
  if (!res.ok) return { ok: false, status: res.status, body }
  return { ok: true, data: body }
}

type PoolTab = "unassigned" | "ambiguous" | "confirmed" | "unpreviewable" | "rejected"
type ZoneDrop = "primary" | "gallery" | "reference" | "lane_reject" | "unassigned"

type ProductUiKind =
  | "no_candidates"
  | "has_auto_matches"
  | "needs_review"
  | "manually_edited"
  | "ready_candidate"
  | "problem_ambiguous"
  | "has_current_idle"

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

function productUiKind(p: ProductRow, zones: Record<string, ProductZoneState>, entryList: CandidateEntry[]): ProductUiKind {
  const h = p.handle.toLowerCase()
  const z = zones[h] ?? emptyZones()
  const manual = Boolean(z.primary || z.gallery.length || z.reference_only.length || z.lane_rejected.length)
  const forProduct = entryList.filter((e) => e.top_candidate?.medusa_product_handle.toLowerCase() === h)
  const candN = forProduct.length
  const hasAmbiguous = forProduct.some((e) => e.identity_confidence === "ambiguous")
  const hasConfirmed = forProduct.some((e) => e.confidence === "confirmed" && e.top_candidate)
  const hasCur = (p.image_urls?.length ?? 0) > 0

  if (manual && hasAmbiguous) return "problem_ambiguous"
  if (manual && z.primary && !hasAmbiguous) return "ready_candidate"
  if (manual) return "manually_edited"
  if (candN === 0) return "no_candidates"
  if (hasAmbiguous) return "needs_review"
  if (hasConfirmed || candN > 0) return "has_auto_matches"
  if (hasCur) return "has_current_idle"
  return "no_candidates"
}

const PRODUCT_STATUS_META: Record<
  ProductUiKind,
  { label: string; bg: string; fg: string; hint: string }
> = {
  no_candidates: {
    label: "No candidates",
    bg: "#f1f5f9",
    fg: "#475569",
    hint: "Matcher did not attach inventory rows to this product.",
  },
  has_auto_matches: {
    label: "Has auto matches",
    bg: "#dbeafe",
    fg: "#1d4ed8",
    hint: "System linked media candidates — pick a product and assign from the pool.",
  },
  needs_review: {
    label: "Needs review",
    bg: "#fef3c7",
    fg: "#b45309",
    hint: "Ambiguous identity — verify before assigning.",
  },
  manually_edited: {
    label: "Manually edited",
    bg: "#d1fae5",
    fg: "#047857",
    hint: "You have local lane assignments for this SKU.",
  },
  ready_candidate: {
    label: "Ready candidate",
    bg: "#dcfce7",
    fg: "#15803d",
    hint: "Primary set with no ambiguous flags on matched rows.",
  },
  problem_ambiguous: {
    label: "Problem / ambiguous",
    bg: "#fee2e2",
    fg: "#b91c1c",
    hint: "Assignments exist but some linked media is still ambiguous.",
  },
  has_current_idle: {
    label: "Has storefront media",
    bg: "#f1f5f9",
    fg: "#334155",
    hint: "Seed already has images; pool triage may still be needed.",
  },
}

type BoardState = { zones: Record<string, ProductZoneState>; grej: GlobalRejection[] }

type LegacyBoardLoadFailure = {
  endpoint: string
  label: string
  status: number
  body: Record<string, unknown>
}

export function LegacyMediaAssignmentBoardClient() {
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadFailureDetail, setLoadFailureDetail] = useState<LegacyBoardLoadFailure | null>(null)
  const [retryNonce, setRetryNonce] = useState(0)
  const [invDoc, setInvDoc] = useState<{ items: InvItem[]; summary: Record<string, unknown> } | null>(null)
  const [candDoc, setCandDoc] = useState<{ entries: CandidateEntry[]; summary: Record<string, unknown> } | null>(null)
  const [products, setProducts] = useState<ProductRow[]>([])
  const [loading, setLoading] = useState(true)

  const [sidebarCollection, setSidebarCollection] = useState<string>("")
  const [collectionSearch, setCollectionSearch] = useState("")
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
  const [focusMode, setFocusMode] = useState(false)
  const [inspectorId, setInspectorId] = useState<string | null>(null)
  const [exportFeedback, setExportFeedback] = useState<"copy" | "download" | null>(null)

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
      setLoadFailureDetail(null)
      const endpoints = [
        { label: "inventory", path: "/inventory" },
        { label: "candidates", path: "/candidates" },
        { label: "products", path: "/products" },
      ] as const
      try {
        const results: Record<string, unknown>[] = []
        for (const ep of endpoints) {
          const url = `${API_BASE}${ep.path}`
          const r = await fetchBoardJson(url)
          if (r.ok === false) {
            if (!cancelled) {
              setLoadFailureDetail({ endpoint: url, label: ep.label, status: r.status, body: r.body })
              const code = typeof r.body.error === "string" ? r.body.error : "request_failed"
              setLoadError(`${ep.label} ${r.status} (${code})`)
            }
            return
          }
          results.push(r.data)
        }
        const j1 = results[0] as { items: InvItem[]; summary: Record<string, unknown> }
        const j2 = results[1] as { entries: CandidateEntry[]; summary: Record<string, unknown> }
        const j3 = results[2] as { products: ProductRow[] }
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
  }, [retryNonce])

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

  useEffect(() => {
    if (!exportFeedback) return
    const t = window.setTimeout(() => setExportFeedback(null), 2800)
    return () => window.clearTimeout(t)
  }, [exportFeedback])

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

  const collectionKeysFiltered = useMemo(() => {
    const q = collectionSearch.trim().toLowerCase()
    if (!q) return collectionKeys
    return collectionKeys.filter((k) => k.includes(q))
  }, [collectionKeys, collectionSearch])

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

  const entryList = useMemo(() => candDoc?.entries ?? [], [candDoc])

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
    const productsReviewed = products.filter((p) => {
      const k = productUiKind(p, board.zones, entryList)
      return k === "manually_edited" || k === "ready_candidate" || k === "problem_ambiguous"
    }).length
    return { total, previewable, assigned, unassigned, ambiguous, rejected, productsWithAssigned, productsReviewed }
  }, [invSummary, invDoc, candDoc, assignedInZones, board.grej, board.zones, globalRejectedIds, products, entryList])

  const localDecisionSlots = assignedInZones.size + board.grej.length

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
    if (
      !window.confirm(
        "Clear all local lane assignments and global rejections from this browser? This cannot be undone (except by re-importing JSON)."
      )
    ) {
      return
    }
    setBoard({ zones: {}, grej: [] })
    setSelectedHandle(null)
    setInspectorId(null)
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
    setCollectionSearch("")
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
      setExportFeedback("copy")
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
    setExportFeedback("download")
  }

  const poolIdsForTab = useMemo(() => {
    if (poolTab === "unassigned") return unassignedPoolIds
    if (poolTab === "ambiguous") return ambiguousPoolIds
    if (poolTab === "confirmed") return confirmedPoolIds
    if (poolTab === "rejected") return rejectedPoolItems.map((r) => r.inventory_id)
    return []
  }, [poolTab, unassignedPoolIds, ambiguousPoolIds, confirmedPoolIds, rejectedPoolItems])

  const poolIdsForTabFocused = useMemo(() => {
    if (!focusMode || !selectedHandle) return poolIdsForTab
    const th = selectedHandle.toLowerCase()
    return poolIdsForTab.filter((id) => {
      const ce = candById.get(id)
      if (!ce) return false
      if (ce.top_candidate?.medusa_product_handle.toLowerCase() === th) return true
      return (ce.candidates ?? []).some((c) => c.medusa_product_handle.toLowerCase() === th)
    })
  }, [focusMode, selectedHandle, poolIdsForTab, candById])

  const poolShown = poolIdsForTabFocused.slice(0, POOL_LIMIT)
  const poolOverflow = poolIdsForTabFocused.length - poolShown.length

  const collectionLabel = useMemo(() => {
    if (sidebarCollection === UNKNOWN_COLLECTION) return "Unknown / unmatched hints"
    if (!sidebarCollection) return "All collections"
    return sidebarCollection.replace(/-/g, " ")
  }, [sidebarCollection])

  const selectedProduct = selectedHandle ? productByHandle.get(selectedHandle.toLowerCase()) ?? null : null

  const assignedElsewhere = useCallback(
    (inventoryId: string): string | null => {
      for (const [h, z] of Object.entries(board.zones)) {
        if (!z) continue
        const ids = [z.primary, ...z.gallery, ...z.reference_only, ...z.lane_rejected].filter(Boolean) as string[]
        if (ids.includes(inventoryId)) {
          const row = productByHandle.get(h)
          return row?.handle ?? h
        }
      }
      return null
    },
    [board.zones, productByHandle]
  )

  if (loading) {
    return (
      <div style={{ padding: 48, fontFamily: "system-ui", color: "#64748b" }}>
        Loading legacy media workspace…
      </div>
    )
  }
  if (loadError) {
    const b = loadFailureDetail?.body
    return (
      <div style={{ padding: 32, fontFamily: "system-ui", maxWidth: 720, color: "#334155" }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Legacy Media Assignment Board</h1>
        <p style={{ fontSize: 16, fontWeight: 700, color: "#b91c1c", marginBottom: 6 }}>Inventory data could not be loaded</p>
        <p style={{ marginBottom: 16 }}>
          <strong>Endpoint:</strong> {loadFailureDetail?.endpoint ?? "(unknown)"} · <strong>Status:</strong> {loadFailureDetail?.status ?? "—"}
        </p>
        <p style={{ marginBottom: 8, color: "#64748b" }}>Summary: {loadError}</p>
        <div
          style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            padding: "16px 18px",
            marginBottom: 20,
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 10, fontSize: 13 }}>Action checklist</div>
          <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7, fontSize: 14 }}>
            <li>
              From repo root: <code>node scripts/build-legacy-media-inventory.mjs</code>
            </li>
            <li>
              From repo root: <code>node scripts/build-legacy-media-product-candidate-map.mjs</code>
            </li>
            <li>
              Start Next from <code>apps/storefront</code> (full checkout with <code>docs/project/CODEMAP.md</code> and <code>data/normalized/</code>).
            </li>
            <li>
              Docker / custom cwd: set <code>FURNITURE_REPO_ROOT</code> to the absolute repo path and restart Next (see docs).
            </li>
          </ol>
        </div>
        {b && Object.keys(b).length > 0 ? (
          <details open style={{ marginBottom: 20 }}>
            <summary style={{ fontWeight: 700, cursor: "pointer", marginBottom: 8 }}>Server response details</summary>
            <pre
              style={{
                fontSize: 12,
                background: "#0f172a",
                color: "#e2e8f0",
                padding: 14,
                borderRadius: 10,
                overflow: "auto",
                maxHeight: 320,
              }}
            >
              {JSON.stringify(b, null, 2)}
            </pre>
          </details>
        ) : null}
        <button
          type="button"
          onClick={() => setRetryNonce((n) => n + 1)}
          style={{
            padding: "10px 18px",
            borderRadius: 10,
            border: "none",
            background: "#0f172a",
            color: "#fff",
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  const zoneBox = (label: string, handle: string, zone: Exclude<ZoneDrop, "unassigned">, children: React.ReactNode) => (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => dropZoneStable(e, handle, zone)}
      style={{
        minHeight: 108,
        borderRadius: 12,
        border: "1px dashed #cbd5e1",
        background: "#f8fafc",
        padding: 10,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>{children}</div>
    </div>
  )

  const renderZoneThumb = (id: string, handle: string, zone: string) => {
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
        badges={["Assigned"]}
        size="compact"
        onDragStart={(e) => setDragPayload(e, id, handle, zone)}
        onOpenDetail={() => setInspectorId(id)}
        filenameMaxLen={22}
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

  const inspectorInv = inspectorId ? invById.get(inspectorId) : null
  const inspectorCe = inspectorId ? candById.get(inspectorId) : null

  const headerH = 132

  const workflowSteps = (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
        padding: "10px 20px",
        borderBottom: "1px solid #e2e8f0",
        background: "#fff",
        position: "sticky",
        top: 72,
        zIndex: 18,
      }}
    >
      {(
        [
          { n: 1, t: "Choose collection", done: true },
          { n: 2, t: "Select product", done: Boolean(selectedHandle) },
          { n: 3, t: "Review images", done: Boolean(selectedHandle) },
          { n: 4, t: "Assign roles", done: localDecisionSlots > 0 },
          { n: 5, t: "Export JSON", done: false },
        ] as const
      ).map((s, i, arr) => (
        <div key={s.n} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: s.done ? "#0f172a" : "#e2e8f0",
              color: s.done ? "#fff" : "#64748b",
            }}
          >
            {s.n}
          </div>
          <span style={{ fontSize: 12, fontWeight: s.done ? 700 : 500, color: s.done ? "#0f172a" : "#64748b" }}>{s.t}</span>
          {i < arr.length - 1 ? <span style={{ color: "#cbd5e1", fontSize: 14 }}>→</span> : null}
        </div>
      ))}
      <div style={{ marginLeft: "auto", fontSize: 12, color: "#475569", textAlign: "right", maxWidth: 420, lineHeight: 1.4 }}>
        <strong>{collectionLabel}</strong>
        {selectedHandle ? (
          <>
            {" · "}
            <strong>{selectedHandle}</strong>
          </>
        ) : (
          <> · No product selected</>
        )}
        <br />
        <span style={{ color: "#64748b" }}>
          Local slots: <strong>{localDecisionSlots}</strong> · Export copies browser-only decisions (not Medusa).
        </span>
      </div>
    </div>
  )

  const renderSelectedWorkspace = (fullWidth: boolean) => {
    if (!selectedHandle || !selectedProduct) {
      return (
        <section
          style={{
            background: "#fff",
            borderRadius: 14,
            border: "1px dashed #cbd5e1",
            padding: 28,
            textAlign: "center",
            color: "#64748b",
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>Select a product to assign images</div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
            Pick a row in the product list (or turn on <strong>Focus mode</strong> after selecting). Drag from the media pool into Primary / Gallery / Reference, or use quick actions.
          </p>
        </section>
      )
    }
    const h = selectedHandle.toLowerCase()
    const z = board.zones[h] ?? emptyZones()
    const candCount = entryList.filter((e) => e.top_candidate?.medusa_product_handle.toLowerCase() === h).length

    return (
      <section
        style={{
          background: "#fff",
          borderRadius: 14,
          border: "2px solid #2563eb",
          boxShadow: "0 8px 28px rgba(37,99,235,0.12)",
          padding: 20,
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Selected product</div>
            <h2 style={{ margin: "6px 0 4px", fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", color: "#0f172a" }}>
              {selectedProduct.title || selectedProduct.handle}
            </h2>
            <div style={{ fontSize: 14, color: "#475569", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <code style={{ background: "#f1f5f9", padding: "2px 8px", borderRadius: 6 }}>{selectedProduct.handle}</code>
              <span>SKU {selectedProduct.sku}</span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: "#eef2ff",
                  color: "#3730a3",
                }}
              >
                {selectedProduct.collection || "— collection"}
              </span>
            </div>
            <p style={{ margin: "14px 0 0", fontSize: 13, color: "#64748b", maxWidth: fullWidth ? 720 : 560, lineHeight: 1.5 }}>
              <strong>Assigned</strong> = Primary + Gallery + Reference for this SKU. <strong>Rejected for this product</strong> stays in the export lane. Drag from the
              pool or use quick actions on tiles. Return items via the strip below.
            </p>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            {selectedProduct.image_urls.slice(0, 4).map((u) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={u} src={u} alt="" width={72} height={72} style={{ borderRadius: 10, objectFit: "cover", border: "1px solid #e2e8f0" }} />
            ))}
          </div>
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: "#64748b" }}>
          Current storefront images: <strong>{selectedProduct.image_urls.length}</strong> · Matcher rows for this handle: <strong>{candCount}</strong> · Local slots:{" "}
          <strong>{(z.primary ? 1 : 0) + z.gallery.length + z.reference_only.length + z.lane_rejected.length}</strong>
        </div>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => dropZoneStable(e, selectedHandle, "unassigned")}
          style={{
            marginTop: 14,
            padding: "10px 12px",
            borderRadius: 10,
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            fontSize: 12,
            color: "#64748b",
          }}
        >
          Drop assigned tiles here to return them to the <strong>unassigned</strong> pool (removes lane placement).
        </div>
        <div
          style={{
            marginTop: 16,
            display: "grid",
            gridTemplateColumns: fullWidth ? "repeat(2, minmax(0, 1fr))" : "1fr",
            gap: 12,
          }}
        >
          {zoneBox("Primary", selectedHandle, "primary", z.primary ? renderZoneThumb(z.primary, selectedHandle, "primary") : <span style={muted}>Drop one primary</span>)}
          {zoneBox(
            "Gallery",
            selectedHandle,
            "gallery",
            <>
              {z.gallery.map((id) => renderZoneThumb(id, selectedHandle, "gallery"))}
              <span style={muted}>Drop to append · drag onto another tile to swap order</span>
            </>
          )}
          {zoneBox(
            "Reference only",
            selectedHandle,
            "reference",
            z.reference_only.length ? z.reference_only.map((id) => renderZoneThumb(id, selectedHandle, "reference")) : <span style={muted}>Optional reference shots</span>
          )}
          {zoneBox(
            "Rejected for this product",
            selectedHandle,
            "lane_reject",
            z.lane_rejected.length ? z.lane_rejected.map((id) => renderZoneThumb(id, selectedHandle, "lane_reject")) : <span style={muted}>Not used on this SKU</span>
          )}
        </div>
      </section>
    )
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#eef2f6",
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
          background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
          borderBottom: "1px solid #e2e8f0",
          padding: "14px 20px 10px",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 16, justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em" }}>Legacy media assignment</h1>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748b", maxWidth: 520 }}>
              Dev-only triage: map legacy files to seed products. <strong>No Medusa apply</strong> — export JSON when finished.
            </p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "#334155", cursor: "pointer" }}>
              <input type="checkbox" checked={focusMode} onChange={(e) => setFocusMode(e.target.checked)} />
              Focus mode
            </label>
            <div style={{ width: 1, height: 28, background: "#e2e8f0" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
                <span style={primaryPill}>
                  Reviewed products: <b>{toolbarCounts.productsReviewed}</b>
                </span>
                <span style={primaryPill}>
                  With assignments: <b>{toolbarCounts.productsWithAssigned}</b>
                </span>
                <span style={primaryPill}>
                  Unassigned media: <b>{toolbarCounts.unassigned}</b>
                </span>
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>
                Total {toolbarCounts.total} · Previewable {toolbarCounts.previewable} · Ambiguous rows {toolbarCounts.ambiguous} · Global rejects{" "}
                {toolbarCounts.rejected}
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12, alignItems: "center" }}>
          <button type="button" onClick={() => void copyJson()} style={btnPrimary}>
            Copy JSON
          </button>
          <button type="button" onClick={downloadJson} style={btnPrimary}>
            Download JSON
          </button>
          {exportFeedback === "copy" ? (
            <span style={successHint}>Copied to clipboard.</span>
          ) : exportFeedback === "download" ? (
            <span style={successHint}>Download started.</span>
          ) : null}
          <button type="button" onClick={clearLocal} style={btnGhost}>
            Clear local decisions…
          </button>
          <button type="button" onClick={resetFilters} style={btnGhost}>
            Reset filters
          </button>
          <p style={{ margin: 0, marginLeft: "auto", fontSize: 12, color: "#64748b", maxWidth: 360, textAlign: "right" }}>
            Exports <strong>local decisions only</strong>. Does not update Medusa or production media.
          </p>
        </div>
      </header>

      {workflowSteps}

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "stretch", minHeight: `calc(100vh - ${headerH}px)` }}>
        <aside
          style={{
            width: 280,
            flexShrink: 0,
            borderRight: "1px solid #e2e8f0",
            background: "#fff",
            padding: 16,
            position: "sticky",
            top: headerH,
            alignSelf: "flex-start",
            maxHeight: `calc(100vh - ${headerH}px)`,
            overflowY: "auto",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Collections</div>
          <input
            value={collectionSearch}
            onChange={(e) => setCollectionSearch(e.target.value)}
            placeholder="Filter collections…"
            style={{ ...inputStyle, width: "100%", marginBottom: 12, boxSizing: "border-box" }}
          />
          <button type="button" onClick={() => setSidebarCollection("")} style={navItem(sidebarCollection === "")}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>All collections</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              <span style={navBadge}>{sidebarStats("").prodN} products</span>
              <span style={navBadge}>{sidebarStats("").mediaN} media</span>
            </div>
          </button>
          {collectionKeysFiltered.map((ck) => {
            const st = sidebarStats(ck)
            const active = sidebarCollection === ck
            return (
              <button key={ck} type="button" onClick={() => setSidebarCollection(ck)} style={navItem(active)}>
                <div style={{ fontWeight: 700, fontSize: 14, textTransform: "capitalize" }}>{ck.replace(/-/g, " ")}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  <span style={navBadge}>{st.mediaN} media</span>
                  <span style={navBadge}>{st.assignedN} asg</span>
                  {st.ambN > 0 ? <span style={{ ...navBadge, background: "#fef3c7", color: "#b45309" }}>{st.ambN} amb</span> : null}
                </div>
              </button>
            )
          })}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: "2px dashed #cbd5e1" }}>
            <button type="button" onClick={() => setSidebarCollection(UNKNOWN_COLLECTION)} style={{ ...navItem(sidebarCollection === UNKNOWN_COLLECTION), background: "#f8fafc" }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#64748b" }}>Unknown / unmatched</div>
              <div style={{ marginTop: 8 }}>
                <span style={{ ...navBadge, background: "#e2e8f0", color: "#475569" }}>{collectionMediaCount(UNKNOWN_COLLECTION)} media rows</span>
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8, lineHeight: 1.35 }}>Matcher could not infer collection — triage carefully.</div>
            </button>
          </div>
        </aside>

        <main style={{ flex: 1, minWidth: 280, padding: 16, overflowY: "auto" }}>
          {!sidebarCollection && !search ? (
            <p style={{ margin: "0 0 14px", padding: "12px 14px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, color: "#1e40af", fontSize: 13 }}>
              <strong>Start here:</strong> choose a collection (or stay on <em>All</em>), then select a product. The media pool stays on the right.
            </p>
          ) : null}

          <details style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "10px 14px", marginBottom: 14 }}>
            <summary style={{ fontWeight: 700, fontSize: 13, color: "#334155", cursor: "pointer" }}>More filters</summary>
            <div
              style={{
                marginTop: 12,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: 12,
              }}
            >
              <label style={labelStyle}>
                Search
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="SKU, handle, filename…" style={inputStyle} />
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
                  <option value="assigned">In a lane</option>
                  <option value="unassigned">Still in pool</option>
                  <option value="rejected">Globally rejected</option>
                </select>
              </label>
              <label style={{ ...labelStyle, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={onlyPreviewable} onChange={(e) => setOnlyPreviewable(e.target.checked)} />
                Previewable only
              </label>
              <label style={labelStyle}>
                Product slice
                <select value={productAdvanced} onChange={(e) => setProductAdvanced(e.target.value as typeof productAdvanced)} style={inputStyle}>
                  <option value="">All products</option>
                  <option value="no_current_media">No storefront media</option>
                  <option value="has_candidates">Has matcher rows</option>
                  <option value="has_manual">Has local lanes</option>
                </select>
              </label>
            </div>
          </details>

          {focusMode && !selectedHandle ? (
            <div style={{ padding: 40, textAlign: "center", color: "#64748b", background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>Focus mode needs a product</div>
              Turn off Focus mode to browse the list, or click a product row first.
            </div>
          ) : (
            <>
              {renderSelectedWorkspace(focusMode)}
              {!focusMode ? (
                <section>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Products in this view</h3>
                    <span style={{ fontSize: 12, color: "#64748b" }}>{productsFiltered.length} rows</span>
                  </div>
                  {productsFiltered.length === 0 ? (
                    <div style={{ padding: 28, background: "#fff", borderRadius: 12, border: "1px dashed #cbd5e1", color: "#64748b", textAlign: "center" }}>
                      No products match filters. Widen search or pick another collection.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {productsFiltered.map((p) => {
                        const h = p.handle.toLowerCase()
                        const z = board.zones[h] ?? emptyZones()
                        const ui = productUiKind(p, board.zones, entryList)
                        const meta = PRODUCT_STATUS_META[ui]
                        const selected = selectedHandle?.toLowerCase() === h
                        const candN = entryList.filter((e) => e.top_candidate?.medusa_product_handle.toLowerCase() === h).length
                        const assignedSlots = (z.primary ? 1 : 0) + z.gallery.length + z.reference_only.length + z.lane_rejected.length
                        return (
                          <article
                            key={p.handle}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              setSelectedHandle(p.handle)
                              setInspectorId(null)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault()
                                setSelectedHandle(p.handle)
                                setInspectorId(null)
                              }
                            }}
                            style={{
                              borderRadius: 12,
                              border: selected ? "2px solid #2563eb" : "1px solid #e2e8f0",
                              background: selected ? "#eff6ff" : "#fff",
                              padding: "12px 14px",
                              cursor: "pointer",
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 14,
                              alignItems: "center",
                              boxShadow: selected ? "0 4px 16px rgba(37,99,235,0.12)" : "0 1px 2px rgba(15,23,42,0.04)",
                            }}
                          >
                            <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0, flex: 1 }}>
                              {p.image_urls[0] ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={p.image_urls[0]} alt="" width={56} height={56} style={{ borderRadius: 10, objectFit: "cover", border: "1px solid #e2e8f0", flexShrink: 0 }} />
                              ) : (
                                <div
                                  style={{
                                    width: 56,
                                    height: 56,
                                    borderRadius: 10,
                                    background: "#f1f5f9",
                                    flexShrink: 0,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: 10,
                                    color: "#94a3b8",
                                    fontWeight: 700,
                                  }}
                                >
                                  No img
                                </div>
                              )}
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 800, fontSize: 16, color: "#0f172a", lineHeight: 1.2 }}>{p.handle}</div>
                                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{p.sku}</div>
                                {p.title ? (
                                  <div style={{ fontSize: 13, color: "#334155", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {p.title}
                                  </div>
                                ) : null}
                                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                                  <span style={{ ...miniCollBadge }}>{p.collection || "—"}</span>
                                  <span style={{ ...statusPill, background: meta.bg, color: meta.fg }} title={meta.hint}>
                                    {meta.label}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div style={{ fontSize: 12, color: "#475569", textAlign: "right" }}>
                              <div>
                                Assigned <strong>{assignedSlots}</strong> · Candidates <strong>{candN}</strong>
                              </div>
                              <button
                                type="button"
                                style={{ ...miniCta, marginTop: 8 }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedHandle(p.handle)
                                  setInspectorId(null)
                                }}
                              >
                                Review product
                              </button>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  )}
                </section>
              ) : null}
            </>
          )}
        </main>

        <aside
          style={{
            width: inspectorId ? 460 : 400,
            flexShrink: 0,
            borderLeft: "1px solid #e2e8f0",
            background: "#fff",
            display: "flex",
            flexDirection: "row",
            maxHeight: `calc(100vh - ${headerH}px)`,
            position: "sticky",
            top: headerH,
            alignSelf: "flex-start",
          }}
        >
          <div style={{ width: inspectorId ? 280 : 400, display: "flex", flexDirection: "column", minWidth: 0 }}>
            <div style={{ padding: "12px 14px", borderBottom: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", marginBottom: 8 }}>Media pool</div>
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
              {!selectedHandle ? (
                <p style={{ margin: "10px 0 0", fontSize: 12, color: "#b45309", lineHeight: 1.4 }}>Select a product first — quick lane actions stay disabled until a SKU is active.</p>
              ) : (
                <p style={{ margin: "10px 0 0", fontSize: 12, color: "#64748b" }}>
                  Dragging or quick actions apply to <strong>{selectedHandle}</strong>.
                  {focusMode ? (
                    <>
                      {" "}
                      <em>Focus mode</em> limits the pool to media whose matcher candidates include this handle.
                    </>
                  ) : null}
                </p>
              )}
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
              {poolTab === "unpreviewable" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {unpreviewableRows.length === 0 ? (
                    <div style={{ padding: 20, color: "#64748b", fontSize: 13 }}>No media in this filter.</div>
                  ) : (
                    unpreviewableRows.slice(0, POOL_LIMIT).map((it) => (
                      <div
                        key={it.id}
                        style={{
                          fontSize: 12,
                          padding: "8px 10px",
                          borderBottom: "1px solid #f1f5f9",
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
                          cursor: "pointer",
                        }}
                        title={it.source_path || it.repo_relative_path || ""}
                        onClick={() => setInspectorId(it.id)}
                      >
                        <div style={{ fontWeight: 700, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.filename}</div>
                        <div style={{ color: "#64748b" }}>{it.preview_reason || "Unpreviewable reference — local source may be missing."}</div>
                      </div>
                    ))
                  )}
                  {unpreviewableRows.length > POOL_LIMIT ? (
                    <p style={{ fontSize: 12, color: "#64748b", padding: 10 }}>
                      Showing first {POOL_LIMIT} rows — narrow filters to see more.
                    </p>
                  ) : null}
                </div>
              ) : poolShown.length === 0 ? (
                <div style={{ padding: 24, color: "#64748b", fontSize: 14, textAlign: "center" }}>
                  {poolTab === "rejected" ? "No global rejections yet." : "No media in this filter."}
                </div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))", gap: 12 }}>
                    {poolShown.map((id) => {
                      const inv = invById.get(id)
                      if (!inv) return null
                      const ce = candById.get(id)
                      const pv = clientPreviewUrl(inv)
                      const elsewhere = assignedElsewhere(id)
                      const poolBadges = [ce?.confidence, inv.source_type].filter(Boolean) as string[]
                      if (inv.collection_hint || ce?.top_candidate?.medusa_collection_handle) {
                        poolBadges.push(String(inv.collection_hint || ce?.top_candidate?.medusa_collection_handle))
                      }
                      return (
                        <div key={id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <MediaImageCard
                            inventoryId={id}
                            inv={inv}
                            previewUrl={pv.url}
                            useImg={pv.useImg}
                            caption={pv.caption}
                            badges={poolBadges.slice(0, 3)}
                            size="large"
                            onDragStart={(e) => setDragPayload(e, id)}
                            onOpenDetail={() => setInspectorId(id)}
                            filenameMaxLen={26}
                            detailTitle={inv.source_path || inv.repo_relative_path || inv.filename}
                          />
                          {elsewhere ? (
                            <div style={{ fontSize: 11, color: "#b45309", lineHeight: 1.35 }}>Already assigned to {elsewhere}</div>
                          ) : null}
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <button
                              type="button"
                              style={miniBtn}
                              disabled={!selectedHandle}
                              title={!selectedHandle ? "Select a product first" : undefined}
                              onClick={() => assignToSelected(id, "primary")}
                            >
                              Primary
                            </button>
                            <button
                              type="button"
                              style={miniBtn}
                              disabled={!selectedHandle}
                              title={!selectedHandle ? "Select a product first" : undefined}
                              onClick={() => assignToSelected(id, "gallery")}
                            >
                              Gallery
                            </button>
                            <button
                              type="button"
                              style={miniBtn}
                              disabled={!selectedHandle}
                              title={!selectedHandle ? "Select a product first" : undefined}
                              onClick={() => assignToSelected(id, "reference")}
                            >
                              Ref
                            </button>
                            <button
                              type="button"
                              style={miniBtn}
                              disabled={!selectedHandle}
                              title={!selectedHandle ? "Select a product first" : undefined}
                              onClick={() => assignToSelected(id, "lane_reject")}
                            >
                              Reject
                            </button>
                            <button type="button" style={{ ...miniBtn, color: "#b91c1c", borderColor: "#fecaca" }} onClick={() => markGlobalReject(id)}>
                              Global ✕
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {poolOverflow > 0 ? (
                    <p style={{ marginTop: 14, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
                      Showing first {POOL_LIMIT} of {poolIdsForTabFocused.length} images — narrow filters or switch collection.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </div>

          {inspectorId && inspectorInv ? (
            <div
              style={{
                width: 320,
                borderLeft: "1px solid #e2e8f0",
                background: "#f8fafc",
                padding: 14,
                overflowY: "auto",
                flexShrink: 0,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Inspector</div>
                <button type="button" style={{ ...miniBtn, padding: "2px 8px" }} onClick={() => setInspectorId(null)}>
                  Close
                </button>
              </div>
              <div style={{ borderRadius: 12, overflow: "hidden", background: "#fff", border: "1px solid #e2e8f0", marginBottom: 12 }}>
                {(() => {
                  const pv = clientPreviewUrl(inspectorInv)
                  return pv.useImg && pv.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pv.url} alt="" style={{ width: "100%", display: "block", maxHeight: 200, objectFit: "cover" }} />
                  ) : (
                    <div style={{ padding: 20, fontSize: 13, color: "#64748b" }}>{pv.caption || inspectorInv.preview_reason || "No preview"}</div>
                  )
                })()}
              </div>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 6, wordBreak: "break-word" }}>{inspectorInv.filename}</div>
              <dl style={{ margin: 0, fontSize: 12, color: "#475569", display: "grid", gap: 8 }}>
                <div>
                  <dt style={{ fontWeight: 700, color: "#94a3b8", fontSize: 10, textTransform: "uppercase" }}>Source path</dt>
                  <dd style={{ margin: "4px 0 0", wordBreak: "break-all" }}>{inspectorInv.source_path || inspectorInv.repo_relative_path || "—"}</dd>
                </div>
                <div>
                  <dt style={{ fontWeight: 700, color: "#94a3b8", fontSize: 10, textTransform: "uppercase" }}>Type / preview</dt>
                  <dd style={{ margin: "4px 0 0" }}>
                    {inspectorInv.source_type} · {inspectorInv.previewable ? "previewable" : "not previewable"}
                  </dd>
                </div>
                {inspectorCe ? (
                  <>
                    <div>
                      <dt style={{ fontWeight: 700, color: "#94a3b8", fontSize: 10, textTransform: "uppercase" }}>Confidence</dt>
                      <dd style={{ margin: "4px 0 0" }}>
                        {inspectorCe.confidence} / {inspectorCe.identity_confidence}
                      </dd>
                    </div>
                    <div>
                      <dt style={{ fontWeight: 700, color: "#94a3b8", fontSize: 10, textTransform: "uppercase" }}>SKU / handle hints</dt>
                      <dd style={{ margin: "4px 0 0" }}>
                        {inspectorInv.sku_hint || "—"} · {inspectorInv.handle_hint || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt style={{ fontWeight: 700, color: "#94a3b8", fontSize: 10, textTransform: "uppercase" }}>Collection hint</dt>
                      <dd style={{ margin: "4px 0 0" }}>{inspectorInv.collection_hint || inspectorCe.top_candidate?.medusa_collection_handle || "—"}</dd>
                    </div>
                    <div>
                      <dt style={{ fontWeight: 700, color: "#94a3b8", fontSize: 10, textTransform: "uppercase" }}>Candidates</dt>
                      <dd style={{ margin: "4px 0 0", maxHeight: 140, overflowY: "auto" }}>
                        {(inspectorCe.candidates || []).slice(0, 6).map((c, i) => (
                          <div key={i} style={{ marginBottom: 6, padding: 6, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                            <div style={{ fontWeight: 700 }}>{c.medusa_product_handle}</div>
                            <div style={{ fontSize: 11, color: "#64748b" }}>
                              {c.medusa_variant_sku} · {c.medusa_collection_handle}
                            </div>
                            <div style={{ fontSize: 11 }}>score {c.score}</div>
                          </div>
                        ))}
                      </dd>
                    </div>
                  </>
                ) : (
                  <div style={{ color: "#94a3b8" }}>No candidate row for this inventory id.</div>
                )}
              </dl>
              {selectedHandle ? (
                <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Apply to {selectedHandle}</div>
                  <button type="button" style={miniBtn} onClick={() => assignToSelected(inspectorId, "primary")}>
                    Primary
                  </button>
                  <button type="button" style={miniBtn} onClick={() => assignToSelected(inspectorId, "gallery")}>
                    Gallery
                  </button>
                  <button type="button" style={miniBtn} onClick={() => assignToSelected(inspectorId, "reference")}>
                    Ref
                  </button>
                  <button type="button" style={miniBtn} onClick={() => assignToSelected(inspectorId, "lane_reject")}>
                    Reject
                  </button>
                </div>
              ) : (
                <p style={{ marginTop: 14, fontSize: 12, color: "#b45309" }}>Select a product to enable lane actions.</p>
              )}
            </div>
          ) : null}
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
function navItem(active: boolean): React.CSSProperties {
  return {
    width: "100%",
    textAlign: "left",
    padding: "12px 14px",
    marginBottom: 10,
    borderRadius: 12,
    border: active ? "2px solid #2563eb" : "1px solid #e2e8f0",
    background: active ? "#eff6ff" : "#fff",
    cursor: "pointer",
    boxShadow: active ? "0 2px 10px rgba(37,99,235,0.12)" : "none",
  }
}
const navBadge: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: "4px 8px",
  borderRadius: 999,
  background: "#f1f5f9",
  color: "#475569",
}
const muted: React.CSSProperties = { fontSize: 11, color: "#94a3b8", padding: 8 }
const tabBtn: React.CSSProperties = { fontSize: 11, fontWeight: 600, padding: "6px 10px", borderRadius: 999, border: "none", cursor: "pointer" }
const miniBtn: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  background: "#fff",
  cursor: "pointer",
}
const primaryPill: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: "8px 12px",
  borderRadius: 999,
  background: "#fff",
  border: "1px solid #e2e8f0",
  color: "#334155",
}
const successHint: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#047857" }
const miniCollBadge: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: "3px 8px",
  borderRadius: 999,
  background: "#eef2ff",
  color: "#3730a3",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
}
const statusPill: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  padding: "4px 10px",
  borderRadius: 999,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
}
const miniCta: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid #2563eb",
  background: "#fff",
  color: "#1d4ed8",
  cursor: "pointer",
}
