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
  CandidateEntry,
  InvItem,
  LegacyMediaDragPayload,
  LegacyMediaDragZone,
  ProductRow,
  SuggestedVariant,
} from "./legacy-media-board-types"
import { MediaImageCard } from "./MediaImageCard"

const LS_KEY = "furniture-legacy-media-assignment-decisions-v1"
const LS_VARIANTS_KEY = "furniture-legacy-media-assignment-variants-v1"
const POOL_LIMIT = 120
const UNKNOWN_COLLECTION = "__unknown__"
const DEFAULT_VARIANT_KEY = "__default__"
const API_BASE = "/qa/legacy-media-assignment-board/api"
const PREVIEW_ROUTE = "/qa/legacy-media-assignment-board/preview"
const DND_JSON = "application/json"
const DEV_SENTINEL = "Legacy Board UI assisted variants visible"
const DEV_SENTINEL_BUILD = "2026-05-07T14:45Z"

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
type ActionSource = "button" | "manual" | "drag"

type TargetSnapshot = {
  tagName: string
  className: string
  mediaId: string
  productHandle: string
  closestCard: string
  closestDraggable: string
  closestDropZone: string
  actionButton: string
}

type DevDiagnostics = {
  lastPointerDown: TargetSnapshot | null
  lastClick: TargetSnapshot | null
  lastDragStart: TargetSnapshot | null
  lastDragOver: TargetSnapshot | null
  lastDrop: TargetSnapshot | null
  cardHandlerFired: boolean
  buttonHandlerFired: boolean
  stateUpdateRequested: boolean
  stateActuallyChanged: boolean
  lastAction: string
  lastError: string
  source: ActionSource | "none"
  mediaId: string
  productHandle: string
  targetZone: string
  dragSource: string
  laneId: string
  variantKey: string
  reorderFrom: string
  reorderTo: string
}
type VariantDecisionState = {
  label: string
  primary: string | null
  gallery: string[]
  reference: string[]
  rejected: string[]
}
type VariantStatus = "suggested" | "confirmed" | "edited" | "rejected"
type VariantMetaState = {
  colorSkuOrArticle: string
  sourceUrl: string | null
  sourcePathHints: string[]
  reasons: string[]
  confidence: "high" | "medium" | "low"
  status: VariantStatus
  fetchedAt: string
}

type VariantsByHandle = Record<string, Record<string, VariantDecisionState>>
type VariantMetaByHandle = Record<string, Record<string, VariantMetaState>>

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

function emptyVariant(label = "Default"): VariantDecisionState {
  return { label, primary: null, gallery: [], reference: [], rejected: [] }
}

function toZoneState(v: VariantDecisionState): ProductZoneState {
  return { primary: v.primary, gallery: [...v.gallery], reference_only: [...v.reference], lane_rejected: [...v.rejected] }
}

function fromZoneState(z: ProductZoneState, label = "Default"): VariantDecisionState {
  return { label, primary: z.primary, gallery: [...z.gallery], reference: [...z.reference_only], rejected: [...z.lane_rejected] }
}

function titleFromToken(token: string): string {
  if (!token) return "Unknown"
  return token
    .split(/[_-]+/)
    .filter(Boolean)
    .map((x) => x[0]?.toUpperCase() + x.slice(1))
    .join(" ")
}

