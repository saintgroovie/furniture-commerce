"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  buildExportDocument,
  collectAllAssignedIds,
  defaultVariantMeta,
  emptyZones,
  migrateLegacyVariantMetaRow,
  migrateV1ToV2,
  parsePersisted,
  removeIdFromAllZones,
  serializeAllVariantMetaExport,
  variantMetaFromEnrichmentAndSuggestion,
  type GlobalRejection,
  type PersistedV1,
  type PersistedV2,
  type ProductZoneState,
} from "./legacy-media-board-export"
import type {
  CandidateEntry,
  InvItem,
  LegacyColorEnrichmentResult,
  LegacyMediaDragPayload,
  LegacyMediaDragZone,
  ProductRow,
  SuggestedVariant,
  VariantMetaByHandle,
  VariantMetaState,
} from "./legacy-media-board-types"
import { pickHtmlCandidateUrls } from "@/lib/qa/legacy-color-article-enrichment"
import { MediaImageCard } from "./MediaImageCard"

const LS_KEY = "furniture-legacy-media-assignment-decisions-v1"
const LS_VARIANTS_KEY = "furniture-legacy-media-assignment-variants-v1"
const POOL_LIMIT = 120
const UNKNOWN_COLLECTION = "__unknown__"
const DEFAULT_VARIANT_KEY = "__default__"
const API_BASE = "/qa/legacy-media-assignment-board/api"
const PREVIEW_ROUTE = "/qa/legacy-media-assignment-board/preview"
const DND_JSON = "application/json"
const DEV_SENTINEL = "Legacy Board UI color article enrichment + product SKU hint split"
const DEV_SENTINEL_BUILD = "2026-05-10T18:00Z"

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
type ActionSource = "button" | "assigned-button" | "manual" | "drag"

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
  /** Zone the media moved from (assigned lane id or pool). */
  fromZone: string
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
type VariantsByHandle = Record<string, Record<string, VariantDecisionState>>

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

function variantDecisionEqual(a: VariantDecisionState, b: VariantDecisionState): boolean {
  if (a.label !== b.label || a.primary !== b.primary) return false
  if (a.gallery.length !== b.gallery.length || a.reference.length !== b.reference.length || a.rejected.length !== b.rejected.length) return false
  for (let i = 0; i < a.gallery.length; i++) if (a.gallery[i] !== b.gallery[i]) return false
  for (let i = 0; i < a.reference.length; i++) if (a.reference[i] !== b.reference[i]) return false
  for (let i = 0; i < a.rejected.length; i++) if (a.rejected[i] !== b.rejected[i]) return false
  return true
}

function stripMediaIdFromVariantSlots(vv: VariantDecisionState, inventoryId: string): VariantDecisionState {
  return {
    ...vv,
    primary: vv.primary === inventoryId ? null : vv.primary,
    gallery: vv.gallery.filter((x) => x !== inventoryId),
    reference: vv.reference.filter((x) => x !== inventoryId),
    rejected: vv.rejected.filter((x) => x !== inventoryId),
  }
}

function findVariantKeyOwningMedia(variants: Record<string, VariantDecisionState>, mediaId: string): string | null {
  for (const [vk, vv] of Object.entries(variants)) {
    if (vv.primary === mediaId || vv.gallery.includes(mediaId) || vv.reference.includes(mediaId) || vv.rejected.includes(mediaId)) return vk
  }
  return null
}

function mergeVariantMeta(
  prev: VariantMetaState | undefined,
  productSkuHint: string,
  patch: Partial<VariantMetaState>
): VariantMetaState {
  const base = prev ?? defaultVariantMeta(productSkuHint)
  return { ...base, ...patch, fetchedAt: patch.fetchedAt ?? new Date().toISOString() }
}

function truncateMiddleClient(s: string, max: number): string {
  if (!s || s.length <= max) return s
  const half = Math.floor((max - 1) / 2)
  return `${s.slice(0, half)}…${s.slice(s.length - half)}`
}

