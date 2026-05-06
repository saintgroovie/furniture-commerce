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
import type {
  ActivePointerDragState,
  CandidateEntry,
  HoveredLegacyDropTarget,
  InvItem,
  LegacyMediaDragPayload,
  LegacyMediaDragZone,
  ProductRow,
} from "./legacy-media-board-types"
import { MediaImageCard } from "./MediaImageCard"

const LS_KEY = "furniture-legacy-media-assignment-decisions-v1"
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

type PoolTab = "suggested" | "unassigned" | "ambiguous" | "confirmed" | "unpreviewable" | "rejected"
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

function unpreviewableHumanReason(inv: InvItem): string {
  const raw = (inv.preview_reason || "").toLowerCase()
  if (!inv.exists_locally) return "Local source missing — file not found under the resolved repo root."
  if (raw.includes("mount") || raw.includes("not found") || raw.includes("missing")) return "Path not mounted or missing in this environment."
  if (raw.includes("preview") || raw.includes("rule")) return "Not previewable for this board (no safe preview rule)."
  return inv.preview_reason || "Unpreviewable reference."
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

type BoardState = { zones: Record<string, ProductZoneState>; grej: GlobalRejection[] }

function parseDropTargetFromPoint(clientX: number, clientY: number): HoveredLegacyDropTarget | null {
  const el = document.elementFromPoint(clientX, clientY)
  if (!el) return null
  const node = el.closest("[data-legacy-drop-target]") as HTMLElement | null
  if (!node || node.dataset.legacyDropTarget !== "true") return null

  const kind = (node.dataset.dropKind || "").trim()
  const handle = (node.dataset.productHandle || "").trim().toLowerCase()
  const zoneRaw = (node.dataset.zone || "").trim().toLowerCase()
  const invId = (node.dataset.inventoryId || "").trim() || null

  if (kind === "unassigned") {
    if (!handle) return null
    return {
      highlightKey: `return|${handle}`,
      label: "Unassigned",
      targetHandle: handle,
      targetZone: "unassigned",
      galleryHoverInventoryId: null,
    }
  }

  if (kind === "product-zone" && handle) {
    const internalZone: "primary" | "gallery" | "reference" | "lane_reject" | null =
      zoneRaw === "rejected"
        ? "lane_reject"
        : zoneRaw === "primary" || zoneRaw === "gallery" || zoneRaw === "reference"
          ? zoneRaw
          : null
    if (!internalZone) return null
    const label =
      internalZone === "primary"
        ? "Primary"
        : internalZone === "gallery"
          ? "Gallery"
          : internalZone === "reference"
            ? "Reference"
            : "Rejected"
    return {
      highlightKey: `${handle}|${internalZone}`,
      label,
      targetHandle: handle,
      targetZone: internalZone,
      galleryHoverInventoryId: internalZone === "gallery" ? invId : null,
    }
  }

  return null
}

function resolveBoardAfterPointerDrop(
  b: BoardState,
  payload: LegacyMediaDragPayload,
  t: HoveredLegacyDropTarget
): { next: BoardState; action: string } {
  const mediaId = payload.mediaId
  const srcH = (payload.fromProductHandle || "").toLowerCase()
  const srcZ = payload.fromZone || ""

  if (t.targetZone === "unassigned") {
    return {
      next: { zones: removeIdFromAllZones(b.zones, mediaId), grej: b.grej.filter((r) => r.inventory_id !== mediaId) },
      action: "removed to unassigned",
    }
  }

  const th = t.targetHandle.toLowerCase()
  const zone = t.targetZone

  if (zone === "gallery" && srcH === th && srcZ === "gallery") {
    const overId = t.galleryHoverInventoryId
    if (overId && overId !== mediaId) {
      return { next: { ...b, zones: swapGallery(b.zones, t.targetHandle, mediaId, overId) }, action: "gallery reordered" }
    }
  }

  const insertBefore =
    zone === "gallery"
      ? t.galleryHoverInventoryId && t.galleryHoverInventoryId !== mediaId
        ? t.galleryHoverInventoryId
        : null
      : null

  const out = moveInventoryToZone(b.zones, b.grej, t.targetHandle, zone, mediaId, insertBefore)
  const lab =
    zone === "primary" ? "primary" : zone === "gallery" ? "gallery" : zone === "reference" ? "reference" : "rejected (product)"
  return { next: { zones: out.zones, grej: out.globalRejections }, action: `assigned to ${lab}` }
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
    label: "Ambiguous",
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

  const boardRef = useRef<BoardState>({ zones: {}, grej: [] })
  const [board, setBoard] = useState<BoardState>({ zones: {}, grej: [] })
  boardRef.current = board
  const [selectedHandle, setSelectedHandle] = useState<string | null>(null)
  const [poolTab, setPoolTab] = useState<PoolTab>("suggested")
  const [hydrated, setHydrated] = useState(false)
  const skipNextPersist = useRef(false)
  const [focusMode, setFocusMode] = useState(false)
  const [inspectorId, setInspectorId] = useState<string | null>(null)
  const [exportFeedback, setExportFeedback] = useState<"copy" | "download" | null>(null)
  const [activePointerDrag, setActivePointerDrag] = useState<ActivePointerDragState | null>(null)
  const [hoveredDropTarget, setHoveredDropTarget] = useState<HoveredLegacyDropTarget | null>(null)
  const [lastDragAction, setLastDragAction] = useState<string>("—")
  const [dragError, setDragError] = useState<string>("")

  const dragHoverZoneKey = hoveredDropTarget?.highlightKey ?? null

  const beginPointerDrag = useCallback(
    (
      ev: React.PointerEvent,
      init: Omit<ActivePointerDragState, "startX" | "startY" | "currentX" | "currentY">
    ) => {
      if (ev.button !== 0) return
      ev.preventDefault()
      ev.stopPropagation()

      const payload: LegacyMediaDragPayload = {
        type: "legacy_media",
        mediaId: init.mediaId,
        fromProductHandle: init.fromProductHandle,
        fromZone: init.fromZone,
        fromIndex: init.fromIndex,
      }

      const start: ActivePointerDragState = {
        ...init,
        startX: ev.clientX,
        startY: ev.clientY,
        currentX: ev.clientX,
        currentY: ev.clientY,
      }

      setDragError("")
      setActivePointerDrag(start)
      setHoveredDropTarget(null)

      const onMove = (e: PointerEvent) => {
        setActivePointerDrag((prev) => (prev ? { ...prev, currentX: e.clientX, currentY: e.clientY } : null))
        setHoveredDropTarget(parseDropTargetFromPoint(e.clientX, e.clientY))
      }

      const onEnd = (e: PointerEvent) => {
        window.removeEventListener("pointermove", onMove, true)
        window.removeEventListener("pointerup", onEnd, true)
        window.removeEventListener("pointercancel", onEnd, true)

        setActivePointerDrag(null)
        setHoveredDropTarget(null)

        const t = parseDropTargetFromPoint(e.clientX, e.clientY)
        if (!t) {
          setLastDragAction("cancel (no drop zone)")
          return
        }

        const b = boardRef.current
        const r = resolveBoardAfterPointerDrop(b, payload, t)
        setBoard(r.next)
        setLastDragAction(r.action)
      }

      window.addEventListener("pointermove", onMove, { capture: true })
      window.addEventListener("pointerup", onEnd, { capture: true })
      window.addEventListener("pointercancel", onEnd, { capture: true })
    },
    []
  )

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

  const suggestedPoolIds = useMemo(() => {
    const th = selectedHandle?.trim().toLowerCase() || ""
    return unassignedPoolIds.filter((id) => {
      const ce = candById.get(id)
      const top = ce?.top_candidate
      if (!top) return false
      if (th) return top.medusa_product_handle.toLowerCase() === th
      return true
    })
  }, [unassignedPoolIds, candById, selectedHandle])

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
    if (sidebarCollection === UNKNOWN_COLLECTION) {
      list = list.filter((p) => !(p.collection || "").trim())
    } else if (sidebarCollection && sidebarCollection !== UNKNOWN_COLLECTION) {
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

  const clearLocal = () => {
    if (
      !window.confirm(
        "Clear all local lane assignments and global rejections from this browser? This cannot be undone except by re-importing a saved JSON file."
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
    setLastDragAction("global reject")
    setDragError("")
  }

  const assignToSelected = (inventoryId: string, zone: "primary" | "gallery" | "reference" | "lane_reject") => {
    if (!selectedHandle) return
    setBoard((b) => {
      const out = moveInventoryToZone(b.zones, b.grej, selectedHandle, zone, inventoryId, null)
      return { zones: out.zones, grej: out.globalRejections }
    })
    const lab = zone === "lane_reject" ? "product reject" : zone
    setLastDragAction(`quick → ${lab}`)
    setDragError("")
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
    if (poolTab === "suggested") return suggestedPoolIds
    if (poolTab === "unassigned") return unassignedPoolIds
    if (poolTab === "ambiguous") return ambiguousPoolIds
    if (poolTab === "confirmed") return confirmedPoolIds
    if (poolTab === "rejected") return rejectedPoolItems.map((r) => r.inventory_id)
    return []
  }, [poolTab, suggestedPoolIds, unassignedPoolIds, ambiguousPoolIds, confirmedPoolIds, rejectedPoolItems])

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

  const poolEmptyMessage = useMemo(() => {
    if (poolTab === "suggested") {
      return selectedHandle
        ? "No suggested images for this product with the current filters."
        : "No system-suggested rows in the pool — select a product or open Unassigned."
    }
    if (poolTab === "rejected") return "No global rejections yet."
    if (poolTab === "unpreviewable") return "No unpreviewable references match these filters."
    return "No media matches these filters."
  }, [poolTab, selectedHandle])

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

  const zoneBox = (label: string, dropHint: string, handle: string, zone: Exclude<ZoneDrop, "unassigned">, children: React.ReactNode) => {
    const hlc = handle.toLowerCase()
    const zk = `${hlc}|${zone}`
    const hot = dragHoverZoneKey === zk
    const dataZoneAttr = zone === "lane_reject" ? "rejected" : zone
    return (
      <div
        data-legacy-drop-target="true"
        data-drop-kind="product-zone"
        data-product-handle={hlc}
        data-zone={dataZoneAttr}
        style={{
          minHeight: 132,
          borderRadius: 14,
          border: hot ? "2px solid #2563eb" : "1px dashed #cbd5e1",
          background: hot ? "#eff6ff" : "#f8fafc",
          padding: 14,
          transition: "border 0.12s ease, background 0.12s ease",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: hot ? "#1d4ed8" : "#64748b",
            marginBottom: 8,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {hot ? dropHint : label}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>{children}</div>
      </div>
    )
  }

  const renderZoneThumb = (id: string, handle: string, zone: LegacyMediaDragZone) => {
    const inv = invById.get(id)
    if (!inv) return null
    const pv = clientPreviewUrl(inv)
    const gi = zone === "gallery" ? (board.zones[handle.toLowerCase()]?.gallery.indexOf(id) ?? -1) : -1
    return (
      <MediaImageCard
        inventoryId={id}
        inv={inv}
        previewUrl={pv.url}
        useImg={pv.useImg}
        caption={pv.caption}
        badges={["Assigned"]}
        size="compact"
        isPointerDragging={activePointerDrag?.mediaId === id}
        onPointerDragHandleDown={
          inv.previewable
            ? (e) =>
                beginPointerDrag(e, {
                  mediaId: id,
                  fromProductHandle: handle,
                  fromZone: zone,
                  fromIndex: gi >= 0 ? gi : null,
                  filename: inv.filename,
                  previewUrl: pv.url,
                })
            : undefined
        }
        onOpenDetail={() => setInspectorId(id)}
        filenameMaxLen={22}
      />
    )
  }

  const sidebarStats = (coll: string) => {
    const prodN =
      coll === UNKNOWN_COLLECTION
        ? products.filter((p) => !(p.collection || "").trim()).length
        : coll === ""
          ? products.length
          : products.filter((p) => (p.collection || "").toLowerCase() === coll).length
    const mediaN = coll === "" ? invSummary?.total_items ?? 0 : collectionMediaCount(coll)
    let assignedN = 0
    let ambN = 0
    let unassignedN = 0
    let candRows = 0
    for (const e of candDoc?.entries ?? []) {
      const it = invById.get(e.inventory_id)
      if (!it) continue
      const ce = candById.get(e.inventory_id)
      const matchColl =
        coll === ""
          ? true
          : coll === UNKNOWN_COLLECTION
            ? isUnknownHintItem(it, ce)
            : (it.collection_hint || "").toLowerCase() === coll || (e.top_candidate?.medusa_collection_handle || "").toLowerCase() === coll
      if (matchColl) candRows++
    }
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
    return { prodN, mediaN, assignedN, ambN, unassignedN, candRows }
  }

  const inspectorInv = inspectorId ? invById.get(inspectorId) : null
  const inspectorCe = inspectorId ? candById.get(inspectorId) : null

  /** Sticky chrome height (header + workflow) for column scroll regions */
  const headerH = 200

  const exportReady = Boolean(exportFeedback) || localDecisionSlots > 0

  const workflowSteps = (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        alignItems: "center",
        padding: "10px 20px 12px",
        borderTop: "1px solid #e2e8f0",
        background: "#f8fafc",
      }}
    >
      {(
        [
          { n: 1, t: "Choose collection", done: true },
          { n: 2, t: "Select product", done: Boolean(selectedHandle) },
          { n: 3, t: "Review images", done: Boolean(selectedHandle) },
          { n: 4, t: "Assign roles", done: localDecisionSlots > 0 },
          { n: 5, t: "Export JSON", done: exportReady },
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
      <div style={{ marginLeft: "auto", fontSize: 12, color: "#475569", textAlign: "right", maxWidth: 460, lineHeight: 1.45 }}>
        <div>
          <span style={{ color: "#64748b" }}>Collection:</span> <strong>{collectionLabel}</strong>
        </div>
        <div style={{ marginTop: 2 }}>
          <span style={{ color: "#64748b" }}>Product:</span>{" "}
          <strong>{selectedHandle || "— none"}</strong>
        </div>
        <div style={{ marginTop: 2, color: "#64748b" }}>
          Local decisions: <strong>{localDecisionSlots}</strong>
          <span style={{ marginLeft: 8, fontSize: 11 }}>
            Exports local decisions only. Does not update Medusa.
          </span>
        </div>
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
          <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 10 }}>Select a product to start assigning images.</div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}>
            Choose a product from the list (or switch to <strong>Focus mode</strong> after you pick one). Then use the <strong>Drag</strong> handle on pool tiles or quick actions on each tile.
          </p>
          <p style={{ margin: "12px 0 0", fontSize: 12, color: "#b45309" }}>
            <strong>Select a product first</strong> to assign images into Primary / Gallery — or use quick actions in the pool after selecting a SKU.
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
            <p style={{ margin: "14px 0 0", fontSize: 13, color: "#64748b", maxWidth: fullWidth ? 720 : 560, lineHeight: 1.55 }}>
              Use the <strong>Drag</strong> handle on pool tiles or the buttons on each image. Drop assigned tiles on the strip under the storefront thumbnails to return them to the pool.
            </p>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            {selectedProduct.image_urls.slice(0, 4).map((u) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={u} src={u} alt="" width={72} height={72} draggable={false} style={{ borderRadius: 10, objectFit: "cover", border: "1px solid #e2e8f0" }} />
            ))}
          </div>
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: "#94a3b8" }}>
          Storefront images: {selectedProduct.image_urls.length} · Suggested matcher rows: {candCount} · Assigned slots:{" "}
          {(z.primary ? 1 : 0) + z.gallery.length + z.reference_only.length + z.lane_rejected.length}
        </div>
        <div
          data-legacy-drop-target="true"
          data-drop-kind="unassigned"
          data-product-handle={h}
          style={{
            marginTop: 14,
            padding: "14px 14px",
            borderRadius: 12,
            background: dragHoverZoneKey === `return|${h}` ? "#eff6ff" : "#f8fafc",
            border: dragHoverZoneKey === `return|${h}` ? "2px dashed #2563eb" : "1px solid #e2e8f0",
            fontSize: 12,
            color: dragHoverZoneKey === `return|${h}` ? "#1e40af" : "#64748b",
            transition: "border 0.12s ease, background 0.12s ease",
          }}
        >
          {dragHoverZoneKey === `return|${h}` ? (
            <strong>Drop to remove from lanes</strong>
          ) : (
            <>
              Drop assigned tiles here to return them to the <strong>unassigned</strong> pool (removes lane placement).
            </>
          )}
        </div>
        <div
          style={{
            marginTop: 16,
            display: "grid",
            gridTemplateColumns: fullWidth ? "repeat(2, minmax(0, 1fr))" : "1fr",
            gap: 12,
          }}
        >
          {zoneBox("Primary", "Drop to Primary", selectedHandle, "primary", z.primary ? renderZoneThumb(z.primary, selectedHandle, "primary") : <span style={muted}>Drop one primary</span>)}
          {zoneBox(
            "Gallery",
            "Drop to Gallery",
            selectedHandle,
            "gallery",
            <>
              {z.gallery.map((id) => (
                <div
                  key={id}
                  data-legacy-drop-target="true"
                  data-drop-kind="product-zone"
                  data-product-handle={selectedHandle.toLowerCase()}
                  data-zone="gallery"
                  data-inventory-id={id}
                >
                  {renderZoneThumb(id, selectedHandle, "gallery")}
                </div>
              ))}
              <span style={muted}>Drop on the zone to append · drop on another tile to insert or swap order</span>
            </>
          )}
          {zoneBox(
            "Reference only",
            "Drop to Reference",
            selectedHandle,
            "reference",
            z.reference_only.length ? z.reference_only.map((id) => renderZoneThumb(id, selectedHandle, "reference")) : <span style={muted}>Optional reference shots</span>
          )}
          {zoneBox(
            "Rejected for this product",
            "Drop to reject (this SKU)",
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
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        <header style={{ padding: "14px 20px 8px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 16, justifyContent: "space-between" }}>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: "-0.03em", color: "#0f172a" }}>Legacy media assignment</h1>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748b", maxWidth: 560, lineHeight: 1.45 }}>
                Manual QA workspace: match legacy images to seed products. This page never writes Medusa — only your browser and exported JSON.
              </p>
            </div>
            <div style={{ display: "inline-flex", borderRadius: 999, border: "1px solid #e2e8f0", overflow: "hidden", flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setFocusMode(false)}
                style={{
                  ...segToggleBtn,
                  background: !focusMode ? "#0f172a" : "#fff",
                  color: !focusMode ? "#fff" : "#475569",
                }}
              >
                Board mode
              </button>
              <button
                type="button"
                onClick={() => setFocusMode(true)}
                style={{
                  ...segToggleBtn,
                  background: focusMode ? "#0f172a" : "#fff",
                  color: focusMode ? "#fff" : "#475569",
                }}
              >
                Focus mode
              </button>
            </div>
          </div>
          <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginRight: 4 }}>Primary</span>
            <span style={primaryPill}>
              Products reviewed: <b>{toolbarCounts.productsReviewed}</b>
            </span>
            <span style={primaryPill}>
              With assignments: <b>{toolbarCounts.productsWithAssigned}</b>
            </span>
            <span style={primaryPill}>
              Unassigned media: <b>{toolbarCounts.unassigned}</b>
            </span>
          </div>
          <div
            style={{
              marginTop: 8,
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "center",
              fontSize: 11,
              color: "#94a3b8",
            }}
            aria-label="Secondary inventory stats"
          >
            <span style={{ fontWeight: 700, color: "#cbd5e1", textTransform: "uppercase", letterSpacing: "0.06em" }}>Secondary</span>
            <span>total {toolbarCounts.total}</span>
            <span>·</span>
            <span>previewable {toolbarCounts.previewable}</span>
            <span>·</span>
            <span>ambiguous {toolbarCounts.ambiguous}</span>
            <span>·</span>
            <span>rejected {toolbarCounts.rejected}</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12, alignItems: "center" }}>
            <button type="button" onClick={() => void copyJson()} style={btnPrimary}>
              Copy JSON
            </button>
            <button type="button" onClick={downloadJson} style={btnPrimary}>
              Download JSON
            </button>
            {exportFeedback === "copy" ? (
              <span style={successHint} role="status">
                Copied to clipboard.
              </span>
            ) : exportFeedback === "download" ? (
              <span style={successHint} role="status">
                Download started — check your downloads folder.
              </span>
            ) : null}
            <button type="button" onClick={clearLocal} style={btnGhost}>
              Clear local decisions…
            </button>
            <button type="button" onClick={resetFilters} style={btnGhost}>
              Reset filters
            </button>
          </div>
          <p style={{ margin: "10px 0 0", fontSize: 12, color: "#64748b", lineHeight: 1.5, maxWidth: 720 }}>
            <strong>This does not update Medusa.</strong> Save the exported JSON as{" "}
            <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: 6 }}>data/normalized/legacy-media-assignment-decisions.json</code> when you are
            ready to hand it off. Exports <strong>local decisions only</strong>.
          </p>
        </header>
        {workflowSteps}
      </div>

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
            display: focusMode ? "none" : "block",
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
              <span style={navBadge}>{sidebarStats("").candRows} candidates</span>
              <span style={navBadge}>{sidebarStats("").assignedN} assigned</span>
              {sidebarStats("").ambN > 0 ? (
                <span style={{ ...navBadge, background: "#fef3c7", color: "#b45309" }}>{sidebarStats("").ambN} amb</span>
              ) : null}
            </div>
          </button>
          {collectionKeysFiltered.map((ck) => {
            const st = sidebarStats(ck)
            const active = sidebarCollection === ck
            return (
              <button key={ck} type="button" onClick={() => setSidebarCollection(ck)} style={navItem(active)}>
                <div style={{ fontWeight: 700, fontSize: 14, textTransform: "capitalize" }}>{ck.replace(/-/g, " ")}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  <span style={navBadge}>{st.prodN} products</span>
                  <span style={navBadge}>{st.mediaN} media</span>
                  <span style={navBadge}>{st.candRows} candidates</span>
                  <span style={navBadge}>{st.assignedN} assigned</span>
                  {st.ambN > 0 ? <span style={{ ...navBadge, background: "#fef3c7", color: "#b45309" }}>{st.ambN} amb</span> : null}
                </div>
              </button>
            )
          })}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: "2px dashed #cbd5e1" }}>
            <button type="button" onClick={() => setSidebarCollection(UNKNOWN_COLLECTION)} style={{ ...navItem(sidebarCollection === UNKNOWN_COLLECTION), background: "#f8fafc" }}>
              {(() => {
                const u = sidebarStats(UNKNOWN_COLLECTION)
                return (
                  <>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#64748b" }}>Unknown / unmatched</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                <span style={{ ...navBadge, background: "#e2e8f0", color: "#475569" }}>{u.prodN} products</span>
                <span style={{ ...navBadge, background: "#e2e8f0", color: "#475569" }}>{collectionMediaCount(UNKNOWN_COLLECTION)} media</span>
                <span style={{ ...navBadge, background: "#e2e8f0", color: "#475569" }}>{u.candRows} candidates</span>
                <span style={{ ...navBadge, background: "#e2e8f0", color: "#475569" }}>{u.assignedN} assigned</span>
                {u.ambN > 0 ? (
                  <span style={{ ...navBadge, background: "#fef3c7", color: "#b45309" }}>{u.ambN} amb</span>
                ) : null}
              </div>
                  </>
                )
              })()}
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8, lineHeight: 1.35 }}>Matcher could not infer collection — triage carefully.</div>
            </button>
          </div>
        </aside>

        <main style={{ flex: focusMode ? 3 : 1, minWidth: 280, padding: 16, overflowY: "auto" }}>
          {sidebarCollection === "" && !selectedHandle ? (
            <p style={{ margin: "0 0 14px", padding: "12px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, color: "#475569", fontSize: 13 }}>
              <strong>Select a collection to start.</strong> Pick one in the sidebar or stay on <em>All collections</em> to see every product — then choose a product row to load the workspace.
            </p>
          ) : null}
          {sidebarCollection !== "" && !selectedHandle && !focusMode ? (
            <p style={{ margin: "0 0 14px", padding: "12px 14px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, color: "#1e3a8a", fontSize: 13 }}>
              <strong>Select a product to assign images.</strong> Use <em>Review</em> on a row or click the card — the workspace and pool actions apply to that SKU only.
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
              <div style={{ fontSize: 17, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>Select a product to assign images.</div>
              Switch to <strong>Board mode</strong> to browse collections and the full list, or pick a product first.
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
                      <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>No products in this view</div>
                      <div>Widen search, choose another collection, or return to All collections.</div>
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
                              border: selected ? "3px solid #2563eb" : "1px solid #e2e8f0",
                              background: selected ? "#eff6ff" : "#fff",
                              padding: "14px 16px",
                              cursor: "pointer",
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 14,
                              alignItems: "center",
                              boxShadow: selected ? "0 6px 22px rgba(37,99,235,0.18)" : "0 1px 2px rgba(15,23,42,0.04)",
                              outline: selected ? "2px solid rgba(37,99,235,0.25)" : undefined,
                              outlineOffset: selected ? 2 : undefined,
                            }}
                          >
                            <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0, flex: 1 }}>
                              {p.image_urls[0] ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={p.image_urls[0]}
                                  alt=""
                                  width={56}
                                  height={56}
                                  draggable={false}
                                  style={{ borderRadius: 10, objectFit: "cover", border: "1px solid #e2e8f0", flexShrink: 0 }}
                                />
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
                                <div style={{ fontWeight: 800, fontSize: 18, color: "#0f172a", lineHeight: 1.2 }}>{p.handle}</div>
                                {p.title ? (
                                  <div style={{ fontSize: 14, color: "#334155", marginTop: 4, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {p.title}
                                  </div>
                                ) : null}
                                <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>SKU {p.sku}</div>
                                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                                  <span style={{ ...miniCollBadge }}>{p.collection || "—"}</span>
                                  <span style={{ ...statusPill, background: meta.bg, color: meta.fg, textTransform: "none", letterSpacing: "0.01em" }} title={meta.hint}>
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
                                Review
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
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 120, overflowY: "auto" }}>
                {(
                  [
                    ["suggested", "Suggested"],
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
                <p style={{ margin: "10px 0 0", fontSize: 12, color: "#b45309", lineHeight: 1.4 }}>
                  Quick actions stay disabled until a product is selected. <strong>Select a product first.</strong>
                </p>
              ) : (
                <p style={{ margin: "10px 0 0", fontSize: 12, color: "#64748b" }}>
                  Grab the <strong>⋮⋮ Drag</strong> handle on each previewable tile (pointer drag, not the preview image). Quick actions apply to{" "}
                  <strong>{selectedHandle}</strong> — use buttons if dragging is inconvenient.
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
                    <div style={{ padding: 20, color: "#64748b", fontSize: 13 }}>{poolEmptyMessage}</div>
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
                        <div style={{ color: "#64748b" }}>{unpreviewableHumanReason(it)}</div>
                      </div>
                    ))
                  )}
                  {unpreviewableRows.length > POOL_LIMIT ? (
                    <p style={{ fontSize: 12, color: "#64748b", padding: 10 }}>
                      Showing first {POOL_LIMIT} images — narrow filters to see more.
                    </p>
                  ) : null}
                </div>
              ) : poolShown.length === 0 ? (
                <div style={{ padding: 24, color: "#64748b", fontSize: 14, textAlign: "center" }}>{poolEmptyMessage}</div>
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
                            size={focusMode && selectedHandle ? "xlarge" : "large"}
                            isPointerDragging={activePointerDrag?.mediaId === id}
                            onPointerDragHandleDown={
                              inv.previewable
                                ? (e) =>
                                    beginPointerDrag(e, {
                                      mediaId: id,
                                      fromProductHandle: null,
                                      fromZone: "pool",
                                      fromIndex: null,
                                      filename: inv.filename,
                                      previewUrl: pv.url,
                                    })
                                : undefined
                            }
                            onOpenDetail={() => setInspectorId(id)}
                            filenameMaxLen={focusMode && selectedHandle ? 20 : 26}
                            detailTitle={inv.source_path || inv.repo_relative_path || inv.filename}
                          />
                          {elsewhere ? (
                            <div style={{ fontSize: 11, color: "#b45309", lineHeight: 1.35 }}>This image is already assigned to {elsewhere}.</div>
                          ) : null}
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <button
                              type="button"
                              draggable={false}
                              style={miniBtn}
                              disabled={!selectedHandle}
                              title={!selectedHandle ? "Select a product first" : undefined}
                              onMouseDown={(e) => e.stopPropagation()}
                              onDragStart={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                              }}
                              onClick={() => assignToSelected(id, "primary")}
                            >
                              Primary
                            </button>
                            <button
                              type="button"
                              draggable={false}
                              style={miniBtn}
                              disabled={!selectedHandle}
                              title={!selectedHandle ? "Select a product first" : undefined}
                              onMouseDown={(e) => e.stopPropagation()}
                              onDragStart={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                              }}
                              onClick={() => assignToSelected(id, "gallery")}
                            >
                              Gallery
                            </button>
                            <button
                              type="button"
                              draggable={false}
                              style={miniBtn}
                              disabled={!selectedHandle}
                              title={!selectedHandle ? "Select a product first" : undefined}
                              onMouseDown={(e) => e.stopPropagation()}
                              onDragStart={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                              }}
                              onClick={() => assignToSelected(id, "reference")}
                            >
                              Ref
                            </button>
                            <button
                              type="button"
                              draggable={false}
                              style={miniBtn}
                              disabled={!selectedHandle}
                              title={!selectedHandle ? "Select a product first" : undefined}
                              onMouseDown={(e) => e.stopPropagation()}
                              onDragStart={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                              }}
                              onClick={() => assignToSelected(id, "lane_reject")}
                            >
                              Reject
                            </button>
                            <button
                              type="button"
                              draggable={false}
                              style={{ ...miniBtn, color: "#b91c1c", borderColor: "#fecaca" }}
                              onMouseDown={(e) => e.stopPropagation()}
                              onDragStart={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                              }}
                              onClick={() => markGlobalReject(id)}
                            >
                              Global ✕
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {poolOverflow > 0 ? (
                    <p style={{ marginTop: 14, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
                      Showing first {POOL_LIMIT} images — narrow filters to see more.
                    </p>
                  ) : null}
                </>
              )}
            </div>
            <div
              style={{
                fontSize: 10,
                padding: "10px 12px",
                borderTop: "1px solid #e2e8f0",
                color: "#475569",
                display: "grid",
                gap: 4,
                background: "#fafafa",
                lineHeight: 1.35,
              }}
              aria-live="polite"
            >
              <div>
                <strong style={{ color: "#334155" }}>Drag (dev)</strong>
              </div>
              <div>
                Pointer drag:{" "}
                <strong style={{ color: activePointerDrag ? "#15803d" : "#64748b" }}>{activePointerDrag ? "active" : "idle"}</strong>
              </div>
              <div>
                Dragging:{" "}
                <span style={{ color: "#0f172a", fontWeight: 600 }}>
                  {activePointerDrag ? `${activePointerDrag.mediaId} · ${activePointerDrag.filename}` : "—"}
                </span>
              </div>
              <div>
                Hover target:{" "}
                <span style={{ color: "#0f172a", fontWeight: 600 }}>{hoveredDropTarget ? hoveredDropTarget.label : "—"}</span>
              </div>
              <div>
                Last action: <span style={{ color: "#0f172a", fontWeight: 600 }}>{lastDragAction}</span>
              </div>
              <div>
                Last error: <span style={{ color: dragError ? "#b91c1c" : "#64748b" }}>{dragError || "—"}</span>
              </div>
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
                    {!inspectorInv.previewable ? (
                      <div style={{ marginTop: 6, color: "#b45309" }}>{unpreviewableHumanReason(inspectorInv)}</div>
                    ) : null}
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
                      <dt style={{ fontWeight: 700, color: "#94a3b8", fontSize: 10, textTransform: "uppercase" }}>Matched candidates</dt>
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
                <p style={{ marginTop: 14, fontSize: 12, color: "#b45309" }}>Select a product first.</p>
              )}
            </div>
          ) : null}
        </aside>
      </div>
      {activePointerDrag ? (
        <div
          aria-hidden
          style={{
            position: "fixed",
            left: activePointerDrag.currentX + 14,
            top: activePointerDrag.currentY + 14,
            zIndex: 99999,
            pointerEvents: "none",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            borderRadius: 12,
            background: "rgba(255,255,255,0.94)",
            border: "1px solid #cbd5e1",
            boxShadow: "0 12px 32px rgba(15,23,42,0.22)",
            maxWidth: 320,
          }}
        >
          {activePointerDrag.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={activePointerDrag.previewUrl}
              alt=""
              width={48}
              height={48}
              draggable={false}
              style={{ borderRadius: 8, objectFit: "cover", flexShrink: 0, border: "1px solid #e2e8f0" }}
            />
          ) : (
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 8,
                background: "#e2e8f0",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9,
                fontWeight: 800,
                color: "#64748b",
              }}
            >
              —
            </div>
          )}
          <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            <span
              style={{
                fontSize: 9,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "#2563eb",
                width: "fit-content",
                padding: "2px 6px",
                borderRadius: 4,
                background: "#eff6ff",
              }}
            >
              Dragging
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", lineHeight: 1.25, wordBreak: "break-word" }}>
              {activePointerDrag.filename}
            </span>
            <span style={{ fontSize: 10, color: "#64748b", fontFamily: "ui-monospace, monospace" }}>{activePointerDrag.mediaId}</span>
          </div>
        </div>
      ) : null}
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

const segToggleBtn: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  padding: "8px 16px",
  border: "none",
  cursor: "pointer",
}