function extractColorToken(inv: InvItem): string {
  const hay = `${inv.filename} ${inv.source_path || ""} ${inv.repo_relative_path || ""}`.toLowerCase()
  const m = hay.match(/(?:color|colour)[_-]([a-z0-9-]+)/)
  return m?.[1] || ""
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

function asElementTarget(target: EventTarget | null): HTMLElement | null {
  if (target instanceof HTMLElement) return target
  if (target instanceof Element) return target as HTMLElement
  if (target instanceof Node) return target.parentElement
  return null
}

function describeTargetFromElement(el: EventTarget | null): TargetSnapshot | null {
  const targetEl = asElementTarget(el)
  if (!targetEl) return null
  const nearestCard = targetEl.closest("[data-media-card]") as HTMLElement | null
  const nearestDrop = targetEl.closest("[data-drop-zone]") as HTMLElement | null
  const nearestDraggable = targetEl.closest("[draggable='true']") as HTMLElement | null
  const nearestAction = targetEl.closest("[data-action-button]") as HTMLElement | null
  return {
    tagName: targetEl.tagName.toLowerCase(),
    className: String(targetEl.className || ""),
    mediaId: nearestCard?.dataset.mediaId || "",
    productHandle: nearestCard?.dataset.productHandle || nearestDrop?.dataset.productHandle || "",
    closestCard: nearestCard ? nearestCard.tagName.toLowerCase() : "",
    closestDraggable: nearestDraggable ? nearestDraggable.tagName.toLowerCase() : "",
    closestDropZone: nearestDrop?.dataset.dropZone || "",
    actionButton: nearestAction?.dataset.actionButton || "",
  }
}

function boardStateEqual(a: BoardState, b: BoardState): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function writeLegacyDragData(e: React.DragEvent, p: LegacyMediaDragPayload): boolean {
  const s = JSON.stringify(p)
  e.dataTransfer.setData("text/plain", s)
  try {
    e.dataTransfer.setData(DND_JSON, s)
  } catch {
    return false
  }
  e.dataTransfer.effectAllowed = "move"
  return true
}

function readLegacyDragData(e: React.DragEvent): LegacyMediaDragPayload | null {
  const fallbackMimes = ["application/x-legacy-inv", "application/x-legacy-handle", "application/x-legacy-zone"]
  let raw = ""
  try {
    raw = e.dataTransfer.getData("text/plain") || e.dataTransfer.getData(DND_JSON)
  } catch {
    raw = e.dataTransfer.getData("text/plain")
  }
  if (raw) {
    try {
      const o = JSON.parse(raw) as LegacyMediaDragPayload
      if (o?.type === "legacy_media" && typeof o.mediaId === "string") return o
    } catch {
      /* ignore */
    }
  }
  const legacyId = e.dataTransfer.getData(fallbackMimes[0])
  if (!legacyId) return null
  const zh = (e.dataTransfer.getData(fallbackMimes[1]) || "").trim()
  const zz = (e.dataTransfer.getData(fallbackMimes[2]) || "").trim()
  const validZ = ["primary", "gallery", "reference", "lane_reject", "pool"].includes(zz)
  return {
    type: "legacy_media",
    mediaId: legacyId,
    fromProductHandle: zh || null,
    fromZone: validZ ? (zz as LegacyMediaDragZone) : zh ? null : "pool",
  }
}

function resolveBoardAfterDrop(
  b: BoardState,
  e: React.DragEvent,
  targetHandle: string,
  targetZone: ZoneDrop,
  payload: LegacyMediaDragPayload
): { next: BoardState; action: string } {
  const mediaId = payload.mediaId
  const srcH = (payload.fromProductHandle || "").toLowerCase()
  const srcZ = payload.fromZone || ""

  if (targetZone === "unassigned") {
    return {
      next: { zones: removeIdFromAllZones(b.zones, mediaId), grej: b.grej.filter((r) => r.inventory_id !== mediaId) },
      action: "removed to unassigned",
    }
  }

  const th = targetHandle.toLowerCase()
  const zone = targetZone

  if (zone === "gallery" && srcH === th && srcZ === "gallery") {
    const overEl = (e.target as HTMLElement).closest("[data-inventory-id]")
    const overId = overEl?.getAttribute("data-inventory-id") || null
    if (overId && overId !== mediaId) {
      return { next: { ...b, zones: swapGallery(b.zones, targetHandle, mediaId, overId) }, action: "gallery reordered" }
    }
  }

  const overEl = (e.target as HTMLElement).closest("[data-inventory-id]")
  const insertBefore = zone === "gallery" ? overEl?.getAttribute("data-inventory-id") : null

  const out = moveInventoryToZone(b.zones, b.grej, targetHandle, zone, mediaId, insertBefore && insertBefore !== mediaId ? insertBefore : null)
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

  const [board, setBoard] = useState<BoardState>({ zones: {}, grej: [] })
  const [selectedHandle, setSelectedHandle] = useState<string | null>(null)
  const [poolTab, setPoolTab] = useState<PoolTab>("suggested")
  const [hydrated, setHydrated] = useState(false)
  const skipNextPersist = useRef(false)
  const [focusMode, setFocusMode] = useState(false)
  const [inspectorId, setInspectorId] = useState<string | null>(null)
  const [exportFeedback, setExportFeedback] = useState<"copy" | "download" | null>(null)
  const [dragHoverZoneKey, setDragHoverZoneKey] = useState<string | null>(null)
  const [draggingMediaId, setDraggingMediaId] = useState<string | null>(null)
  const [dragStart, setDragStart] = useState<"yes" | "no">("no")
  const [payloadWritten, setPayloadWritten] = useState<"yes" | "no" | "n/a">("n/a")
  const [lastDropTarget, setLastDropTarget] = useState<string>("—")
  const [lastDragAction, setLastDragAction] = useState<string>("—")
  const [dragError, setDragError] = useState<string>("")
  const [manualMediaId, setManualMediaId] = useState("")
  const [manualZone, setManualZone] = useState<ZoneDrop>("primary")
  const [variantsByHandle, setVariantsByHandle] = useState<VariantsByHandle>({})
  const [variantMetaByHandle, setVariantMetaByHandle] = useState<VariantMetaByHandle>({})
  const [activeVariantByHandle, setActiveVariantByHandle] = useState<Record<string, string>>({})
  const [rejectedSuggestedVariantsByHandle, setRejectedSuggestedVariantsByHandle] = useState<Record<string, string[]>>({})
  const [newVariantLabel, setNewVariantLabel] = useState("")
  const [diagExpanded, setDiagExpanded] = useState(false)
  const [diag, setDiag] = useState<DevDiagnostics>({
    lastPointerDown: null,
    lastClick: null,
    lastDragStart: null,
    lastDragOver: null,
    lastDrop: null,
    cardHandlerFired: false,
    buttonHandlerFired: false,
    stateUpdateRequested: false,
    stateActuallyChanged: false,
    lastAction: "—",
    lastError: "",
    source: "none",
    mediaId: "",
    productHandle: "",
    targetZone: "",
    dragSource: "—",
    laneId: "—",
    variantKey: "—",
    reorderFrom: "—",
    reorderTo: "—",
  })

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
        const seeded: VariantsByHandle = {}
        for (const [handle, z] of Object.entries(v2.zonesByHandle)) {
          seeded[handle] = { [DEFAULT_VARIANT_KEY]: fromZoneState(z, "Default") }
        }
        setVariantsByHandle(seeded)
      }
      const rawVariants = localStorage.getItem(LS_VARIANTS_KEY)
      if (rawVariants) {
        const parsed = JSON.parse(rawVariants) as {
          variantsByHandle?: VariantsByHandle
          variantMetaByHandle?: VariantMetaByHandle
          activeVariantByHandle?: Record<string, string>
          rejectedSuggestedVariantsByHandle?: Record<string, string[]>
        }
        if (parsed.variantsByHandle && typeof parsed.variantsByHandle === "object") setVariantsByHandle(parsed.variantsByHandle)
        if (parsed.variantMetaByHandle && typeof parsed.variantMetaByHandle === "object") setVariantMetaByHandle(parsed.variantMetaByHandle)
        if (parsed.activeVariantByHandle && typeof parsed.activeVariantByHandle === "object") setActiveVariantByHandle(parsed.activeVariantByHandle)
        if (parsed.rejectedSuggestedVariantsByHandle && typeof parsed.rejectedSuggestedVariantsByHandle === "object") {
          setRejectedSuggestedVariantsByHandle(parsed.rejectedSuggestedVariantsByHandle)
        }
      }
    } catch {
      /* ignore */
    } finally {
      setHydrated(true)
    }
  }, [invDoc])

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return
    try {
      localStorage.setItem(
        LS_VARIANTS_KEY,
        JSON.stringify({ variantsByHandle, variantMetaByHandle, activeVariantByHandle, rejectedSuggestedVariantsByHandle })
      )
    } catch {
      /* ignore */
    }
  }, [hydrated, variantsByHandle, variantMetaByHandle, activeVariantByHandle, rejectedSuggestedVariantsByHandle])

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

  useEffect(() => {
    const onPointerDown = (ev: PointerEvent) => setDiag((d) => ({ ...d, lastPointerDown: describeTargetFromElement(ev.target) }))
    const onClick = (ev: MouseEvent) => setDiag((d) => ({ ...d, lastClick: describeTargetFromElement(ev.target) }))
    const onDragStart = (ev: DragEvent) => setDiag((d) => ({ ...d, lastDragStart: describeTargetFromElement(ev.target) }))
    const onDragOver = (ev: DragEvent) => setDiag((d) => ({ ...d, lastDragOver: describeTargetFromElement(ev.target) }))
    const onDrop = (ev: DragEvent) => setDiag((d) => ({ ...d, lastDrop: describeTargetFromElement(ev.target) }))
    document.addEventListener("pointerdown", onPointerDown, true)
    document.addEventListener("click", onClick, true)
    document.addEventListener("dragstart", onDragStart, true)
    document.addEventListener("dragover", onDragOver, true)
    document.addEventListener("drop", onDrop, true)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true)
      document.removeEventListener("click", onClick, true)
      document.removeEventListener("dragstart", onDragStart, true)
      document.removeEventListener("dragover", onDragOver, true)
      document.removeEventListener("drop", onDrop, true)
    }
  }, [])

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

  useEffect(() => {
    if (selectedHandle) return
    if (productsFiltered.length === 0) return
    setSelectedHandle(productsFiltered[0].handle)
  }, [selectedHandle, productsFiltered])

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
    setVariantsByHandle({})
    setVariantMetaByHandle({})
    setActiveVariantByHandle({})
    setRejectedSuggestedVariantsByHandle({})
    setSelectedHandle(null)
    setInspectorId(null)
    try {
      localStorage.removeItem(LS_KEY)
      localStorage.removeItem(LS_VARIANTS_KEY)
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
    const prev = board
    const next = {
      zones: removeIdFromAllZones(prev.zones, inventoryId),
      grej: [...prev.grej.filter((r) => r.inventory_id !== inventoryId), { inventory_id: inventoryId, reason: "not_this_product" }],
    }
    const changed = !boardStateEqual(prev, next)
    setBoard(next)
    setLastDragAction("global reject")
    setDragError(changed ? "" : "state unchanged")
    setDiag((d) => ({
      ...d,
      buttonHandlerFired: true,
      stateUpdateRequested: true,
      stateActuallyChanged: changed,
      lastAction: "global reject",
      lastError: changed ? "" : "state unchanged",
      source: "button",
      mediaId: inventoryId,
      productHandle: selectedHandle || "",
      targetZone: "global_reject",
    }))
  }

  const applyAssignment = useCallback(
    (source: ActionSource, inventoryId: string, zone: ZoneDrop, explicitHandle?: string | null, explicitVariantKey?: string | null) => {
      const activeHandle = (explicitHandle || selectedHandle || "").trim()
      const hh = activeHandle.toLowerCase()
      const chosenVariantKey = (explicitVariantKey || activeVariantByHandle[hh] || DEFAULT_VARIANT_KEY).trim() || DEFAULT_VARIANT_KEY
      if (!activeHandle && zone !== "unassigned") {
        const msg = "Select product first"
        setDragError(msg)
        setLastDragAction("blocked")
        setDiag((d) => ({
          ...d,
          buttonHandlerFired: source === "button" ? true : d.buttonHandlerFired,
          stateUpdateRequested: true,
          stateActuallyChanged: false,
          lastAction: "blocked",
          lastError: msg,
          source,
          mediaId: inventoryId,
          productHandle: "",
          targetZone: zone,
        }))
        return false
      }

      const prev = board
      const next =
        zone === "unassigned"
          ? { zones: removeIdFromAllZones(prev.zones, inventoryId), grej: prev.grej.filter((r) => r.inventory_id !== inventoryId) }
          : (() => {
              const out = moveInventoryToZone(prev.zones, prev.grej, activeHandle, zone as Exclude<ZoneDrop, "unassigned">, inventoryId, null)
              return { zones: out.zones, grej: out.globalRejections }
            })()

      const changed = !boardStateEqual(prev, next)
      setBoard(next)
      setVariantsByHandle((prevV) => {
        if (zone === "unassigned") {
          const out: VariantsByHandle = {}
          for (const [ph, variants] of Object.entries(prevV)) {
            out[ph] = {}
            for (const [vk, vv] of Object.entries(variants)) {
              out[ph][vk] = {
                ...vv,
                primary: vv.primary === inventoryId ? null : vv.primary,
                gallery: vv.gallery.filter((x) => x !== inventoryId),
                reference: vv.reference.filter((x) => x !== inventoryId),
                rejected: vv.rejected.filter((x) => x !== inventoryId),
              }
            }
          }
          return out
        }
        const hVariants = prevV[hh] ?? { [DEFAULT_VARIANT_KEY]: fromZoneState(board.zones[hh] ?? emptyZones(), "Default") }
        const active = hVariants[chosenVariantKey] ?? emptyVariant(chosenVariantKey === DEFAULT_VARIANT_KEY ? "Default" : chosenVariantKey)
        const cleaned = {
          ...active,
          primary: active.primary === inventoryId ? null : active.primary,
          gallery: active.gallery.filter((x) => x !== inventoryId),
          reference: active.reference.filter((x) => x !== inventoryId),
          rejected: active.rejected.filter((x) => x !== inventoryId),
        }
        if (zone === "primary") cleaned.primary = inventoryId
        if (zone === "gallery") cleaned.gallery = [...cleaned.gallery, inventoryId]
        if (zone === "reference") cleaned.reference = [...cleaned.reference, inventoryId]
        if (zone === "lane_reject") cleaned.rejected = [...cleaned.rejected, inventoryId]
        setVariantMetaByHandle((prevMeta) => ({
          ...prevMeta,
          [hh]: {
            ...(prevMeta[hh] ?? {}),
            [chosenVariantKey]: {
              colorSkuOrArticle: prevMeta[hh]?.[chosenVariantKey]?.colorSkuOrArticle || "",
              sourceUrl: prevMeta[hh]?.[chosenVariantKey]?.sourceUrl || null,
              sourcePathHints: prevMeta[hh]?.[chosenVariantKey]?.sourcePathHints || [],
              reasons: prevMeta[hh]?.[chosenVariantKey]?.reasons || ["manual assignment"],
              confidence: prevMeta[hh]?.[chosenVariantKey]?.confidence || "low",
              status: "edited",
              fetchedAt: prevMeta[hh]?.[chosenVariantKey]?.fetchedAt || new Date().toISOString(),
            },
          },
        }))
        return { ...prevV, [hh]: { ...hVariants, [chosenVariantKey]: cleaned } }
      })
      setLastDragAction(`${source} → ${zone}`)
      setDragError(changed ? "" : "state unchanged")
      setDiag((d) => ({
        ...d,
        buttonHandlerFired: source === "button" ? true : d.buttonHandlerFired,
        stateUpdateRequested: true,
        stateActuallyChanged: changed,
        lastAction: `${source} -> ${zone}`,
        lastError: changed ? "" : "state unchanged",
        source,
        mediaId: inventoryId,
        productHandle: activeHandle,
        targetZone: zone,
        dragSource: source,
        variantKey: chosenVariantKey,
      }))
      return changed
    },
    [board, selectedHandle, activeVariantByHandle]
  )

  const updateVariantDecision = useCallback(
    (handle: string, variantKey: string, updater: (prev: VariantDecisionState) => VariantDecisionState, action: string, mediaId: string) => {
      const hh = handle.toLowerCase()
      setVariantsByHandle((prev) => {
        const variants = prev[hh] ?? { [DEFAULT_VARIANT_KEY]: fromZoneState(board.zones[hh] ?? emptyZones(), "Default") }
        const prevVariant = variants[variantKey] ?? emptyVariant(variantKey === DEFAULT_VARIANT_KEY ? "Default" : variantKey)
        const nextVariant = updater(prevVariant)
        setBoard((boardPrev) => ({
          ...boardPrev,
          zones: {
            ...boardPrev.zones,
            [hh]: toZoneState(nextVariant),
          },
        }))
        setVariantMetaByHandle((prevMeta) => ({
          ...prevMeta,
          [hh]: {
            ...(prevMeta[hh] ?? {}),
            [variantKey]: {
              colorSkuOrArticle: prevMeta[hh]?.[variantKey]?.colorSkuOrArticle || "",
              sourceUrl: prevMeta[hh]?.[variantKey]?.sourceUrl || null,
              sourcePathHints: prevMeta[hh]?.[variantKey]?.sourcePathHints || [],
              reasons: prevMeta[hh]?.[variantKey]?.reasons || ["manual order control"],
              confidence: prevMeta[hh]?.[variantKey]?.confidence || "low",
              status: "edited",
              fetchedAt: prevMeta[hh]?.[variantKey]?.fetchedAt || new Date().toISOString(),
            },
          },
        }))
        return { ...prev, [hh]: { ...variants, [variantKey]: nextVariant } }
      })
      setDiag((d) => ({
        ...d,
        stateUpdateRequested: true,
        stateActuallyChanged: true,
        lastAction: action,
        lastError: "",
        source: "button",
        mediaId,
        productHandle: handle,
        targetZone: "variant_gallery",
        dragSource: "variant",
        variantKey,
      }))
    },
    [board.zones]
  )

  const dropZoneStable = (e: React.DragEvent, handle: string, zone: ZoneDrop) => {
    e.preventDefault()
    e.stopPropagation()
    setDragHoverZoneKey(null)
    setDiag((d) => ({ ...d, lastDrop: describeTargetFromElement(e.target) }))
    const payload = readLegacyDragData(e)
    if (!payload?.mediaId) {
      setDragStart("no")
      setPayloadWritten("n/a")
      setLastDropTarget(zone === "lane_reject" ? "Product Rejected" : zone === "unassigned" ? "Unassigned return strip" : zone[0].toUpperCase() + zone.slice(1))
      setLastDragAction("ignored (empty payload)")
      setDragError("empty payload")
      setDraggingMediaId(null)
      setDiag((d) => ({
        ...d,
        stateUpdateRequested: true,
        stateActuallyChanged: false,
        lastAction: "ignored (empty payload)",
        lastError: "empty payload",
        source: "drag",
        mediaId: "",
        targetZone: zone,
        productHandle: handle,
        dragSource: "unknown",
      }))
      return
    }
    const r = resolveBoardAfterDrop(board, e, handle, zone, payload)
    const changed = !boardStateEqual(board, r.next)
    setBoard(r.next)
    setVariantsByHandle((prevV) => {
      const hh = handle.toLowerCase()
      const vk = activeVariantByHandle[hh] || payload.fromVariantKey || DEFAULT_VARIANT_KEY
      const base = r.next.zones[hh] ?? emptyZones()
      return {
        ...prevV,
        [hh]: {
          ...(prevV[hh] ?? { [DEFAULT_VARIANT_KEY]: fromZoneState(board.zones[hh] ?? emptyZones(), "Default") }),
          [vk]: { ...(prevV[hh]?.[vk] ?? emptyVariant(vk === DEFAULT_VARIANT_KEY ? "Default" : vk)), ...fromZoneState(base, prevV[hh]?.[vk]?.label || "Default") },
        },
      }
    })
    setDraggingMediaId(null)
    setDragStart("no")
    setPayloadWritten("n/a")
    setLastDropTarget(zone === "lane_reject" ? "Product Rejected" : zone === "unassigned" ? "Unassigned return strip" : zone[0].toUpperCase() + zone.slice(1))
    setLastDragAction(r.action)
    setDragError(changed ? "" : "state unchanged")
    setDiag((d) => ({
      ...d,
      stateUpdateRequested: true,
      stateActuallyChanged: changed,
      lastAction: r.action,
      lastError: changed ? "" : "state unchanged",
      source: "drag",
      mediaId: payload.mediaId,
      productHandle: handle,
      targetZone: zone,
      dragSource: payload.source || payload.fromZone || "unknown",
      laneId: payload.fromZone || "—",
      variantKey: payload.fromVariantKey || "—",
      reorderFrom: payload.fromIndex != null ? String(payload.fromIndex) : "—",
      reorderTo: r.action === "gallery reordered" ? "set" : "—",
    }))
  }

  const exportJson = useCallback(() => {
    const exportedAt = new Date().toISOString()
    const base = buildExportDocument({
      exportedAt,
      products: products.map((p) => ({ handle: p.handle, sku: p.sku, collection: p.collection })),
      zonesByHandle: board.zones,
      globalRejections: board.grej,
      notes: null,
    })
    return {
      ...base,
      variant_decisions: variantsByHandle,
      active_variant_by_handle: activeVariantByHandle,
      confirmed_variant_sources: variantMetaByHandle,
    }
  }, [products, board.zones, board.grej, variantsByHandle, activeVariantByHandle, variantMetaByHandle])

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
  const suggestedVariantsForSelected = useMemo<SuggestedVariant[]>(() => {
    if (!selectedHandle) return []
    const h = selectedHandle.toLowerCase()
    const rejected = new Set(rejectedSuggestedVariantsByHandle[h] ?? [])
    const groups = new Map<
      string,
      {
        label: string
        colorSkuOrArticle: string
        sourceUrl: string | null
        sourcePathHints: Set<string>
        mediaIds: string[]
        confidence: "high" | "medium" | "low"
        reasons: Set<string>
      }
    >()
    for (const it of invDoc?.items ?? []) {
      const ce = candById.get(it.id)
      const linked =
        ce?.top_candidate?.medusa_product_handle.toLowerCase() === h ||
        (ce?.candidates ?? []).some((c) => c.medusa_product_handle.toLowerCase() === h) ||
        (it.handle_hint || "").toLowerCase() === h ||
        (it.sku_hint || "").toLowerCase() === h
      if (!linked) continue
      const token = extractColorToken(it)
      if (!token) continue
      const key = `color_${token}`
      if (rejected.has(key)) continue
      const current = groups.get(key) ?? {
        label: titleFromToken(token),
        colorSkuOrArticle: it.sku_hint || ce?.top_candidate?.medusa_variant_sku || "",
        sourceUrl: it.legacy_product_url || it.page_url || it.url || null,
        sourcePathHints: new Set<string>(),
        mediaIds: [],
        confidence: ce?.confidence === "confirmed" ? "high" : ce?.confidence === "probable" ? "medium" : "low",
        reasons: new Set<string>(),
      }
      current.mediaIds.push(it.id)
      if (it.source_path) current.sourcePathHints.add(it.source_path)
      if (it.repo_relative_path) current.sourcePathHints.add(it.repo_relative_path)
      current.reasons.add(`filename token color_${token}`)
      if (it.source_path?.toLowerCase().includes(`color_${token}`)) current.reasons.add(`source path token color_${token}`)
      if (it.sku_hint) current.reasons.add("sku hint match")
      if (ce?.top_candidate?.medusa_product_handle.toLowerCase() === h) current.reasons.add("candidate map top handle match")
      if (it.legacy_product_url || it.page_url || it.url) current.reasons.add("legacy source url/hint present")
      groups.set(key, current)
    }
    return Array.from(groups.entries())
      .map(([variantKey, v]) => ({
        variantKey,
        label: v.label,
        colorNameRaw: variantKey.replace(/^color_/, ""),
        colorSkuOrArticle: v.colorSkuOrArticle,
        sourceUrl: v.sourceUrl,
        sourcePathHints: Array.from(v.sourcePathHints).slice(0, 3),
        mediaIds: v.mediaIds,
        primaryCandidateId: v.mediaIds[0] || null,
        galleryCandidateIds: v.mediaIds.slice(1),
        confidence: v.confidence,
        reasons: Array.from(v.reasons),
      }))
      .sort((a, b) => b.mediaIds.length - a.mediaIds.length)
  }, [selectedHandle, rejectedSuggestedVariantsByHandle, invDoc, candById])

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
        data-drop-zone={zone}
        data-product-handle={hlc}
        data-zone={dataZoneAttr}
        onDragEnter={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setDragHoverZoneKey(zk)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
          e.dataTransfer.dropEffect = "move"
          setDragHoverZoneKey(zk)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragHoverZoneKey((k) => (k === zk ? null : k))
        }}
        onDrop={(e) => dropZoneStable(e, handle, zone)}
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
    const vk = activeVariantByHandle[handle.toLowerCase()] || DEFAULT_VARIANT_KEY
    const gi = zone === "gallery" ? (board.zones[handle.toLowerCase()]?.gallery.indexOf(id) ?? -1) : -1
    return (
      <MediaImageCard
        inventoryId={id}
        inv={inv}
        productHandle={handle}
        previewUrl={pv.url}
        useImg={pv.useImg}
        caption={pv.caption}
        sourcePath={inv.repo_relative_path || inv.source_path}
        sourceType={inv.source_type}
        confidenceLabel={candById.get(id)?.confidence || null}
        previewable={inv.previewable}
        badges={["Assigned"]}
        size="compact"
        draggable={inv.previewable}
        isDragging={draggingMediaId === id}
        onDragStart={
          inv.previewable
            ? (e) => {
                e.stopPropagation()
                setDiag((d) => ({ ...d, cardHandlerFired: true }))
                setDragStart("yes")
                setLastDropTarget("—")
                const ok = writeLegacyDragData(e, {
                  type: "legacy_media",
                  mediaId: id,
                  source: zone === "gallery" ? "gallery" : "assigned",
                  fromProductHandle: handle,
                  fromZone: zone,
                  fromIndex: gi >= 0 ? gi : null,
                  fromVariantKey: activeVariantByHandle[handle.toLowerCase()] || DEFAULT_VARIANT_KEY,
                })
                setPayloadWritten(ok ? "yes" : "no")
                setDraggingMediaId(id)
                if (!ok) setDragError("failed to write payload")
                else setDragError("")
              }
            : undefined
        }
        onDragEnd={() => {
          setDragStart("no")
          setPayloadWritten("n/a")
          setDraggingMediaId(null)
          setDragHoverZoneKey(null)
        }}
        onOpenDetail={() => setInspectorId(id)}
        onCardPointerDownCapture={(e) => setDiag((d) => ({ ...d, lastPointerDown: describeTargetFromElement(e.target) }))}
        onCardClickCapture={(e) => setDiag((d) => ({ ...d, lastClick: describeTargetFromElement(e.target) }))}
        filenameMaxLen={22}
      >
        <button
          type="button"
          data-action-button="return-unassigned"
          style={{ ...miniBtn, marginTop: 6, width: "100%" }}
          onClick={() => applyAssignment("button", id, "unassigned", handle)}
        >
          Return to Unassigned
        </button>
        {zone === "gallery" ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 4 }}>
            <button
              type="button"
              data-action-button="gallery-move-left"
              style={miniBtn}
              onClick={() =>
                updateVariantDecision(
                  handle,
                  vk,
                  (prev) => {
                    const idx = prev.gallery.indexOf(id)
                    if (idx <= 0) return prev
                    const next = [...prev.gallery]
                    ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
                    return { ...prev, gallery: next }
                  },
                  "gallery move left",
                  id
                )
              }
            >
              Move left
            </button>
            <button
              type="button"
              data-action-button="gallery-move-right"
              style={miniBtn}
              onClick={() =>
                updateVariantDecision(
                  handle,
                  vk,
                  (prev) => {
                    const idx = prev.gallery.indexOf(id)
                    if (idx < 0 || idx >= prev.gallery.length - 1) return prev
                    const next = [...prev.gallery]
                    ;[next[idx + 1], next[idx]] = [next[idx], next[idx + 1]]
                    return { ...prev, gallery: next }
                  },
                  "gallery move right",
                  id
                )
              }
            >
              Move right
            </button>
            <button
              type="button"
              data-action-button="gallery-set-primary"
              style={miniBtn}
              onClick={() =>
                updateVariantDecision(
                  handle,
                  vk,
                  (prev) => ({ ...prev, primary: id, gallery: prev.gallery.filter((x) => x !== id) }),
                  "set primary from gallery",
                  id
                )
              }
            >
              Set as Primary
            </button>
            <button
              type="button"
              data-action-button="gallery-remove"
              style={miniBtn}
              onClick={() =>
                updateVariantDecision(
                  handle,
                  vk,
                  (prev) => ({ ...prev, gallery: prev.gallery.filter((x) => x !== id) }),
                  "remove from gallery",
                  id
                )
              }
            >
              Remove
            </button>
          </div>
        ) : null}
      </MediaImageCard>
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
  const targetSummary = (s: TargetSnapshot | null): string =>
    !s
      ? "—"
      : `${s.tagName}${s.className ? `.${s.className}` : ""} media=${s.mediaId || "—"} product=${s.productHandle || "—"} card=${s.closestCard || "—"} draggable=${s.closestDraggable || "—"} drop=${s.closestDropZone || "—"} action=${s.actionButton || "—"}`

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
            Choose a product from the list (or switch to <strong>Focus mode</strong> after you pick one). Then drag a previewable card (or its <strong>Drag</strong> bar) from the pool, or use quick actions on each tile.
          </p>
          <p style={{ margin: "12px 0 0", fontSize: 12, color: "#b45309" }}>
            <strong>Select a product first</strong> to assign images into Primary / Gallery — or use quick actions in the pool after selecting a SKU.
          </p>
        </section>
      )
    }
    const h = selectedHandle.toLowerCase()
    const vByHandle = variantsByHandle[h] ?? { [DEFAULT_VARIANT_KEY]: fromZoneState(board.zones[h] ?? emptyZones(), "Default") }
    const vmByHandle = variantMetaByHandle[h] ?? {}
    const activeVariantKey = activeVariantByHandle[h] || Object.keys(vByHandle)[0] || DEFAULT_VARIANT_KEY
    const activeVariant = vByHandle[activeVariantKey] ?? emptyVariant(activeVariantKey === DEFAULT_VARIANT_KEY ? "Default" : activeVariantKey)
    const activeVariantMeta = vmByHandle[activeVariantKey] ?? null
    const z = toZoneState(activeVariant)
    const candCount = entryList.filter((e) => e.top_candidate?.medusa_product_handle.toLowerCase() === h).length
    const suggestions = suggestedVariantsForSelected.filter((s) => !vByHandle[s.variantKey])

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
            <h2
              style={{
                margin: "6px 0 4px",
                fontSize: 19,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                color: "#0f172a",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
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
            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>Color variants:</span>
              {Object.entries(vByHandle).map(([vk, vv]) => (
                <button
                  key={vk}
                  type="button"
                  onClick={() => setActiveVariantByHandle((prev) => ({ ...prev, [h]: vk }))}
                  style={{
                    ...miniBtn,
                    padding: "4px 10px",
                    background: vk === activeVariantKey ? "#0f172a" : "#f8fafc",
                    color: vk === activeVariantKey ? "#fff" : "#334155",
                    borderColor: vk === activeVariantKey ? "#0f172a" : "#cbd5e1",
                  }}
                >
                  {vv.label}
                </button>
              ))}
              <input
                value={newVariantLabel}
                onChange={(e) => setNewVariantLabel(e.target.value)}
                placeholder="add variant label"
                style={{ ...inputStyle, maxWidth: 180, fontSize: 12, padding: "4px 8px" }}
              />
              <button
                type="button"
                style={{ ...miniBtn, padding: "4px 10px" }}
                onClick={() => {
                  const label = newVariantLabel.trim()
                  if (!label) return
                  const key = label.toLowerCase().replace(/\s+/g, "_")
                  setVariantsByHandle((prev) => ({
                    ...prev,
                    [h]: {
                      ...(prev[h] ?? { [DEFAULT_VARIANT_KEY]: fromZoneState(board.zones[h] ?? emptyZones(), "Default") }),
                      [key]: prev[h]?.[key] ?? emptyVariant(label),
                    },
                  }))
                  setVariantMetaByHandle((prev) => ({
                    ...prev,
                    [h]: {
                      ...(prev[h] ?? {}),
                      [key]: prev[h]?.[key] ?? {
                        colorSkuOrArticle: "",
                        sourceUrl: null,
                        sourcePathHints: [],
                        reasons: ["manual add variant"],
                        confidence: "low",
                        status: "edited",
                        fetchedAt: new Date().toISOString(),
                      },
                    },
                  }))
                  setActiveVariantByHandle((prev) => ({ ...prev, [h]: key }))
                  setNewVariantLabel("")
                }}
              >
                Add variant
              </button>
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: "#475569" }}>
              Active variant: <strong>{activeVariant.label}</strong> · status:{" "}
              <strong>{activeVariantMeta?.status || (activeVariantKey === DEFAULT_VARIANT_KEY ? "confirmed" : "edited")}</strong>
            </div>
            <div style={{ marginTop: 12, border: "1px solid #cbd5e1", background: "#f8fafc", borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#475569", textTransform: "uppercase", marginBottom: 8 }}>Suggested color variants</div>
              {suggestions.length === 0 ? (
                <div style={{ fontSize: 12, color: "#64748b" }}>No legacy color suggestions found for this product.</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {suggestions.slice(0, 4).map((s) => (
                    <div key={s.variantKey} style={{ border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff", padding: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                        {s.label} <span style={{ fontSize: 11, color: "#64748b" }}>({s.confidence})</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>
                        SKU/article: <strong>{s.colorSkuOrArticle || "—"}</strong> · source: <span title={s.sourceUrl || s.sourcePathHints[0] || ""}>{s.sourceUrl || s.sourcePathHints[0] || "legacy source unavailable"}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>Reasons: {s.reasons.join(", ")}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                        <button
                          type="button"
                          style={miniBtn}
                          onClick={() => {
                            setVariantsByHandle((prev) => ({
                              ...prev,
                              [h]: {
                                ...(prev[h] ?? {}),
                                [s.variantKey]: prev[h]?.[s.variantKey] ?? {
                                  label: s.label,
                                  primary: null,
                                  gallery: [],
                                  reference: [],
                                  rejected: [],
                                },
                              },
                            }))
                            setVariantMetaByHandle((prev) => ({
                              ...prev,
                              [h]: {
                                ...(prev[h] ?? {}),
                                [s.variantKey]: {
                                  colorSkuOrArticle: s.colorSkuOrArticle,
                                  sourceUrl: s.sourceUrl,
                                  sourcePathHints: s.sourcePathHints,
                                  reasons: s.reasons,
                                  confidence: s.confidence,
                                  status: "confirmed",
                                  fetchedAt: new Date().toISOString(),
                                },
                              },
                            }))
                            setActiveVariantByHandle((prev) => ({ ...prev, [h]: s.variantKey }))
                          }}
                        >
                          Confirm variant
                        </button>
                        <button
                          type="button"
                          style={miniBtn}
                          disabled={!(s.primaryCandidateId || s.mediaIds[0])}
                          onClick={() => {
                            const pid = s.primaryCandidateId || s.mediaIds[0]
                            if (!pid) return
                            applyAssignment("button", pid, "primary", selectedHandle, s.variantKey)
                          }}
                        >
                          Confirm primary
                        </button>
                        <button
                          type="button"
                          style={miniBtn}
                          onClick={() => {
                            setVariantsByHandle((prev) => {
                              const variants = prev[h] ?? {}
                              const base = variants[s.variantKey] ?? emptyVariant(s.label)
                              return { ...prev, [h]: { ...variants, [s.variantKey]: { ...base, gallery: [...s.galleryCandidateIds] } } }
                            })
                            setBoard((prev) => ({
                              ...prev,
                              zones: {
                                ...prev.zones,
                                [h]: { ...(prev.zones[h] ?? emptyZones()), gallery: [...s.galleryCandidateIds] },
                              },
                            }))
                            setActiveVariantByHandle((prev) => ({ ...prev, [h]: s.variantKey }))
                          }}
                        >
                          Confirm gallery
                        </button>
                        <button
                          type="button"
                          style={miniBtn}
                          onClick={() => {
                            setVariantsByHandle((prev) => {
                              const variants = prev[h] ?? {}
                              return {
                                ...prev,
                                [h]: {
                                  ...variants,
                                  [s.variantKey]: {
                                    label: s.label,
                                    primary: s.primaryCandidateId || null,
                                    gallery: [...s.galleryCandidateIds],
                                    reference: [],
                                    rejected: [],
                                  },
                                },
                              }
                            })
                            setBoard((prev) => ({
                              ...prev,
                              zones: {
                                ...prev.zones,
                                [h]: {
                                  ...(prev.zones[h] ?? emptyZones()),
                                  primary: s.primaryCandidateId || null,
                                  gallery: [...s.galleryCandidateIds],
                                  reference_only: [],
                                  lane_rejected: [],
                                },
                              },
                            }))
                            setVariantMetaByHandle((prev) => ({
                              ...prev,
                              [h]: {
                                ...(prev[h] ?? {}),
                                [s.variantKey]: {
                                  colorSkuOrArticle: s.colorSkuOrArticle,
                                  sourceUrl: s.sourceUrl,
                                  sourcePathHints: s.sourcePathHints,
                                  reasons: s.reasons,
                                  confidence: s.confidence,
                                  status: "confirmed",
                                  fetchedAt: new Date().toISOString(),
                                },
                              },
                            }))
                            setActiveVariantByHandle((prev) => ({ ...prev, [h]: s.variantKey }))
                            setDiag((d) => ({ ...d, stateUpdateRequested: true, stateActuallyChanged: true, lastAction: "confirm all for variant", lastError: "" }))
                          }}
                        >
                          Confirm all for this variant
                        </button>
                        <button
                          type="button"
                          style={miniBtn}
                          onClick={() =>
                            setRejectedSuggestedVariantsByHandle((prev) => ({
                              ...prev,
                              [h]: Array.from(new Set([...(prev[h] ?? []), s.variantKey])),
                            }))
                          }
                        >
                          Reject suggestion
                        </button>
                        <button
                          type="button"
                          style={miniBtn}
                          onClick={() => {
                            const next = window.prompt("Edit variant label", s.label)
                            if (!next?.trim()) return
                            setVariantsByHandle((prev) => ({
                              ...prev,
                              [h]: {
                                ...(prev[h] ?? {}),
                                [s.variantKey]: { ...(prev[h]?.[s.variantKey] ?? emptyVariant(next.trim())), label: next.trim() },
                              },
                            }))
                          }}
                        >
                          Edit label
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <p style={{ margin: "14px 0 0", fontSize: 13, color: "#64748b", maxWidth: fullWidth ? 720 : 560, lineHeight: 1.55 }}>
              Assignment target: <strong>{activeVariant.label}</strong>. Use drag or explicit buttons; drop assigned tiles on the strip under thumbnails to return them to the pool.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 104px)", gap: 8, flexShrink: 0 }}>
            {selectedProduct.image_urls.slice(0, 4).map((u) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={u} src={u} alt="" width={104} height={104} draggable={false} style={{ width: 104, height: 104, borderRadius: 10, objectFit: "cover", border: "1px solid #e2e8f0" }} />
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
          data-drop-zone="unassigned"
          data-product-handle={h}
          onDragEnter={(e) => {
            e.preventDefault()
            setDragHoverZoneKey(`return|${h}`)
          }}
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = "move"
            setDragHoverZoneKey(`return|${h}`)
          }}
          onDragLeave={(e) => {
            const zk = `return|${h}`
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragHoverZoneKey((k) => (k === zk ? null : k))
          }}
          onDrop={(e) => dropZoneStable(e, selectedHandle, "unassigned")}
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
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", width: "100%" }}>
                <button type="button" style={{ ...miniBtn, opacity: 0.8 }} disabled>
                  Move left
                </button>
                <button type="button" style={{ ...miniBtn, opacity: 0.8 }} disabled>
                  Move right
                </button>
                <button type="button" style={{ ...miniBtn, opacity: 0.8 }} disabled>
                  Set as Primary
                </button>
                <button type="button" style={{ ...miniBtn, opacity: 0.8 }} disabled>
                  Remove
                </button>
              </div>
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
        <div
          style={{
            margin: "8px 20px 0",
            padding: "10px 12px",
            borderRadius: 10,
            border: "2px solid #7c2d12",
            background: "#ffedd5",
            color: "#7c2d12",
            fontSize: 14,
            fontWeight: 800,
            letterSpacing: "0.01em",
          }}
        >
          {DEV_SENTINEL} · {DEV_SENTINEL_BUILD}
        </div>
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: focusMode ? "minmax(520px,1fr) minmax(500px,520px)" : "280px minmax(520px,1fr) minmax(500px,520px)",
          alignItems: "stretch",
          minHeight: `calc(100vh - ${headerH}px)`,
        }}
      >
        <aside
          style={{
            width: "100%",
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

        <main style={{ minWidth: 0, padding: 16, overflowY: "auto" }}>
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
                            <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0, flex: 1 }}>
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
                                <div style={{ fontWeight: 800, fontSize: 15, color: "#0f172a", lineHeight: 1.25 }}>{p.handle}</div>
                                {p.title ? (
                                  <div style={{ fontSize: 12, color: "#334155", marginTop: 4, fontWeight: 600, lineHeight: 1.3, maxHeight: 34, overflow: "hidden" }}>
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
            width: "100%",
            borderLeft: "1px solid #e2e8f0",
            background: "#fff",
            display: "flex",
            flexDirection: "column",
            maxHeight: `calc(100vh - ${headerH}px)`,
            position: "sticky",
            top: headerH,
            alignSelf: "flex-start",
          }}
        >
          <div style={{ width: "100%", display: "flex", flexDirection: "column", minWidth: 0 }}>
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
                  Drag any previewable tile card (or its <strong>⋮⋮ Drag</strong> bar). Quick actions apply to{" "}
                  <strong>{selectedHandle}</strong> — use buttons if dragging is inconvenient.
                  {focusMode ? (
                    <>
                      {" "}
                      <em>Focus mode</em> limits the pool to media whose matcher candidates include this handle.
                    </>
                  ) : null}
                </p>
              )}
              <div style={{ marginTop: 10, borderTop: "1px dashed #cbd5e1", paddingTop: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase", marginBottom: 6 }}>Manual assignment panel</div>
                <div style={{ fontSize: 11, color: selectedHandle ? "#334155" : "#b45309", marginBottom: 6 }}>
                  Active product: <strong>{selectedHandle || "Select product first"}</strong>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 6 }}>
                  <input
                    value={manualMediaId}
                    onChange={(e) => setManualMediaId(e.target.value)}
                    placeholder="media id"
                    style={{ ...inputStyle, fontSize: 12, padding: "6px 8px" }}
                  />
                  <select value={manualZone} onChange={(e) => setManualZone(e.target.value as ZoneDrop)} style={{ ...inputStyle, fontSize: 12, padding: "6px 8px" }}>
                    <option value="primary">primary</option>
                    <option value="gallery">gallery</option>
                    <option value="reference">reference</option>
                    <option value="lane_reject">rejected</option>
                    <option value="unassigned">unassigned</option>
                  </select>
                  <select
                    value={selectedHandle ? activeVariantByHandle[selectedHandle.toLowerCase()] || DEFAULT_VARIANT_KEY : DEFAULT_VARIANT_KEY}
                    onChange={(e) => {
                      const sk = selectedHandle?.toLowerCase()
                      if (!sk) return
                      const vk = e.target.value
                      setActiveVariantByHandle((prev) => ({ ...prev, [sk]: vk }))
                    }}
                    style={{ ...inputStyle, fontSize: 12, padding: "6px 8px" }}
                  >
                    {selectedHandle
                      ? Object.entries(variantsByHandle[selectedHandle.toLowerCase()] ?? { [DEFAULT_VARIANT_KEY]: emptyVariant("Default") }).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v.label}
                          </option>
                        ))
                      : (
                        <option value={DEFAULT_VARIANT_KEY}>Default</option>
                      )}
                  </select>
                  <button
                    type="button"
                    data-action-button="manual-apply"
                    style={miniBtn}
                    disabled={!manualMediaId.trim() || (!selectedHandle && manualZone !== "unassigned")}
                    onClick={() =>
                      applyAssignment(
                        "manual",
                        manualMediaId.trim(),
                        manualZone,
                        selectedHandle,
                        selectedHandle ? activeVariantByHandle[selectedHandle.toLowerCase()] || DEFAULT_VARIANT_KEY : DEFAULT_VARIANT_KEY
                      )
                    }
                  >
                    Apply
                  </button>
                </div>
              </div>
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
                            productHandle={selectedHandle}
                            previewUrl={pv.url}
                            useImg={pv.useImg}
                            caption={pv.caption}
                            sourcePath={inv.repo_relative_path || inv.source_path}
                            sourceType={inv.source_type}
                            confidenceLabel={ce?.confidence || null}
                            previewable={inv.previewable}
                            badges={poolBadges.slice(0, 3)}
                            size={focusMode && selectedHandle ? "xlarge" : "large"}
                            draggable={inv.previewable}
                            isDragging={draggingMediaId === id}
                            onDragStart={
                              inv.previewable
                                ? (e) => {
                                    e.stopPropagation()
                                    setDiag((d) => ({ ...d, cardHandlerFired: true }))
                                    setDragStart("yes")
                                    setLastDropTarget("—")
                                    const ok = writeLegacyDragData(e, {
                                      type: "legacy_media",
                                      mediaId: id,
                                      source: "pool",
                                      fromProductHandle: null,
                                      fromZone: "pool",
                                      fromIndex: null,
                                    })
                                    setPayloadWritten(ok ? "yes" : "no")
                                    setDraggingMediaId(id)
                                    if (!ok) setDragError("failed to write payload")
                                    else setDragError("")
                                  }
                                : undefined
                            }
                            onDragEnd={() => {
                              setDragStart("no")
                              setPayloadWritten("n/a")
                              setDraggingMediaId(null)
                              setDragHoverZoneKey(null)
                            }}
                            onOpenDetail={() => setInspectorId(id)}
                            onCardPointerDownCapture={(e) => setDiag((d) => ({ ...d, lastPointerDown: describeTargetFromElement(e.target) }))}
                            onCardClickCapture={(e) => setDiag((d) => ({ ...d, lastClick: describeTargetFromElement(e.target) }))}
                            filenameMaxLen={focusMode && selectedHandle ? 20 : 26}
                            detailTitle={inv.source_path || inv.repo_relative_path || inv.filename}
                          />
                          {elsewhere ? (
                            <div style={{ fontSize: 11, color: "#b45309", lineHeight: 1.35 }}>This image is already assigned to {elsewhere}.</div>
                          ) : null}
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <button
                              type="button"
                              data-action-button="primary"
                              data-media-id={id}
                              draggable={false}
                              style={miniBtn}
                              disabled={!selectedHandle}
                              title={!selectedHandle ? "Select a product first" : undefined}
                              onMouseDown={(e) => e.stopPropagation()}
                              onDragStart={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                              }}
                              onClick={() => applyAssignment("button", id, "primary")}
                            >
                              Primary
                            </button>
                            <button
                              type="button"
                              data-action-button="gallery"
                              data-media-id={id}
                              draggable={false}
                              style={miniBtn}
                              disabled={!selectedHandle}
                              title={!selectedHandle ? "Select a product first" : undefined}
                              onMouseDown={(e) => e.stopPropagation()}
                              onDragStart={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                              }}
                              onClick={() => applyAssignment("button", id, "gallery")}
                            >
                              Gallery
                            </button>
                            <button
                              type="button"
                              data-action-button="reference"
                              data-media-id={id}
                              draggable={false}
                              style={miniBtn}
                              disabled={!selectedHandle}
                              title={!selectedHandle ? "Select a product first" : undefined}
                              onMouseDown={(e) => e.stopPropagation()}
                              onDragStart={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                              }}
                              onClick={() => applyAssignment("button", id, "reference")}
                            >
                              Ref
                            </button>
                            <button
                              type="button"
                              data-action-button="reject"
                              data-media-id={id}
                              draggable={false}
                              style={miniBtn}
                              disabled={!selectedHandle}
                              title={!selectedHandle ? "Select a product first" : undefined}
                              onMouseDown={(e) => e.stopPropagation()}
                              onDragStart={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                              }}
                              onClick={() => applyAssignment("button", id, "lane_reject")}
                            >
                              Reject
                            </button>
                            <button
                              type="button"
                              data-action-button="global-reject"
                              data-media-id={id}
                              draggable={false}
                              style={{ ...miniBtn, color: "#b91c1c", borderColor: "#fecaca" }}
                              onMouseDown={(e) => e.stopPropagation()}
                              onDragStart={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                              }}
                              onClick={() => {
                                setDiag((d) => ({ ...d, buttonHandlerFired: true }))
                                markGlobalReject(id)
                              }}
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
            <details open={diagExpanded} onToggle={(e) => setDiagExpanded((e.currentTarget as HTMLDetailsElement).open)} style={{ borderTop: "1px solid #e2e8f0", background: "#fafafa" }}>
              <summary style={{ cursor: "pointer", padding: "10px 12px", fontSize: 11, fontWeight: 800, color: "#334155" }}>Diagnostics (dev)</summary>
              <div
                style={{
                  fontSize: 10,
                  padding: "0 12px 10px",
                  color: "#475569",
                  display: "grid",
                  gap: 4,
                  lineHeight: 1.35,
                }}
                aria-live="polite"
              >
              <div>Last pointerdown: <span style={{ color: "#0f172a" }}>{targetSummary(diag.lastPointerDown)}</span></div>
              <div>Last click: <span style={{ color: "#0f172a" }}>{targetSummary(diag.lastClick)}</span></div>
              <div>Last dragstart: <span style={{ color: "#0f172a" }}>{targetSummary(diag.lastDragStart)}</span></div>
              <div>Last dragover: <span style={{ color: "#0f172a" }}>{targetSummary(diag.lastDragOver)}</span></div>
              <div>Last drop target: <span style={{ color: "#0f172a" }}>{targetSummary(diag.lastDrop)}</span></div>
              <div>Card handler fired: <strong>{diag.cardHandlerFired ? "yes" : "no"}</strong></div>
              <div>Button handler fired: <strong>{diag.buttonHandlerFired ? "yes" : "no"}</strong></div>
              <div>State update requested: <strong>{diag.stateUpdateRequested ? "yes" : "no"}</strong></div>
              <div>State changed: <strong style={{ color: diag.stateActuallyChanged ? "#15803d" : "#64748b" }}>{diag.stateActuallyChanged ? "yes" : "no"}</strong></div>
              <div>Source/media/product/zone: <span style={{ color: "#0f172a" }}>{`${diag.source} / ${diag.mediaId || "—"} / ${diag.productHandle || "—"} / ${diag.targetZone || "—"}`}</span></div>
              <div>Last drag source/lane/variant: <span style={{ color: "#0f172a" }}>{`${diag.dragSource} / ${diag.laneId} / ${diag.variantKey}`}</span></div>
              <div>Last reorder: <span style={{ color: "#0f172a" }}>{`${diag.reorderFrom} -> ${diag.reorderTo}`}</span></div>
              <div>Payload written: <strong style={{ color: payloadWritten === "yes" ? "#15803d" : payloadWritten === "no" ? "#b91c1c" : "#64748b" }}>{payloadWritten}</strong></div>
              <div>Last action: <span style={{ color: "#0f172a", fontWeight: 600 }}>{lastDragAction || diag.lastAction}</span></div>
              <div>Last error: <span style={{ color: dragError || diag.lastError ? "#b91c1c" : "#64748b" }}>{dragError || diag.lastError || "—"}</span></div>
              </div>
            </details>
          </div>

          {inspectorId && inspectorInv ? (
            <div
              style={{
                borderTop: "1px solid #e2e8f0",
                background: "#f8fafc",
                padding: 14,
                overflowY: "auto",
                maxHeight: 360,
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
                  <button type="button" data-action-button="inspector-primary" style={miniBtn} onClick={() => applyAssignment("button", inspectorId, "primary")}>
                    Primary
                  </button>
                  <button type="button" data-action-button="inspector-gallery" style={miniBtn} onClick={() => applyAssignment("button", inspectorId, "gallery")}>
                    Gallery
                  </button>
                  <button type="button" data-action-button="inspector-reference" style={miniBtn} onClick={() => applyAssignment("button", inspectorId, "reference")}>
                    Ref
                  </button>
                  <button type="button" data-action-button="inspector-reject" style={miniBtn} onClick={() => applyAssignment("button", inspectorId, "lane_reject")}>
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