function suggestionEnrichmentKey(handle: string, variantKey: string): string {
  return `${handle.toLowerCase()}::${variantKey}`
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
  const boardRef = useRef(board)
  boardRef.current = board
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
  type EnrichmentCacheEntry = { loading: boolean; data: LegacyColorEnrichmentResult | null; error: string | null }
  const [enrichmentByKey, setEnrichmentByKey] = useState<Record<string, EnrichmentCacheEntry>>({})
  type SuggestionPref = { useLegacyName: boolean; useLegacyArticle: boolean; editedLegacyArticle: string | null }
  const [suggestionRowPrefs, setSuggestionRowPrefs] = useState<Record<string, SuggestionPref>>({})
  const enrichInflight = useRef(new Set<string>())
  const enrichLoadedRef = useRef(new Set<string>())
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
    fromZone: "—",
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
        if (parsed.variantMetaByHandle && typeof parsed.variantMetaByHandle === "object") {
          const raw = parsed.variantMetaByHandle as Record<string, Record<string, unknown>>
          const skuFor = (handle: string) =>
            products.find((p) => p.handle.toLowerCase() === handle.toLowerCase())?.sku?.trim() || ""
          const migrated: VariantMetaByHandle = {}
          for (const [ph, row] of Object.entries(raw)) {
            migrated[ph] = {}
            const sku = skuFor(ph)
            for (const [vk, cell] of Object.entries(row)) {
              migrated[ph][vk] = migrateLegacyVariantMetaRow(cell, sku)
            }
          }
          setVariantMetaByHandle(migrated)
        }
        if (parsed.activeVariantByHandle && typeof parsed.activeVariantByHandle === "object") setActiveVariantByHandle(parsed.activeVariantByHandle)
        if (parsed.rejectedSuggestedVariantsByHandle && typeof parsed.rejectedSuggestedVariantsByHandle === "object") {
          setRejectedSuggestedVariantsByHandle(parsed.rejectedSuggestedVariantsByHandle)
        }
        const spr = (parsed as { suggestionRowPrefs?: Record<string, SuggestionPref> }).suggestionRowPrefs
        if (spr && typeof spr === "object") setSuggestionRowPrefs(spr)
      }
    } catch {
      /* ignore */
    } finally {
      setHydrated(true)
    }
  }, [invDoc, products])

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return
    try {
      localStorage.setItem(
        LS_VARIANTS_KEY,
        JSON.stringify({
          variantsByHandle,
          variantMetaByHandle,
          activeVariantByHandle,
          rejectedSuggestedVariantsByHandle,
          suggestionRowPrefs,
        })
      )
    } catch {
      /* ignore */
    }
  }, [hydrated, variantsByHandle, variantMetaByHandle, activeVariantByHandle, rejectedSuggestedVariantsByHandle, suggestionRowPrefs])

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
    setEnrichmentByKey({})
    setSuggestionRowPrefs({})
    enrichLoadedRef.current.clear()
    enrichInflight.current.clear()
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
      fromZone: "pool",
      targetZone: "global_reject",
    }))
  }

  const applyAssignment = useCallback(
    (
      source: ActionSource,
      inventoryId: string,
      zone: ZoneDrop,
      explicitHandle?: string | null,
      explicitVariantKey?: string | null,
      diagFromZone?: string | null
    ) => {
      const activeHandle = (explicitHandle || selectedHandle || "").trim()
      const hh = activeHandle.toLowerCase()
      const chosenVariantKey = (explicitVariantKey || activeVariantByHandle[hh] || DEFAULT_VARIANT_KEY).trim() || DEFAULT_VARIANT_KEY
      if (!activeHandle && zone !== "unassigned") {
        const msg = "Select product first"
        setDragError(msg)
        setLastDragAction("blocked")
        setDiag((d) => ({
          ...d,
          buttonHandlerFired: source === "button" || source === "assigned-button" ? true : d.buttonHandlerFired,
          stateUpdateRequested: true,
          stateActuallyChanged: false,
          lastAction: "blocked",
          lastError: msg,
          source,
          mediaId: inventoryId,
          productHandle: "",
          fromZone: diagFromZone ?? "pool",
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
              out[ph][vk] = stripMediaIdFromVariantSlots(vv, inventoryId)
            }
          }
          return out
        }
        const prevH = prevV[hh] ?? {}
        const hVariants: Record<string, VariantDecisionState> = {}
        for (const [vk, vv] of Object.entries(prevH)) {
          hVariants[vk] = stripMediaIdFromVariantSlots(vv, inventoryId)
        }
        const labelForChosen =
          prevH[chosenVariantKey]?.label ?? (chosenVariantKey === DEFAULT_VARIANT_KEY ? "Default" : titleFromToken(chosenVariantKey.replace(/^color_/, "")))
        hVariants[chosenVariantKey] = fromZoneState(next.zones[hh] ?? emptyZones(), labelForChosen)
        return { ...prevV, [hh]: hVariants }
      })
      if (zone !== "unassigned") {
        const phSku = productByHandle.get(hh)?.sku?.trim() || ""
        setVariantMetaByHandle((prevMeta) => ({
          ...prevMeta,
          [hh]: {
            ...(prevMeta[hh] ?? {}),
            [chosenVariantKey]: mergeVariantMeta(prevMeta[hh]?.[chosenVariantKey], phSku, {
              reasons: prevMeta[hh]?.[chosenVariantKey]?.reasons?.length ? prevMeta[hh]![chosenVariantKey]!.reasons : ["manual assignment"],
              status: "edited",
            }),
          },
        }))
      }
      setLastDragAction(`${source} → ${zone}`)
      setDragError(changed ? "" : "state unchanged")
      setDiag((d) => ({
        ...d,
        buttonHandlerFired: source === "button" || source === "assigned-button" ? true : d.buttonHandlerFired,
        stateUpdateRequested: true,
        stateActuallyChanged: changed,
        lastAction: `${source} -> ${zone}`,
        lastError: changed ? "" : "state unchanged",
        source,
        mediaId: inventoryId,
        productHandle: activeHandle,
        fromZone: diagFromZone ?? (source === "button" ? "pool" : source === "assigned-button" ? "assigned_lane" : d.fromZone),
        targetZone: zone,
        dragSource: source,
        variantKey: chosenVariantKey,
      }))
      return changed
    },
    [board, selectedHandle, activeVariantByHandle, productByHandle]
  )

  const updateVariantDecision = useCallback(
    (
      handle: string,
      variantKey: string,
      updater: (prev: VariantDecisionState) => VariantDecisionState,
      action: string,
      mediaId: string,
      diagCtx?: { fromZone?: string; targetZone?: string }
    ) => {
      const hh = handle.toLowerCase()
      let noop = false
      setVariantsByHandle((prev) => {
        const variants =
          prev[hh] ?? { [DEFAULT_VARIANT_KEY]: fromZoneState(boardRef.current.zones[hh] ?? emptyZones(), "Default") }
        const prevVariant = variants[variantKey] ?? emptyVariant(variantKey === DEFAULT_VARIANT_KEY ? "Default" : variantKey)
        const nextVariant = updater(prevVariant)
        if (variantDecisionEqual(prevVariant, nextVariant)) {
          noop = true
          return prev
        }
        setBoard((boardPrev) => ({
          ...boardPrev,
          zones: {
            ...boardPrev.zones,
            [hh]: toZoneState(nextVariant),
          },
        }))
        const phSku = productByHandle.get(hh)?.sku?.trim() || ""
        setVariantMetaByHandle((prevMeta) => ({
          ...prevMeta,
          [hh]: {
            ...(prevMeta[hh] ?? {}),
            [variantKey]: mergeVariantMeta(prevMeta[hh]?.[variantKey], phSku, {
              reasons: prevMeta[hh]?.[variantKey]?.reasons?.length ? prevMeta[hh]![variantKey]!.reasons : ["manual order control"],
              status: "edited",
            }),
          },
        }))
        return { ...prev, [hh]: { ...variants, [variantKey]: nextVariant } }
      })
      setDiag((d) => ({
        ...d,
        buttonHandlerFired: true,
        stateUpdateRequested: true,
        stateActuallyChanged: !noop,
        lastAction: action,
        lastError: noop ? "no state change" : "",
        source: "assigned-button",
        mediaId,
        productHandle: handle,
        fromZone: diagCtx?.fromZone ?? "variant_lane",
        targetZone: diagCtx?.targetZone ?? "variant_workspace",
        dragSource: "variant",
        variantKey,
      }))
    },
    [productByHandle]
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
        fromZone: "—",
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
      fromZone: payload.fromZone != null ? String(payload.fromZone) : "—",
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
      confirmed_variant_sources: serializeAllVariantMetaExport(variantMetaByHandle),
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
    const productSkuHint = (productByHandle.get(h)?.sku || "").trim()
    const seedImageUrls = [...(productByHandle.get(h)?.image_urls ?? [])]
    const rejected = new Set(rejectedSuggestedVariantsByHandle[h] ?? [])
    const groups = new Map<
      string,
      {
        label: string
        sourceUrl: string | null
        sourcePathHints: Set<string>
        mediaIds: string[]
        pageUrlCandidates: Set<string>
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
        sourceUrl: it.legacy_product_url || it.page_url || it.url || null,
        sourcePathHints: new Set<string>(),
        mediaIds: [],
        pageUrlCandidates: new Set<string>(),
        confidence: ce?.confidence === "confirmed" ? "high" : ce?.confidence === "probable" ? "medium" : "low",
        reasons: new Set<string>(),
      }
      current.mediaIds.push(it.id)
      if (it.source_path) current.sourcePathHints.add(it.source_path)
      if (it.repo_relative_path) current.sourcePathHints.add(it.repo_relative_path)
      for (const u of [it.legacy_product_url, it.page_url, it.url]) {
        if (u && String(u).trim()) current.pageUrlCandidates.add(String(u).trim())
      }
      current.reasons.add(`filename token color_${token}`)
      if (it.source_path?.toLowerCase().includes(`color_${token}`)) current.reasons.add(`source path token color_${token}`)
      if (it.sku_hint) current.reasons.add("sku hint match (inventory row)")
      if (ce?.top_candidate?.medusa_product_handle.toLowerCase() === h) current.reasons.add("candidate map top handle match")
      if (it.legacy_product_url || it.page_url || it.url) current.reasons.add("legacy source url/hint present")
      groups.set(key, current)
    }
    return Array.from(groups.entries())
      .map(([variantKey, v]) => ({
        variantKey,
        label: v.label,
        colorNameRaw: variantKey.replace(/^color_/, ""),
        productSkuHint,
        candidatePageUrls: pickHtmlCandidateUrls(Array.from(v.pageUrlCandidates)),
        seedImageUrls,
        sourceUrl: v.sourceUrl,
        sourcePathHints: Array.from(v.sourcePathHints).slice(0, 3),
        mediaIds: v.mediaIds,
        primaryCandidateId: v.mediaIds[0] || null,
        galleryCandidateIds: v.mediaIds.slice(1),
        confidence: v.confidence,
        reasons: Array.from(v.reasons),
      }))
      .sort((a, b) => b.mediaIds.length - a.mediaIds.length)
  }, [selectedHandle, rejectedSuggestedVariantsByHandle, invDoc, candById, productByHandle])

  useEffect(() => {
    enrichLoadedRef.current.clear()
    enrichInflight.current.clear()
  }, [selectedHandle])

  useEffect(() => {
    if (!selectedHandle || !selectedProduct?.sku) return
    let cancelled = false
    const h = selectedHandle.toLowerCase()
    const sku = selectedProduct.sku.trim()
    for (const s of suggestedVariantsForSelected) {
      const sk = suggestionEnrichmentKey(h, s.variantKey)
      if (enrichInflight.current.has(sk) || enrichLoadedRef.current.has(sk)) continue
      enrichInflight.current.add(sk)
      setEnrichmentByKey((prev) => ({ ...prev, [sk]: { loading: true, data: prev[sk]?.data ?? null, error: null } }))
      void fetch(`${API_BASE}/enrich-color-article`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_sku_hint: sku,
          color_token: s.colorNameRaw,
          candidate_urls: Array.from(new Set([...s.candidatePageUrls, ...s.seedImageUrls])),
        }),
      })
        .then(async (res) => {
          const j = (await res.json()) as LegacyColorEnrichmentResult & { error?: string }
          if (cancelled) return
          if (!res.ok) {
            setEnrichmentByKey((prev) => ({
              ...prev,
              [sk]: { loading: false, data: null, error: typeof j.error === "string" ? j.error : `http_${res.status}` },
            }))
            return
          }
          enrichLoadedRef.current.add(sk)
          setEnrichmentByKey((prev) => ({ ...prev, [sk]: { loading: false, data: j, error: null } }))
        })
        .catch((e) => {
          enrichInflight.current.delete(sk)
          if (cancelled) return
          setEnrichmentByKey((prev) => ({
            ...prev,
            [sk]: { loading: false, data: null, error: e instanceof Error ? e.message : String(e) },
          }))
        })
        .finally(() => {
          enrichInflight.current.delete(sk)
        })
    }
    return () => {
      cancelled = true
    }
  }, [selectedHandle, selectedProduct?.sku, suggestedVariantsForSelected])

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

  const renderZoneThumb = (
    id: string,
    handle: string,
    zone: LegacyMediaDragZone,
    variantKeyForActions: string,
    variantsForHandle: Record<string, VariantDecisionState>,
    size: "compact" | "normal" | "large" = "compact"
  ) => {
    const inv = invById.get(id)
    if (!inv) return null
    const pv = clientPreviewUrl(inv)
    const vk = variantKeyForActions
    const vv = variantsForHandle[vk]
    const gi = zone === "gallery" ? (vv?.gallery.indexOf(id) ?? -1) : -1
    const ownerVk = findVariantKeyOwningMedia(variantsForHandle, id)
    const crossVariant = ownerVk !== null && ownerVk !== vk
    const shieldBtn = {
      draggable: false as const,
      onMouseDown: (e: React.MouseEvent) => {
        e.stopPropagation()
      },
      onDragStart: (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
      },
    }
    const stopCardClick = (fn: () => void) => (e: React.MouseEvent) => {
      e.stopPropagation()
      fn()
    }
    const zoneActions = (
      <>
        {zone === "primary" ? (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 4, marginTop: 4 }}>
            <button
              type="button"
              data-action-button="primary-to-gallery"
              style={miniBtn}
              title="Move to Gallery"
              {...shieldBtn}
              onClick={stopCardClick(() => applyAssignment("assigned-button", id, "gallery", handle, vk, "primary"))}
            >
              Move to Gallery
            </button>
            <button
              type="button"
              data-action-button="primary-to-reference"
              style={miniBtn}
              title="Move to Reference"
              {...shieldBtn}
              onClick={stopCardClick(() => applyAssignment("assigned-button", id, "reference", handle, vk, "primary"))}
            >
              Move to Reference
            </button>
            <button
              type="button"
              data-action-button="primary-reject"
              style={miniBtn}
              title="Reject for this product"
              {...shieldBtn}
              onClick={stopCardClick(() => applyAssignment("assigned-button", id, "lane_reject", handle, vk, "primary"))}
            >
              Reject
            </button>
            <button
              type="button"
              data-action-button="primary-return"
              style={miniBtn}
              title="Return to Unassigned"
              {...shieldBtn}
              onClick={stopCardClick(() => applyAssignment("assigned-button", id, "unassigned", handle, vk, "primary"))}
            >
              Return to Unassigned
            </button>
          </div>
        ) : null}
        {zone === "gallery" ? (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 4, marginTop: 4 }}>
            <button
              type="button"
              data-action-button="gallery-move-first"
              style={miniBtn}
              {...shieldBtn}
              onClick={stopCardClick(() =>
                updateVariantDecision(
                  handle,
                  vk,
                  (prev) => {
                    const g = prev.gallery.filter((x) => x !== id)
                    return { ...prev, gallery: [id, ...g] }
                  },
                  "gallery move first",
                  id,
                  { fromZone: "gallery", targetZone: "gallery_reorder" }
                )
              )}
            >
              Move first
            </button>
            <button
              type="button"
              data-action-button="gallery-move-last"
              style={miniBtn}
              {...shieldBtn}
              onClick={stopCardClick(() =>
                updateVariantDecision(
                  handle,
                  vk,
                  (prev) => {
                    const g = prev.gallery.filter((x) => x !== id)
                    return { ...prev, gallery: [...g, id] }
                  },
                  "gallery move last",
                  id,
                  { fromZone: "gallery", targetZone: "gallery_reorder" }
                )
              )}
            >
              Move last
            </button>
            <button
              type="button"
              data-action-button="gallery-move-left"
              style={miniBtn}
              {...shieldBtn}
              onClick={stopCardClick(() =>
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
                  id,
                  { fromZone: "gallery", targetZone: "gallery_reorder" }
                )
              )}
            >
              Move left
            </button>
            <button
              type="button"
              data-action-button="gallery-move-right"
              style={miniBtn}
              {...shieldBtn}
              onClick={stopCardClick(() =>
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
                  id,
                  { fromZone: "gallery", targetZone: "gallery_reorder" }
                )
              )}
            >
              Move right
            </button>
            <button
              type="button"
              data-action-button="gallery-set-primary"
              style={miniBtn}
              title="Set as Primary"
              {...shieldBtn}
              onClick={stopCardClick(() =>
                updateVariantDecision(
                  handle,
                  vk,
                  (prev) => ({ ...prev, primary: id, gallery: prev.gallery.filter((x) => x !== id) }),
                  "set primary from gallery",
                  id,
                  { fromZone: "gallery", targetZone: "primary" }
                )
              )}
            >
              Set as Primary
            </button>
            <button
              type="button"
              data-action-button="gallery-remove"
              style={miniBtn}
              title="Remove from Gallery (back to pool)"
              {...shieldBtn}
              onClick={stopCardClick(() =>
                updateVariantDecision(
                  handle,
                  vk,
                  (prev) => ({ ...prev, gallery: prev.gallery.filter((x) => x !== id) }),
                  "remove from gallery",
                  id,
                  { fromZone: "gallery", targetZone: "unassigned_pool" }
                )
              )}
            >
              Remove from Gallery
            </button>
            <button
              type="button"
              data-action-button="gallery-return"
              style={miniBtn}
              title="Return to Unassigned"
              {...shieldBtn}
              onClick={stopCardClick(() => applyAssignment("assigned-button", id, "unassigned", handle, vk, "gallery"))}
            >
              Return to Unassigned
            </button>
          </div>
        ) : null}
        {zone === "reference" ? (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 4, marginTop: 4 }}>
            <button
              type="button"
              data-action-button="ref-to-primary"
              style={miniBtn}
              title="Move to Primary"
              {...shieldBtn}
              onClick={stopCardClick(() => applyAssignment("assigned-button", id, "primary", handle, vk, "reference"))}
            >
              Move to Primary
            </button>
            <button
              type="button"
              data-action-button="ref-to-gallery"
              style={miniBtn}
              title="Move to Gallery"
              {...shieldBtn}
              onClick={stopCardClick(() => applyAssignment("assigned-button", id, "gallery", handle, vk, "reference"))}
            >
              Move to Gallery
            </button>
            <button
              type="button"
              data-action-button="ref-return"
              style={miniBtn}
              title="Return to Unassigned"
              {...shieldBtn}
              onClick={stopCardClick(() => applyAssignment("assigned-button", id, "unassigned", handle, vk, "reference"))}
            >
              Return to Unassigned
            </button>
          </div>
        ) : null}
        {zone === "lane_reject" ? (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 4, marginTop: 4 }}>
            <button
              type="button"
              data-action-button="rej-to-primary"
              style={miniBtn}
              title="Move to Primary"
              {...shieldBtn}
              onClick={stopCardClick(() => applyAssignment("assigned-button", id, "primary", handle, vk, "lane_reject"))}
            >
              Move to Primary
            </button>
            <button
              type="button"
              data-action-button="rej-to-gallery"
              style={miniBtn}
              title="Move to Gallery"
              {...shieldBtn}
              onClick={stopCardClick(() => applyAssignment("assigned-button", id, "gallery", handle, vk, "lane_reject"))}
            >
              Move to Gallery
            </button>
            <button
              type="button"
              data-action-button="rej-return"
              style={miniBtn}
              title="Return to Unassigned"
              {...shieldBtn}
              onClick={stopCardClick(() => applyAssignment("assigned-button", id, "unassigned", handle, vk, "lane_reject"))}
            >
              Return to Unassigned
            </button>
          </div>
        ) : null}
        <button
          type="button"
          data-action-button="assigned-details"
          style={{ ...miniBtn, marginTop: 6, width: "100%" }}
          title="Open Inspector for this assigned media"
          {...shieldBtn}
          onClick={stopCardClick(() => setInspectorId(id))}
        >
          Details / Inspect
        </button>
        {crossVariant ? (
          <div style={{ marginTop: 6, fontSize: 10, color: "#b45309", lineHeight: 1.35 }}>
            Variant source: <strong>{ownerVk ? variantsForHandle[ownerVk]?.label || ownerVk : "—"}</strong>
            <button
              type="button"
              data-action-button="move-to-active-variant"
              style={{ ...miniBtn, marginTop: 4, width: "100%" }}
              title="Move this media into the currently active variant's Gallery"
              {...shieldBtn}
              onClick={stopCardClick(() => applyAssignment("assigned-button", id, "gallery", handle, vk, `other_variant:${ownerVk}`))}
            >
              Move to active variant (gallery)
            </button>
          </div>
        ) : null}
      </>
    )
    return (
      <MediaImageCard
        inventoryId={id}
        inv={inv}
        productHandle={handle}
        dataZone={zone}
        previewUrl={pv.url}
        useImg={pv.useImg}
        caption={pv.caption}
        sourcePath={inv.repo_relative_path || inv.source_path}
        sourceType={inv.source_type}
        confidenceLabel={candById.get(id)?.confidence || null}
        previewable={inv.previewable}
        badges={["Assigned", zone]}
        size={size}
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
                  fromVariantKey: vk,
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
        assignedControlsAboveDrag
      >
        {zoneActions}
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

  const exportReady = Boolean(exportFeedback) || localDecisionSlots > 0

  /**
   * Quick check: does product `handle` have at least one not-yet-confirmed
   * (and not-rejected) suggested color variant? Used by the review-flow
   * navigation buttons to skip products that are already settled.
   */
  const productHasUnconfirmedSuggestions = (handle: string): boolean => {
    const h = handle.toLowerCase()
    const rejected = new Set(rejectedSuggestedVariantsByHandle[h] ?? [])
    const variants = variantsByHandle[h] ?? {}
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
      if (variants[key]) continue
      return true
    }
    return false
  }

  /**
   * Navigate to the next product (in `productsFiltered` order) that still has
   * suggestions waiting for review. Falls back to the next product in the list
   * if none have unconfirmed suggestions.
   */
  const goToNextProductWithSuggestions = (fromHandle?: string) => {
    if (productsFiltered.length === 0) return
    const startIdx = fromHandle
      ? productsFiltered.findIndex((p) => p.handle.toLowerCase() === fromHandle.toLowerCase())
      : -1
    for (let off = 1; off <= productsFiltered.length; off++) {
      const i = (Math.max(0, startIdx) + off) % productsFiltered.length
      const p = productsFiltered[i]
      if (productHasUnconfirmedSuggestions(p.handle)) {
        setSelectedHandle(p.handle)
        return
      }
    }
    /* All settled — just go to the next product in the list */
    const i = (Math.max(0, startIdx) + 1) % productsFiltered.length
    setSelectedHandle(productsFiltered[i].handle)
  }

  const workflowSteps = (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
        padding: "6px 20px 8px",
        borderTop: "1px solid #e2e8f0",
        background: "#f8fafc",
      }}
    >
      {(
        [
          { n: 1, t: "Collection", done: true },
          { n: 2, t: "Product", done: Boolean(selectedHandle) },
          { n: 3, t: "Review", done: Boolean(selectedHandle) },
          { n: 4, t: "Assign", done: localDecisionSlots > 0 },
          { n: 5, t: "Export", done: exportReady },
        ] as const
      ).map((s, i, arr) => (
        <div key={s.n} style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 999,
              fontSize: 10,
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
          <span style={{ fontSize: 11, fontWeight: s.done ? 700 : 500, color: s.done ? "#0f172a" : "#64748b" }}>{s.t}</span>
          {i < arr.length - 1 ? <span style={{ color: "#cbd5e1", fontSize: 12 }}>→</span> : null}
        </div>
      ))}
      <div style={{ marginLeft: "auto", fontSize: 11, color: "#475569", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <span>
          <span style={{ color: "#64748b" }}>Collection:</span> <strong>{collectionLabel}</strong>
        </span>
        <span>
          <span style={{ color: "#64748b" }}>Product:</span> <strong>{selectedHandle || "— none"}</strong>
        </span>
        <span style={{ color: "#64748b" }}>
          Slots: <strong>{localDecisionSlots}</strong> · local-only
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
    const totalSuggestions = suggestedVariantsForSelected.length
    const confirmedSuggestionCount = suggestedVariantsForSelected.filter((s) => Boolean(vByHandle[s.variantKey])).length
    const leftSuggestionCount = Math.max(0, totalSuggestions - confirmedSuggestionCount)
    const allSuggestionsReviewed = totalSuggestions > 0 && leftSuggestionCount === 0

    /**
     * One-shot confirmation: writes variants[h][vk] + meta + active variant for every
     * suggestion in `arr` and mirrors `board.zones[h]` to the LAST entry so the
     * Current main media panel jumps to the just-confirmed variant. Used by per-card
     * `Confirm all` and by the bulk-action toolbar.
     */
    const confirmAllForSuggestions = (arr: typeof suggestions) => {
      if (!arr.length) return
      const variantUpdates: Record<string, VariantDecisionState> = {}
      const metaUpdates: Record<string, VariantMetaState> = {}
      for (const s of arr) {
        const sk = suggestionEnrichmentKey(h, s.variantKey)
        const enc = enrichmentByKey[sk]?.data ?? null
        const prefs = suggestionRowPrefs[sk] ?? { useLegacyName: false, useLegacyArticle: false, editedLegacyArticle: null }
        variantUpdates[s.variantKey] = {
          label: prefs.useLegacyName && enc?.legacy_color_name ? enc.legacy_color_name : s.label,
          primary: s.primaryCandidateId || null,
          gallery: [...s.galleryCandidateIds],
          reference: [],
          rejected: [],
        }
        metaUpdates[s.variantKey] = variantMetaFromEnrichmentAndSuggestion({
          productSkuHint: s.productSkuHint,
          suggestionReasons: s.reasons,
          suggestionConfidence: s.confidence,
          suggestionSourcePathHints: s.sourcePathHints,
          suggestionSourceUrl: s.sourceUrl,
          enrichment: enc,
          useLegacyName: prefs.useLegacyName,
          useLegacyArticle: prefs.useLegacyArticle,
          editedLegacyArticle: prefs.editedLegacyArticle,
          status: "confirmed",
        })
      }
      const lastVariant = arr[arr.length - 1]
      setVariantsByHandle((prev) => ({
        ...prev,
        [h]: { ...(prev[h] ?? {}), ...variantUpdates },
      }))
      setVariantMetaByHandle((prev) => ({
        ...prev,
        [h]: { ...(prev[h] ?? {}), ...metaUpdates },
      }))
      setBoard((prev) => ({
        ...prev,
        zones: {
          ...prev.zones,
          [h]: {
            ...(prev.zones[h] ?? emptyZones()),
            primary: lastVariant.primaryCandidateId || null,
            gallery: [...lastVariant.galleryCandidateIds],
            reference_only: [],
            lane_rejected: [],
          },
        },
      }))
      setActiveVariantByHandle((prev) => ({ ...prev, [h]: lastVariant.variantKey }))
      setDiag((d) => ({
        ...d,
        stateUpdateRequested: true,
        stateActuallyChanged: true,
        lastAction: `confirm ${arr.length} suggestion${arr.length === 1 ? "" : "s"} for variant`,
        lastError: "",
      }))
    }
    const confirmAllVisible = () => confirmAllForSuggestions(suggestions)
    const confirmHighConfidence = () => confirmAllForSuggestions(suggestions.filter((s) => s.confidence === "high"))
    const skipCurrentProduct = () => {
      goToNextProductWithSuggestions(h)
    }

    return (
      <section
        style={{
          background: "#fff",
          borderRadius: 14,
          border: "2px solid #2563eb",
          boxShadow: "0 8px 28px rgba(37,99,235,0.12)",
          padding: 18,
          marginBottom: 16,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          minWidth: 0,
        }}
      >
        {/* SECTION 1 — Identity header (full width) */}
        <header style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Selected product</div>
          <h2
            title={selectedProduct.title || selectedProduct.handle}
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              color: "#0f172a",
              lineHeight: 1.2,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              overflowWrap: "anywhere",
              wordBreak: "break-word",
            }}
          >
            {selectedProduct.title || selectedProduct.handle}
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: 13, color: "#475569", rowGap: 6 }}>
            <code style={{ background: "#f1f5f9", padding: "2px 8px", borderRadius: 6, fontSize: 12 }}>{selectedProduct.handle}</code>
            <span style={{ fontSize: 12 }}>SKU <strong>{selectedProduct.sku}</strong></span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                padding: "3px 10px",
                borderRadius: 999,
                background: "#eef2ff",
                color: "#3730a3",
              }}
            >
              {selectedProduct.collection || "— collection"}
            </span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "#94a3b8", lineHeight: 1.4 }}>
              Storefront seeds: <strong>{selectedProduct.image_urls.length}</strong> · matcher rows: <strong>{candCount}</strong> · assigned slots:{" "}
              <strong>{(z.primary ? 1 : 0) + z.gallery.length + z.reference_only.length + z.lane_rejected.length}</strong>
            </span>
          </div>
        </header>

        {/* SECTION 2 — Color variants panel (full width) */}
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 12, background: "#fff", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.06em" }}>Color variants</span>
            <span style={{ fontSize: 11, color: "#475569" }}>
              Active: <strong>{activeVariant.label}</strong>
              {" · "}
              status: <strong>{activeVariantMeta?.status || (activeVariantKey === DEFAULT_VARIANT_KEY ? "confirmed" : "edited")}</strong>
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", rowGap: 6 }}>
            {Object.entries(vByHandle).map(([vk, vv]) => (
              <button
                key={vk}
                type="button"
                onClick={() => setActiveVariantByHandle((prev) => ({ ...prev, [h]: vk }))}
                title={vv.label}
                style={{
                  ...miniBtn,
                  padding: "4px 10px",
                  background: vk === activeVariantKey ? "#0f172a" : "#f8fafc",
                  color: vk === activeVariantKey ? "#fff" : "#334155",
                  borderColor: vk === activeVariantKey ? "#0f172a" : "#cbd5e1",
                  maxWidth: 220,
                }}
              >
                {vv.label}
              </button>
            ))}
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: "auto" }}>
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
                      [key]: mergeVariantMeta(prev[h]?.[key], selectedProduct.sku.trim() || "", {
                        reasons: ["manual add variant"],
                        status: "edited",
                      }),
                    },
                  }))
                  setActiveVariantByHandle((prev) => ({ ...prev, [h]: key }))
                  setNewVariantLabel("")
                }}
              >
                Add variant
              </button>
            </div>
          </div>
          {activeVariantMeta ? (
            <div style={{ marginTop: 8, fontSize: 11, color: "#475569", lineHeight: 1.5, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "baseline", rowGap: 4 }}>
                <span>
                  Legacy article:{" "}
                  <strong style={{ overflowWrap: "anywhere" }}>
                    {activeVariantMeta.editedLegacyArticle?.trim() || activeVariantMeta.legacyColorArticle || "—"}
                  </strong>
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#475569",
                    background: "#f1f5f9",
                    padding: "2px 6px",
                    borderRadius: 999,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  {activeVariantMeta.legacyColorArticleStatus}
                </span>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  SKU hint: <span style={{ color: "#64748b" }}>{activeVariantMeta.productSkuHint || selectedProduct.sku || "—"}</span> · not a legacy color article
                </span>
              </div>
              <details>
                <summary
                  style={{
                    cursor: "pointer",
                    fontSize: 10,
                    color: "#94a3b8",
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  Why? — source / fetch
                </summary>
                <div style={{ marginTop: 4, fontSize: 11, color: "#475569", overflowWrap: "anywhere", wordBreak: "break-word" }}>
                  Legacy color name: <strong>{activeVariantMeta.legacyColorName || "—"}</strong>
                  <br />
                  Source URL:{" "}
                  {activeVariantMeta.sourceUrl ? (
                    <a
                      href={activeVariantMeta.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      title={activeVariantMeta.sourceUrl}
                      style={{ color: "#2563eb", overflowWrap: "anywhere", wordBreak: "break-all" }}
                    >
                      {truncateMiddleClient(activeVariantMeta.sourceUrl, 72)}
                    </a>
                  ) : (
                    "—"
                  )}
                  <br />
                  Fetch: <strong>{activeVariantMeta.fetchStatus}</strong> · confidence: <strong>{activeVariantMeta.confidence}</strong>
                </div>
              </details>
            </div>
          ) : null}
        </div>

        {/* SECTION 3 — Current main media panel (full width, actionable lanes) */}
        <section
          data-selected-product-main-media="true"
          data-product-handle={h}
          data-active-variant-key={activeVariantKey}
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            padding: 12,
            background: "#fafbfc",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            minWidth: 0,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.06em" }}>Current main media</span>
            <span style={{ fontSize: 10, color: "#94a3b8" }}>
              live controls · variant <strong style={{ color: "#475569" }}>{activeVariant.label}</strong> · primary <strong>{z.primary ? 1 : 0}</strong> · gallery{" "}
              <strong>{z.gallery.length}</strong> · reference <strong>{z.reference_only.length}</strong> · rejected <strong>{z.lane_rejected.length}</strong>
            </span>
          </div>

          {zoneBox(
            "Primary",
            "Drop to Primary",
            selectedHandle,
            "primary",
            z.primary ? (
              <div data-main-media-slot="primary" style={{ flex: "0 0 auto" }}>
                {renderZoneThumb(z.primary, selectedHandle, "primary", activeVariantKey, vByHandle, "large")}
              </div>
            ) : (
              <span style={muted}>
                Primary empty — use <strong>Set as Primary</strong> on any pool tile, or drop a tile here.
              </span>
            )
          )}

          {zoneBox(
            "Gallery",
            "Drop to Gallery",
            selectedHandle,
            "gallery",
            <>
              {z.gallery.length === 0 ? (
                <span style={muted}>
                  No gallery items yet — use the <strong>Gallery</strong> button on pool tiles or drop one here.
                </span>
              ) : (
                z.gallery.map((gid) => (
                  <div
                    key={gid}
                    data-legacy-drop-target="true"
                    data-drop-kind="product-zone"
                    data-drop-zone="gallery"
                    data-product-handle={h}
                    data-zone="gallery"
                    data-inventory-id={gid}
                    data-main-media-slot="gallery"
                    style={{ flex: "0 0 auto" }}
                  >
                    {renderZoneThumb(gid, selectedHandle, "gallery", activeVariantKey, vByHandle, "large")}
                  </div>
                ))
              )}
            </>
          )}

          {/* Reference + Rejected — collapsible secondary lanes, side-by-side at full width */}
          <div style={{ display: "grid", gridTemplateColumns: fullWidth ? "repeat(2, minmax(0, 1fr))" : "1fr", gap: 12 }}>
            <details
              open={z.reference_only.length > 0}
              style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", padding: "8px 10px", minWidth: 0 }}
            >
              <summary
                style={{
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#475569",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Reference only · <span style={{ color: "#94a3b8" }}>{z.reference_only.length}</span>
              </summary>
              <div style={{ marginTop: 8 }}>
                {zoneBox(
                  "Reference only",
                  "Drop to Reference",
                  selectedHandle,
                  "reference",
                  z.reference_only.length
                    ? z.reference_only.map((rid) => renderZoneThumb(rid, selectedHandle, "reference", activeVariantKey, vByHandle))
                    : <span style={muted}>Optional reference shots — kept in the variant, not exported to Primary / Gallery.</span>
                )}
              </div>
            </details>
            <details
              open={z.lane_rejected.length > 0}
              style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", padding: "8px 10px", minWidth: 0 }}
            >
              <summary
                style={{
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#475569",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Rejected for this product · <span style={{ color: "#94a3b8" }}>{z.lane_rejected.length}</span>
              </summary>
              <div style={{ marginTop: 8 }}>
                {zoneBox(
                  "Rejected for this product",
                  "Drop to reject (this SKU)",
                  selectedHandle,
                  "lane_reject",
                  z.lane_rejected.length
                    ? z.lane_rejected.map((jid) => renderZoneThumb(jid, selectedHandle, "lane_reject", activeVariantKey, vByHandle))
                    : <span style={muted}>Not used on this SKU.</span>
                )}
              </div>
            </details>
          </div>

          {/* Unassigned drop strip — return tiles back to the pool */}
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
              padding: "10px 12px",
              borderRadius: 10,
              background: dragHoverZoneKey === `return|${h}` ? "#eff6ff" : "#f8fafc",
              border: dragHoverZoneKey === `return|${h}` ? "2px dashed #2563eb" : "1px dashed #cbd5e1",
              fontSize: 12,
              color: dragHoverZoneKey === `return|${h}` ? "#1e40af" : "#64748b",
              transition: "border 0.12s ease, background 0.12s ease",
            }}
          >
            {dragHoverZoneKey === `return|${h}` ? (
              <strong>Drop to remove from lanes</strong>
            ) : (
              <>
                Drop assigned tiles here to return them to the <strong>unassigned</strong> pool. Each lane card also exposes a <strong>Return to Unassigned</strong> button.
              </>
            )}
          </div>
        </section>

        {/* SECTION 4 — Suggested color variants — compact review flow */}
        <div
          data-suggested-variants-panel="true"
          data-product-handle={h}
          style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 12, background: "#fff", minWidth: 0 }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8, rowGap: 6 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.06em" }}>Suggested color variants</span>
              {totalSuggestions > 0 ? (
                <span
                  data-suggestions-counter="true"
                  style={{ fontSize: 11, color: "#64748b" }}
                >
                  <strong>{totalSuggestions}</strong> suggestion{totalSuggestions === 1 ? "" : "s"} · <strong>{confirmedSuggestionCount}</strong> confirmed ·{" "}
                  <strong>{leftSuggestionCount}</strong> left
                </span>
              ) : (
                <span style={{ fontSize: 11, color: "#94a3b8" }}>no suggestions</span>
              )}
              <span
                data-product-review-status={allSuggestionsReviewed ? "ready" : "needs-review"}
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: allSuggestionsReviewed ? "#dcfce7" : totalSuggestions === 0 ? "#f1f5f9" : "#fef3c7",
                  color: allSuggestionsReviewed ? "#166534" : totalSuggestions === 0 ? "#64748b" : "#92400e",
                }}
              >
                {totalSuggestions === 0 ? "no review needed" : allSuggestionsReviewed ? "Ready to export" : "Needs review"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                data-action-button="suggestions-confirm-all-visible"
                style={{ ...btnPrimaryMini }}
                disabled={suggestions.length === 0}
                title={suggestions.length === 0 ? "Nothing left to confirm for this product" : `Confirm ${suggestions.length} unreviewed suggestion${suggestions.length === 1 ? "" : "s"} as primary + gallery`}
                onClick={confirmAllVisible}
              >
                Confirm all ({suggestions.length})
              </button>
              <button
                type="button"
                data-action-button="suggestions-confirm-high"
                style={miniBtn}
                disabled={suggestions.filter((s) => s.confidence === "high").length === 0}
                title="Confirm only suggestions whose matcher confidence is high"
                onClick={confirmHighConfidence}
              >
                Confirm high-confidence
              </button>
              <button
                type="button"
                data-action-button="suggestions-skip-product"
                style={miniBtn}
                onClick={skipCurrentProduct}
                title="Move to the next product that still has unconfirmed suggestions"
              >
                Skip product
              </button>
              <button
                type="button"
                data-action-button="suggestions-next-product"
                style={miniBtn}
                onClick={() => goToNextProductWithSuggestions(h)}
                title="Jump to the next product whose suggestions are not yet confirmed"
              >
                Next product →
              </button>
            </div>
          </div>
          {suggestions.length === 0 ? (
            <div style={{ fontSize: 12, color: "#64748b" }}>
              {totalSuggestions === 0
                ? "No legacy color suggestions found for this product."
                : "All suggestions confirmed for this product. Edit them in Color variants above or jump to the next product."}
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {suggestions.slice(0, 6).map((s) => {
                const sk = suggestionEnrichmentKey(h, s.variantKey)
                const encState = enrichmentByKey[sk]
                const enc = encState?.data ?? null
                const loading = Boolean(encState?.loading)
                const defPref: SuggestionPref = { useLegacyName: false, useLegacyArticle: false, editedLegacyArticle: null }
                const prefs = suggestionRowPrefs[sk] ?? defPref
                const normSku = (x: string) => x.replace(/\s+/g, "").replace(/_/g, "-").toLowerCase()
                const parsedArticle =
                  enc?.legacy_color_article && normSku(enc.legacy_color_article) !== normSku(s.productSkuHint)
                    ? enc.legacy_color_article
                    : null
                const articleLine = prefs.editedLegacyArticle?.trim() || parsedArticle || null
                const articleStatusRaw = loading ? "pending" : enc?.legacy_color_article_status ?? (encState?.error ? "unavailable" : "unavailable")
                const articleStatus = articleStatusRaw === "found" ? "found" : articleStatusRaw === "not_found" ? "not found" : articleStatusRaw
                const sourceMethod = enc?.source_method ?? null
                const sourceUrl = (enc?.source_url || s.sourceUrl) as string | null
                const fetchSummary = loading ? "pending" : enc?.fetch_status ?? (encState?.error ? "client_error" : "idle")
                const combinedReasons = enc?.reasons?.length ? [...s.reasons, ...enc.reasons] : s.reasons
                const galleryPreview = [s.primaryCandidateId, ...s.galleryCandidateIds].filter(Boolean) as string[]
                const cardStatus: "suggested" | "edited" = prefs.editedLegacyArticle || prefs.useLegacyArticle || prefs.useLegacyName ? "edited" : "suggested"

                return (
                  <article
                    key={s.variantKey}
                    data-suggestion-card="true"
                    data-variant-key={s.variantKey}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: 10,
                      background: "#fff",
                      padding: 10,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      minWidth: 0,
                    }}
                  >
                    {/* HEADER: label + confidence + status pills + article + source method */}
                    <header style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "baseline", rowGap: 4 }}>
                        <strong style={{ fontSize: 14, color: "#0f172a", overflowWrap: "anywhere" }}>{s.label}</strong>
                        <span style={pillIndigo}>{s.confidence}</span>
                        <span style={pillSlate}>{cardStatus}</span>
                        <span
                          style={{
                            ...pillSlate,
                            background: articleStatus === "found" ? "#dcfce7" : articleStatus === "pending" ? "#dbeafe" : "#fef3c7",
                            color: articleStatus === "found" ? "#166534" : articleStatus === "pending" ? "#1e40af" : "#92400e",
                          }}
                        >
                          article: {articleStatus}
                        </span>
                        {loading ? <span style={{ fontSize: 10, color: "#64748b" }}>fetch…</span> : null}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline", rowGap: 2, fontSize: 11, color: "#475569" }}>
                        <span>
                          Article: <strong style={{ overflowWrap: "anywhere" }}>{articleLine ?? "—"}</strong>
                        </span>
                        {sourceMethod ? (
                          <span style={{ fontSize: 10, color: "#94a3b8" }}>
                            via <strong style={{ color: "#475569" }}>{sourceMethod}</strong>
                          </span>
                        ) : articleStatus === "not found" ? (
                          <span style={{ fontSize: 10, color: "#b45309" }}>article not found · SKU is never the article</span>
                        ) : null}
                        <span style={{ marginLeft: "auto", fontSize: 10, color: "#94a3b8" }}>
                          SKU hint: <span style={{ color: "#64748b" }}>{s.productSkuHint || "—"}</span>
                        </span>
                      </div>
                    </header>

                    {/* BODY: primary candidate + horizontal gallery strip preview */}
                    {galleryPreview.length > 0 ? (
                      <div
                        data-suggestion-thumbs="true"
                        style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start", minWidth: 0 }}
                      >
                        {galleryPreview.slice(0, 6).map((mid, idx) => {
                          const inv = invById.get(mid)
                          const pv = inv ? clientPreviewUrl(inv) : null
                          const previewUrl = pv?.url ?? null
                          const isPrimary = idx === 0
                          return (
                            <div
                              key={mid}
                              data-suggestion-thumb={isPrimary ? "primary" : "gallery"}
                              data-media-id={mid}
                              style={{
                                width: isPrimary ? 96 : 72,
                                height: isPrimary ? 96 : 72,
                                borderRadius: 8,
                                border: isPrimary ? "2px solid #2563eb" : "1px solid #e2e8f0",
                                background: "#f8fafc",
                                overflow: "hidden",
                                position: "relative",
                                flex: "0 0 auto",
                              }}
                              title={inv?.filename || mid}
                            >
                              {previewUrl ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  src={previewUrl}
                                  alt=""
                                  width={isPrimary ? 96 : 72}
                                  height={isPrimary ? 96 : 72}
                                  draggable={false}
                                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                />
                              ) : (
                                <div style={{ fontSize: 9, color: "#94a3b8", padding: 4, lineHeight: 1.2, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
                                  {inv?.filename ? truncateMiddleClient(inv.filename, 24) : "no preview"}
                                </div>
                              )}
                              {isPrimary ? (
                                <span
                                  style={{
                                    position: "absolute",
                                    top: 2,
                                    left: 2,
                                    fontSize: 9,
                                    fontWeight: 700,
                                    color: "#fff",
                                    background: "#2563eb",
                                    padding: "1px 5px",
                                    borderRadius: 6,
                                    letterSpacing: "0.04em",
                                    textTransform: "uppercase",
                                  }}
                                >
                                  Primary
                                </span>
                              ) : null}
                            </div>
                          )
                        })}
                        {galleryPreview.length > 6 ? (
                          <div style={{ fontSize: 10, color: "#64748b", alignSelf: "center" }}>
                            +{galleryPreview.length - 6}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>No candidate images yet for this variant.</div>
                    )}

                    {/* FOOTER: Confirm all (primary) + secondary actions + collapsed Details */}
                    <footer style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", rowGap: 6 }}>
                      <button
                        type="button"
                        data-action-button="suggestion-confirm-all"
                        style={btnPrimaryMini}
                        title="Confirm this variant + primary + gallery in current candidate order. Reorder later in Current main media."
                        onClick={() => confirmAllForSuggestions([s])}
                      >
                        Confirm all
                      </button>
                      <button
                        type="button"
                        data-action-button="suggestion-edit-label"
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
                      <button
                        type="button"
                        data-action-button="suggestion-edit-article"
                        style={miniBtn}
                        onClick={() => {
                          const next = window.prompt("Edit legacy color article (manual)", prefs.editedLegacyArticle || parsedArticle || "")
                          if (next === null) return
                          const t = next.trim()
                          setSuggestionRowPrefs((prev) => ({
                            ...prev,
                            [sk]: { ...(prev[sk] ?? defPref), editedLegacyArticle: t || null, useLegacyArticle: t.length > 0 },
                          }))
                        }}
                      >
                        Edit article
                      </button>
                      <button
                        type="button"
                        data-action-button="suggestion-reject"
                        style={miniBtn}
                        onClick={() =>
                          setRejectedSuggestedVariantsByHandle((prev) => ({
                            ...prev,
                            [h]: Array.from(new Set([...(prev[h] ?? []), s.variantKey])),
                          }))
                        }
                      >
                        Reject
                      </button>
                      <details style={{ marginLeft: "auto" }}>
                        <summary
                          style={{
                            cursor: "pointer",
                            fontSize: 10,
                            color: "#94a3b8",
                            fontWeight: 700,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                          }}
                        >
                          Details
                        </summary>
                        <div style={{ marginTop: 6, fontSize: 11, color: "#475569", overflowWrap: "anywhere", wordBreak: "break-word", lineHeight: 1.45 }}>
                          <div>Legacy color name: <strong>{enc?.legacy_color_name || "—"}</strong></div>
                          <div style={{ marginTop: 2 }}>
                            Source URL:{" "}
                            {sourceUrl ? (
                              <a
                                href={sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                title={sourceUrl}
                                style={{ color: "#2563eb", overflowWrap: "anywhere", wordBreak: "break-all" }}
                              >
                                {truncateMiddleClient(sourceUrl, 72)}
                              </a>
                            ) : (
                              <span title={s.sourcePathHints[0] || ""}>
                                {s.sourcePathHints[0] ? truncateMiddleClient(s.sourcePathHints[0], 72) : "legacy source unavailable"}
                              </span>
                            )}
                          </div>
                          <div style={{ marginTop: 2 }}>
                            Source method: <strong>{sourceMethod || "—"}</strong> · Fetch / parse: <strong>{fetchSummary}</strong>
                            {encState?.error ? <span style={{ color: "#b91c1c" }}> · {encState.error}</span> : null}
                          </div>
                          <div style={{ marginTop: 2 }}>
                            Filename tokens / reasons:{" "}
                            <span style={{ color: "#64748b" }}>{combinedReasons.length ? combinedReasons.join(", ") : "—"}</span>
                          </div>
                          <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <button
                              type="button"
                              style={{ ...miniBtn, background: prefs.useLegacyName ? "#0f172a" : "#fff", color: prefs.useLegacyName ? "#fff" : "#334155" }}
                              onClick={() =>
                                setSuggestionRowPrefs((prev) => ({
                                  ...prev,
                                  [sk]: { ...(prev[sk] ?? defPref), useLegacyName: !(prev[sk]?.useLegacyName ?? false) },
                                }))
                              }
                            >
                              Use legacy name
                            </button>
                            <button
                              type="button"
                              style={{ ...miniBtn, background: prefs.useLegacyArticle ? "#0f172a" : "#fff", color: prefs.useLegacyArticle ? "#fff" : "#334155" }}
                              onClick={() =>
                                setSuggestionRowPrefs((prev) => ({
                                  ...prev,
                                  [sk]: { ...(prev[sk] ?? defPref), useLegacyArticle: !(prev[sk]?.useLegacyArticle ?? false) },
                                }))
                              }
                            >
                              Use legacy article
                            </button>
                          </div>
                        </div>
                      </details>
                    </footer>
                  </article>
                )
              })}
            </div>
          )}
          {suggestions.length > 6 ? (
            <p style={{ margin: "8px 0 0", fontSize: 11, color: "#94a3b8" }}>
              Showing first 6 of {suggestions.length}. Confirm or skip these, then more will surface on the next pass.
            </p>
          ) : null}
        </div>

        {/* SECTION 5 — Storefront catalog reference (collapsed, full width) */}
        {selectedProduct.image_urls.length > 0 ? (
          <details style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: "10px 12px", background: "#fff", minWidth: 0 }}>
            <summary
              style={{
                cursor: "pointer",
                fontSize: 10,
                fontWeight: 700,
                color: "#94a3b8",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Storefront catalog reference ({selectedProduct.image_urls.length} seed image{selectedProduct.image_urls.length === 1 ? "" : "s"}, not assigned)
            </summary>
            <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(auto-fill, 64px)", gap: 6 }}>
              {selectedProduct.image_urls.slice(0, 8).map((u) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={u}
                  src={u}
                  alt=""
                  width={64}
                  height={64}
                  draggable={false}
                  title="Storefront catalog (seed) image — not assigned, not exported."
                  style={{ width: 64, height: 64, borderRadius: 6, objectFit: "cover", border: "1px solid #e2e8f0", opacity: 0.85 }}
                />
              ))}
            </div>
            <div style={{ marginTop: 6, fontSize: 10, color: "#94a3b8", lineHeight: 1.4 }}>
              These are the current storefront / catalog seed images for context only. They are <strong>not</strong> in any lane and do not affect export. Use the actionable photos in <em>Current main media</em> above to manage assignment.
            </div>
          </details>
        ) : null}
      </section>
    )
  }

  return (
    <div
      style={{
        height: "100vh",
        maxHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
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
          flexShrink: 0,
          background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        <div
          style={{
            margin: "6px 16px 0",
            padding: "5px 10px",
            borderRadius: 6,
            border: "1px solid #fdba74",
            background: "#fff7ed",
            color: "#9a3412",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.01em",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            overflowWrap: "anywhere",
          }}
          title={`${DEV_SENTINEL} · ${DEV_SENTINEL_BUILD}`}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
            {DEV_SENTINEL} · {DEV_SENTINEL_BUILD}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#9a3412", flexShrink: 0 }}>QA dev-only</span>
        </div>
        <header style={{ padding: "8px 16px 6px", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, justifyContent: "space-between", rowGap: 6 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0, flexWrap: "wrap" }}>
              <h1 style={{ margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: "-0.02em", color: "#0f172a" }}>Legacy media assignment</h1>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>local-only · never writes Medusa</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <div style={{ display: "inline-flex", borderRadius: 999, border: "1px solid #e2e8f0", overflow: "hidden" }}>
                <button
                  type="button"
                  onClick={() => setFocusMode(false)}
                  style={{
                    ...segToggleBtn,
                    padding: "5px 10px",
                    fontSize: 11,
                    background: !focusMode ? "#0f172a" : "#fff",
                    color: !focusMode ? "#fff" : "#475569",
                  }}
                >
                  Board
                </button>
                <button
                  type="button"
                  onClick={() => setFocusMode(true)}
                  style={{
                    ...segToggleBtn,
                    padding: "5px 10px",
                    fontSize: 11,
                    background: focusMode ? "#0f172a" : "#fff",
                    color: focusMode ? "#fff" : "#475569",
                  }}
                >
                  Focus
                </button>
              </div>
              <button type="button" onClick={() => void copyJson()} style={{ ...btnPrimary, padding: "6px 12px", fontSize: 12 }}>
                Copy JSON
              </button>
              <button type="button" onClick={downloadJson} style={{ ...btnPrimary, padding: "6px 12px", fontSize: 12 }}>
                Download JSON
              </button>
              <button type="button" onClick={clearLocal} style={{ ...btnGhost, padding: "6px 10px", fontSize: 11 }}>
                Clear local
              </button>
              <button type="button" onClick={resetFilters} style={{ ...btnGhost, padding: "6px 10px", fontSize: 11 }}>
                Reset filters
              </button>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              alignItems: "center",
              fontSize: 11,
              color: "#475569",
              rowGap: 4,
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>Stats</span>
            <span>reviewed <strong>{toolbarCounts.productsReviewed}</strong></span>
            <span style={{ color: "#cbd5e1" }}>·</span>
            <span>with assignments <strong>{toolbarCounts.productsWithAssigned}</strong></span>
            <span style={{ color: "#cbd5e1" }}>·</span>
            <span>unassigned media <strong>{toolbarCounts.unassigned}</strong></span>
            <span style={{ color: "#cbd5e1" }}>·</span>
            <span style={{ color: "#94a3b8" }}>total {toolbarCounts.total} · previewable {toolbarCounts.previewable} · ambiguous {toolbarCounts.ambiguous} · rejected {toolbarCounts.rejected}</span>
            {exportFeedback === "copy" ? (
              <span style={successHint} role="status">Copied.</span>
            ) : exportFeedback === "download" ? (
              <span style={successHint} role="status">Download started.</span>
            ) : null}
            <details style={{ marginLeft: "auto" }}>
              <summary style={{ cursor: "pointer", fontSize: 10, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Export hint
              </summary>
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "#64748b", lineHeight: 1.5, maxWidth: 520 }}>
                <strong>This does not update Medusa.</strong> Save the exported JSON as{" "}
                <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: 6 }}>data/normalized/legacy-media-assignment-decisions.json</code> when you are
                ready to hand it off. Exports <strong>local decisions only</strong>.
              </p>
            </details>
          </div>
        </header>
        {workflowSteps}
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: focusMode ? "minmax(520px,1fr) minmax(500px,520px)" : "280px minmax(520px,1fr) minmax(500px,520px)",
          gridTemplateRows: "minmax(0, 1fr)",
          alignItems: "stretch",
          overflow: "hidden",
        }}
      >
        <aside
          style={{
            width: "100%",
            borderRight: "1px solid #e2e8f0",
            background: "#fff",
            padding: 16,
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
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

        <main style={{ minWidth: 0, minHeight: 0, padding: 16, overflowY: "auto", overflowX: "hidden" }}>
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
            minHeight: 0,
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: "100%",
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
            }}
          >
            <div style={{ flexShrink: 0, padding: "12px 14px", borderBottom: "1px solid #e2e8f0" }}>
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
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", padding: 12 }}>
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
                  <div
                    data-media-pool-grid="true"
                    style={{
                      display: "grid",
                      /** card width is 136px+16 ≈ 152px in `normal`; min 144 keeps cards from clipping the right edge of the aside */
                      gridTemplateColumns: focusMode ? "repeat(auto-fill, minmax(180px, 1fr))" : "repeat(auto-fill, minmax(144px, 1fr))",
                      gap: 10,
                    }}
                  >
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
                        <div key={id} style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
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
                            size={focusMode && selectedHandle ? "large" : "normal"}
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
            <details
              open={diagExpanded}
              onToggle={(e) => setDiagExpanded((e.currentTarget as HTMLDetailsElement).open)}
              style={{ flexShrink: 0, borderTop: "1px solid #e2e8f0", background: "#fafafa" }}
            >
              <summary style={{ cursor: "pointer", padding: "10px 12px", fontSize: 11, fontWeight: 800, color: "#334155" }}>Diagnostics (dev)</summary>
              <div
                style={{
                  fontSize: 10,
                  padding: "0 12px 10px",
                  color: "#475569",
                  display: "grid",
                  gap: 4,
                  lineHeight: 1.35,
                  overflowWrap: "anywhere",
                  wordBreak: "break-word",
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
              <div>Source/media/product: <span style={{ color: "#0f172a" }}>{`${diag.source} / ${diag.mediaId || "—"} / ${diag.productHandle || "—"}`}</span></div>
              <div>
                From zone → target zone:{" "}
                <span style={{ color: "#0f172a" }}>{`${diag.fromZone || "—"} → ${diag.targetZone || "—"}`}</span>
              </div>
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
                flexShrink: 0,
                borderTop: "1px solid #e2e8f0",
                background: "#f8fafc",
                padding: 14,
                overflowY: "auto",
                overflowX: "hidden",
                maxHeight: 320,
                overflowWrap: "anywhere",
                wordBreak: "break-word",
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
  /** keep buttons inside their grid cell so adjacent cards don't visually overlap (minmax(0, 1fr) layout) */
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  minWidth: 0,
  maxWidth: "100%",
  boxSizing: "border-box",
}
/** Dark-filled compact button — used for the primary action in the review flow ("Confirm all"). */
const btnPrimaryMini: React.CSSProperties = {
  ...miniBtn,
  background: "#0f172a",
  color: "#fff",
  borderColor: "#0f172a",
}
const pillIndigo: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "#3730a3",
  background: "#eef2ff",
  padding: "2px 6px",
  borderRadius: 999,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
}
const pillSlate: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "#475569",
  background: "#f1f5f9",
  padding: "2px 6px",
  borderRadius: 999,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
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
