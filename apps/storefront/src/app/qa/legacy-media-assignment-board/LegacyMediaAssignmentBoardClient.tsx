"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
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
  serializeVariantDecisionsForExport,
} from "./legacy-media-board-export"
import {
  DEFAULT_VARIANT_KEY,
  LABEL_NEEDS_REVIEW_RU,
  displayLabelFromColorToken,
  inferColorTokenFromSeedUrls,
  labelNeedsReviewStyle,
  migrateVariantLabelFields,
  resolveVariantDisplayLabel,
  reviewSuffixRu,
  sourceLabelForVariantKey,
  type VariantLabelFields,
  type VariantLabelStatus,
} from "./legacy-color-variant-labels"
import { dedupeAndSortVariantMedia, type InvItemDedupeFields } from "./legacy-media-dedupe"
import {
  applyRoleRepresentativeSelection,
  applySameSkuRoleBorrowing,
  roleBadgeForMedia,
  VISUAL_ROLE_STRIP_LABEL_RU,
  groupHiddenDuplicatesByRole,
  type BorrowedSameSkuEntry,
} from "./legacy-media-variant-gallery-build"
import {
  applyProductSyncPlan,
  buildBoardSyncPlan,
  buildSuggestedVariantsForProductSync,
  type BoardSyncPlan,
} from "./legacy-board-sync-rules"
import {
  appendMediaToAllVariantGalleries,
  countBulkGalleryVariants,
  formatAppendToAllGalleriesNote,
} from "./legacy-board-variant-gallery-append"
import {
  mergeGalleryPreservingOrder,
  variantHasEstablishedGalleryOrder,
  withManualGalleryOrder,
  withRecommendedGalleryOrder,
  type GalleryOrderSource,
} from "./legacy-variant-gallery-order"
import {
  classifyVisualRole,
  pickPrimaryAndGalleryByVisualRole,
  primaryCandidateBadgeRu,
  VISUAL_ROLE_BADGE_RU,
  VISUAL_ROLE_RANKING_TOOLTIP_RU,
  type VisualRole,
} from "./legacy-media-visual-role-ranking"
import { matchAllSeedUrls, orderedInventoryIdsFromSeedUrls, type SeedUrlMatchRow } from "./seed-inventory-match"
import { classifyMediaProductIdentity, explicitProductTokenFromMedia, normHandle, normSku } from "./suggestion-product-guard"
import { VariantZoneControls } from "./variant-zone-controls"
import { StorefrontSeedMediaCard } from "./StorefrontSeedMediaCard"
import type {
  CandidateEntry,
  InvItem,
  ArticleScanProgress,
  IndexedArticleCandidate,
  LegacyColorEnrichmentWithIndex,
  LegacyMediaDragPayload,
  LegacyMediaDragZone,
  ProductRow,
  SuggestedVariant,
  VariantMetaByHandle,
  VariantMetaState,
} from "./legacy-media-board-types"
import { MediaImageCard } from "./MediaImageCard"

const LS_KEY = "furniture-legacy-media-assignment-decisions-v1"
const LS_VARIANTS_KEY = "furniture-legacy-media-assignment-variants-v1"
const LS_ARTICLE_SCAN_KEY = "furniture-legacy-article-scan-v1"
const POOL_LIMIT = 120
const UNKNOWN_COLLECTION = "__unknown__"
const API_BASE = "/qa/legacy-media-assignment-board/api"
const PREVIEW_ROUTE = "/qa/legacy-media-assignment-board/preview"
const DND_JSON = "application/json"
const DEV_SENTINEL = "Legacy Board media pool two-column + add to all galleries"
const DEV_SENTINEL_BUILD = "2026-05-17T20:00Z"

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
type ActionSource =
  | "button"
  | "assigned-button"
  | "manual"
  | "drag"
  | "selected-product-default"
  | "add-to-all-variant-galleries"

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
type VariantDecisionState = VariantLabelFields & {
  primary: string | null
  gallery: string[]
  reference: string[]
  rejected: string[]
  primaryManualOverride?: boolean
  primaryAutoPicked?: boolean
  primaryNeedsReview?: boolean
  /** QA-only: how gallery order was established (not exported). */
  galleryOrderSource?: GalleryOrderSource | null
  galleryOrderLocked?: boolean
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

function emptyVariant(label = LABEL_NEEDS_REVIEW_RU, extras?: Partial<VariantDecisionState>): VariantDecisionState {
  return {
    label,
    sourceLabel: extras?.sourceLabel ?? null,
    labelEditedByUser: extras?.labelEditedByUser ?? false,
    labelStatus: extras?.labelStatus ?? "needs_review",
    primary: null,
    gallery: [],
    reference: [],
    rejected: [],
    primaryManualOverride: extras?.primaryManualOverride ?? false,
    primaryAutoPicked: extras?.primaryAutoPicked ?? false,
    primaryNeedsReview: extras?.primaryNeedsReview ?? false,
  }
}

function withResolvedVariantLabel(
  variantKey: string,
  variant: VariantDecisionState,
  opts?: {
    legacyColorName?: string | null
    productSkuHint?: string | null
    preferLegacyColorName?: boolean
    seedImageUrls?: string[]
  }
): VariantDecisionState {
  const resolved = resolveVariantDisplayLabel({
    variantKey,
    persistedLabel: variant.label,
    sourceLabel: variant.sourceLabel,
    labelEditedByUser: variant.labelEditedByUser,
    labelStatus: variant.labelStatus,
    legacyColorName: opts?.legacyColorName,
    preferLegacyColorName: opts?.preferLegacyColorName,
    productSkuHint: opts?.productSkuHint,
    seedImageUrls: opts?.seedImageUrls,
  })
  return {
    ...variant,
    label: variant.labelEditedByUser ? variant.label : resolved.displayLabel,
    sourceLabel: variant.sourceLabel ?? resolved.sourceLabel,
    labelStatus: variant.labelEditedByUser ? "user_edited" : resolved.labelStatus,
  }
}

function migrateVariantGalleryOrderOnLoad(
  variant: VariantDecisionState,
  metaStatus?: string | null
): VariantDecisionState {
  if (variant.galleryOrderSource === "manual" || variant.galleryOrderLocked) return variant
  if (
    variant.gallery.length > 0 &&
    (variant.primaryManualOverride || metaStatus === "edited" || metaStatus === "confirmed")
  ) {
    return { ...variant, galleryOrderSource: "manual", galleryOrderLocked: true }
  }
  return variant
}

function galleryOrderTouched(prev: VariantDecisionState, next: VariantDecisionState): boolean {
  if (prev.primary !== next.primary) return true
  if (prev.gallery.length !== next.gallery.length) return true
  return prev.gallery.some((id, i) => id !== next.gallery[i])
}

function buildVariantMediaFromCandidates(
  candidateIds: string[],
  invById: Map<string, InvItem>,
  seedOrder: string[],
  candById: Map<string, CandidateEntry>,
  existing?: VariantDecisionState | null,
  metaStatus?: string | null,
  opts?: { selectedSku?: string; colorToken?: string }
): Pick<
  VariantDecisionState,
  | "primary"
  | "gallery"
  | "primaryManualOverride"
  | "primaryAutoPicked"
  | "primaryNeedsReview"
  | "galleryOrderSource"
  | "galleryOrderLocked"
> {
  const invDedupe = new Map<string, InvItemDedupeFields>()
  for (const [id, row] of Array.from(invById.entries())) invDedupe.set(id, row)
  const preserveOrder =
    existing && variantHasEstablishedGalleryOrder(existing, metaStatus) ? existing.gallery : undefined
  const deduped = dedupeAndSortVariantMedia(candidateIds, invDedupe, candById, {
    seedOrder,
    preserveGalleryOrder: preserveOrder,
    selectedSku: opts?.selectedSku,
    colorToken: opts?.colorToken,
  })

  if (existing?.primaryManualOverride && existing.primary) {
    return {
      primary: existing.primary,
      gallery: mergeGalleryPreservingOrder(existing.gallery, deduped.galleryCandidateIds, existing.primary),
      primaryManualOverride: true,
      primaryAutoPicked: false,
      primaryNeedsReview: false,
      galleryOrderSource: existing.galleryOrderSource ?? "manual",
      galleryOrderLocked: true,
    }
  }

  if (existing && variantHasEstablishedGalleryOrder(existing, metaStatus)) {
    const primary = existing.primary ?? deduped.primaryCandidateId
    return {
      primary,
      gallery: mergeGalleryPreservingOrder(existing.gallery, deduped.galleryCandidateIds, primary),
      primaryManualOverride: existing.primaryManualOverride ?? false,
      primaryAutoPicked: existing.primary ? !existing.primaryManualOverride : deduped.primaryCandidateId === primary,
      primaryNeedsReview: false,
      galleryOrderSource: existing.galleryOrderSource ?? "manual",
      galleryOrderLocked: true,
    }
  }

  const pickMeta = pickPrimaryAndGalleryByVisualRole(deduped.visibleIds, invById, {
    seedOrder: preserveOrder?.length ? preserveOrder : seedOrder,
  })
  const primary = deduped.primaryCandidateId ?? pickMeta.primaryId
  const gallery =
    deduped.galleryCandidateIds.length > 0
      ? deduped.galleryCandidateIds
      : pickMeta.galleryIds.filter((id) => id !== primary)
  return {
    primary,
    gallery,
    primaryManualOverride: false,
    primaryAutoPicked: true,
    primaryNeedsReview: pickMeta.needsReview,
    galleryOrderSource: "suggestion",
    galleryOrderLocked: false,
  }
}

function applyRecommendedVisualOrderToVariant(
  variant: VariantDecisionState,
  invById: Map<string, InvItem>,
  candById: Map<string, CandidateEntry>
): VariantDecisionState {
  const ids = [...(variant.primary ? [variant.primary] : []), ...variant.gallery.filter((id) => id !== variant.primary)]
  if (ids.length === 0) return variant
  const invDedupe = new Map<string, InvItemDedupeFields>()
  for (const [id, row] of Array.from(invById.entries())) invDedupe.set(id, row)
  const roleBuild = applyRoleRepresentativeSelection(ids, invDedupe, candById)
  return withRecommendedGalleryOrder({
    ...variant,
    primary: roleBuild.primaryId,
    gallery: roleBuild.galleryIds,
    primaryAutoPicked: false,
    primaryManualOverride: false,
    primaryNeedsReview: roleBuild.primaryNeedsReview,
  })
}

function stubInvForBoardThumb(mediaId: string, reason: string): InvItem {
  const seedBasename = mediaId.includes("/") ? (mediaId.split("/").pop() ?? mediaId) : mediaId
  return {
    id: mediaId,
    source_type: "qa_missing_inventory",
    source_path: reason,
    repo_relative_path: null,
    filename: seedBasename,
    collection_hint: null,
    sku_hint: null,
    handle_hint: null,
    exists_locally: false,
    previewable: false,
    preview_reason: reason,
  }
}

function SuggestionVariantThumb({
  mid,
  isPrimary,
  inv,
  seedRows,
  roleBadge,
  borrowedLabel,
}: {
  mid: string
  isPrimary: boolean
  inv: InvItem | undefined
  seedRows: SeedUrlMatchRow[]
  roleBadge?: string | null
  borrowedLabel?: string | null
}) {
  const [broken, setBroken] = useState(false)
  const thumbPv = boardThumbPreview(mid, inv, seedRows)
  const showImg = Boolean(thumbPv.url && thumbPv.useImg && !broken)
  const box: CSSProperties = {
    width: isPrimary ? 96 : 72,
    height: isPrimary ? 96 : 72,
    borderRadius: 8,
    border: isPrimary ? "2px solid #2563eb" : "1px solid #e2e8f0",
    background: "#f8fafc",
    overflow: "hidden",
    position: "relative",
    flex: "0 0 auto",
  }
  const filename = inv?.filename || mid
  const title = [filename, inv?.source_path, thumbPv.reason].filter(Boolean).join(" · ")
  return (
    <div
      data-suggestion-thumb={isPrimary ? "primary" : "gallery"}
      data-media-id={mid}
      style={box}
      title={title}
    >
      {showImg ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={thumbPv.url!}
          alt=""
          width={isPrimary ? 96 : 72}
          height={isPrimary ? 96 : 72}
          draggable={false}
          onError={() => setBroken(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <div
          style={{
            fontSize: 9,
            color: "#64748b",
            padding: 4,
            lineHeight: 1.2,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            gap: 2,
          }}
        >
          <span style={{ fontWeight: 700 }}>{truncateMiddleClient(filename, 22)}</span>
          <span style={{ color: "#94a3b8" }}>{broken ? "preview failed" : thumbPv.caption || thumbPv.reason || "no preview"}</span>
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
          Главное
        </span>
      ) : roleBadge ? (
        <span
          style={{
            position: "absolute",
            bottom: 2,
            left: 2,
            right: 2,
            fontSize: 8,
            fontWeight: 700,
            color: "#fff",
            background: borrowedLabel ? "rgba(180,83,9,0.92)" : "rgba(15,23,42,0.78)",
            padding: "1px 4px",
            borderRadius: 4,
            textAlign: "center",
            lineHeight: 1.15,
          }}
          title={borrowedLabel ?? roleBadge}
        >
          {roleBadge}
        </span>
      ) : null}
    </div>
  )
}

function boardThumbPreview(
  mediaId: string,
  inv: InvItem | undefined,
  seedRows: SeedUrlMatchRow[]
): { url: string | null; useImg: boolean; caption: string; reason: string } {
  if (inv) {
    const pv = clientPreviewUrl(inv)
    if (pv.url) return { ...pv, reason: "" }
    const seedRow = seedRows.find((r) => r.invId === mediaId)
    if (seedRow?.seedUrl) {
      return { url: seedRow.seedUrl, useImg: true, caption: "", reason: "seed storefront URL (inventory preview unavailable)" }
    }
    return { url: null, useImg: false, caption: pv.caption, reason: unpreviewableHumanReason(inv) }
  }
  const seedRow = seedRows.find((r) => r.invId === mediaId)
  if (seedRow?.seedUrl) {
    return { url: seedRow.seedUrl, useImg: true, caption: "", reason: "seed storefront URL (id not in inventory map)" }
  }
  return {
    url: null,
    useImg: false,
    caption: "Missing inventory row",
    reason: `Media id "${mediaId}" not found in inventory map`,
  }
}

function promptVariantRename(currentLabel: string): string | null {
  const next = window.prompt("Название варианта цвета", currentLabel)
  if (next === null) return null
  const t = next.trim()
  return t.length > 0 ? t : null
}

type SuggestionPrefLite = {
  useLegacyName: boolean
  displayLabel?: string | null
  displayLabelEdited?: boolean
}

function resolveSuggestionDisplayLabel(
  suggestion: SuggestedVariant,
  enrichment: LegacyColorEnrichmentWithIndex | null,
  prefs: SuggestionPrefLite,
  confirmed: VariantDecisionState | null | undefined,
  productSkuHint: string
): string {
  if (confirmed?.labelEditedByUser && confirmed.label?.trim()) {
    return confirmed.label.trim()
  }
  if (confirmed?.labelStatus === "user_edited" && confirmed.label?.trim()) {
    return confirmed.label.trim()
  }
  if (confirmed) {
    return withResolvedVariantLabel(suggestion.variantKey, confirmed, {
      legacyColorName: enrichment?.legacy_color_name,
      productSkuHint,
    }).label
  }
  if (prefs.displayLabelEdited && prefs.displayLabel?.trim()) return prefs.displayLabel.trim()
  if (prefs.useLegacyName && enrichment?.legacy_color_name?.trim()) return enrichment.legacy_color_name.trim()
  return resolveVariantDisplayLabel({
    variantKey: suggestion.variantKey,
    persistedLabel: prefs.displayLabel ?? suggestion.label,
    legacyColorName: enrichment?.legacy_color_name,
    productSkuHint,
    seedImageUrls: suggestion.seedImageUrls,
  }).displayLabel
}

function toZoneState(v: VariantDecisionState): ProductZoneState {
  return { primary: v.primary, gallery: [...v.gallery], reference_only: [...v.reference], lane_rejected: [...v.rejected] }
}

function fromZoneState(z: ProductZoneState, label = LABEL_NEEDS_REVIEW_RU, extras?: Partial<VariantDecisionState>): VariantDecisionState {
  return {
    ...emptyVariant(label, extras),
    primary: z.primary,
    gallery: [...z.gallery],
    reference: [...z.reference_only],
    rejected: [...z.lane_rejected],
    primaryManualOverride: extras?.primaryManualOverride,
    primaryAutoPicked: extras?.primaryAutoPicked,
    primaryNeedsReview: extras?.primaryNeedsReview,
  }
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

function mediaCanAppendToAllGalleries(
  inv: InvItem | undefined,
  ce: CandidateEntry | undefined,
  handle: string,
  sku: string,
  colorVariantCount: number
): { ok: boolean; hint: string } {
  if (!handle) return { ok: false, hint: "Сначала выберите товар" }
  if (colorVariantCount < 2) return { ok: false, hint: "Нет подтверждённых цветов для массового добавления" }
  if (!inv?.previewable) return { ok: false, hint: "Фото без preview — действие недоступно" }
  const identity = classifyMediaProductIdentity(inv, ce, handle, sku)
  if (identity.tier === "excluded") return { ok: false, hint: "Чужой SKU — нельзя добавить во все галереи" }
  if (identity.tier === "needs_identity_review") return { ok: false, hint: "Нужна проверка identity" }
  return { ok: true, hint: "Добавить в конец галереи каждого цвета этого SKU" }
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

function legacyArticleStatusLabel(status: string): string {
  if (status === "found") return "Артикул найден"
  if (status === "not_found") return "Артикул не найден"
  if (status === "legacy_fetch_unreachable") return "Старый сайт недоступен"
  if (status === "hover_required") return "Нужен hover"
  if (status === "parse_failed") return "Ошибка разбора"
  if (status === "pending") return "Проверяем…"
  return status
}

function legacyArticleCardLine(status: string, article: string | null): string {
  if (status === "found" && article) return article
  return legacyArticleStatusLabel(status)
}

function legacyArticleIndexedUiLine(enc: LegacyColorEnrichmentWithIndex | null): string {
  if (!enc) return "—"
  if (enc.indexed_article_ui) return enc.indexed_article_ui
  if (enc.indexed_article_status === "found" && enc.legacy_color_article) {
    const m = enc.legacy_article_source_method || enc.source_method
    return `${enc.legacy_color_article}${m ? ` · ${m}` : ""}`
  }
  if (enc.indexed_article_status === "not_found_on_pdp") return "not found on matched PDP"
  if (enc.indexed_article_status === "pdp_cache_missing") return "PDP cache missing"
  if (enc.indexed_article_status === "multiple_candidates") return "multiple candidates"
  if (enc.indexed_article_status === "listing_only") return "listing only (no PDP swatches)"
  if (enc.indexed_article_status === "no_pdp_match") return "no PDP match"
  return legacyArticleCardLine(enc.legacy_color_article_status, enc.legacy_color_article)
}

function canUseIndexedArticle(enc: LegacyColorEnrichmentWithIndex | null): boolean {
  return Boolean(
    enc &&
      enc.legacy_color_article &&
      enc.legacy_color_article_status === "found" &&
      enc.indexed_article_status !== "listing_only" &&
      enc.indexed_pdp_url
  )
}

function pathNamesSelectedProduct(hay: string, selectedHandle: string, selectedSku: string): boolean {
  const h = normHandle(selectedHandle)
  const sku = normSku(selectedSku)
  if (hay.includes(h)) return true
  if (sku && hay.replace(/-/g, "").includes(sku.replace(/-/g, ""))) return true
  return false
}

function extractColorToken(inv: InvItem, selectedHandle: string, selectedSku: string): string | null {
  const hay = `${inv.filename} ${inv.source_path || ""} ${inv.repo_relative_path || ""}`.toLowerCase()
  const m = hay.match(/(?:color|colour)[_-]([a-z0-9-]+)/)
  if (m?.[1]) return m[1]
  const explicit = explicitProductTokenFromMedia(inv)
  const h = normHandle(selectedHandle)
  if (explicit && explicit !== h && explicit !== normSku(selectedSku)) return null
  if (!pathNamesSelectedProduct(hay, selectedHandle, selectedSku)) return null
  const m2 = hay.match(
    /(?:^|[-_])(blue|grey|gray|cream|milk|olive|green|white|beige|black|brown|graphite|ivory)(?:[-_.]|$)/i
  )
  return m2?.[1]?.toLowerCase() ?? null
}

/** Default / milk / cream variant — filename first; seed only for neutral gallery hints (never blue/grey). */
function inferDefaultColorToken(seedUrls: string[], filenames: string[]): string | null {
  const hay = filenames.join(" ").toLowerCase()
  if (/milk|молоч/i.test(hay)) return "milk"
  if (/cream|крем|ivory|молок/i.test(hay)) return "cream"
  if (/_gallery_\d+/i.test(hay)) return "cream"
  if (/[-_]iso[-_]?\d|hero|main/i.test(hay)) return "cream"
  if (/[-_]i\d+$/i.test(hay)) return "milk"
  const seedHay = seedUrls.join(" ").toLowerCase()
  if (/milk|молоч/i.test(seedHay)) return "milk"
  if (/cream|крем|ivory|молок/i.test(seedHay)) return "cream"
  if (/_gallery_|\/gallery_/i.test(seedHay)) return "cream"
  if (/white|бел/i.test(seedHay)) return "white"
  return null
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
  const [poolActionNote, setPoolActionNote] = useState<string>("")
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
  const [boardSyncPlan, setBoardSyncPlan] = useState<BoardSyncPlan | null>(null)
  const [syncPanelOpen, setSyncPanelOpen] = useState(false)
  type EnrichmentCacheEntry = { loading: boolean; data: LegacyColorEnrichmentWithIndex | null; error: string | null }
  const [enrichmentByKey, setEnrichmentByKey] = useState<Record<string, EnrichmentCacheEntry>>({})
  type SuggestionPref = {
    useLegacyName: boolean
    useLegacyArticle: boolean
    editedLegacyArticle: string | null
    chosenArticleCandidateIndex: number | null
    displayLabel?: string | null
    displayLabelEdited?: boolean
  }
  const [suggestionRowPrefs, setSuggestionRowPrefs] = useState<Record<string, SuggestionPref>>({})
  const [articleScanProgress, setArticleScanProgress] = useState<ArticleScanProgress | null>(null)
  const [articleScanRunning, setArticleScanRunning] = useState(false)
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
          seeded[handle] = {
            [DEFAULT_VARIANT_KEY]: fromZoneState(z, LABEL_NEEDS_REVIEW_RU, { sourceLabel: "default" }),
          }
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
        if (parsed.variantsByHandle && typeof parsed.variantsByHandle === "object") {
          const skuFor = (handle: string) =>
            products.find((p) => p.handle.toLowerCase() === handle.toLowerCase())?.sku?.trim() || ""
          const migratedVariants: VariantsByHandle = {}
          for (const [ph, row] of Object.entries(parsed.variantsByHandle)) {
            migratedVariants[ph] = {}
            const metaRow = parsed.variantMetaByHandle?.[ph] ?? {}
            for (const [vk, cell] of Object.entries(row)) {
              const meta = metaRow[vk]
              const prod = products.find((p) => p.handle.toLowerCase() === ph.toLowerCase())
              const labeled = {
                ...cell,
                ...migrateVariantLabelFields(vk, cell, {
                  legacyColorName: meta?.legacyColorName,
                  productSkuHint: skuFor(ph),
                  seedImageUrls: prod?.image_urls,
                }),
              }
              migratedVariants[ph][vk] = migrateVariantGalleryOrderOnLoad(labeled, meta?.status)
            }
          }
          setVariantsByHandle(migratedVariants)
        }
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
      try {
        const scanRaw = localStorage.getItem(LS_ARTICLE_SCAN_KEY)
        if (scanRaw) {
          const sp = JSON.parse(scanRaw) as { progress?: ArticleScanProgress }
          if (sp.progress) setArticleScanProgress(sp.progress)
        }
      } catch {
        /* ignore */
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

  const runBoardSyncPreview = useCallback(
    (scope: "current" | "collection") => {
      if (!invDoc?.items?.length) return
      const handles =
        scope === "current" && selectedHandle
          ? [selectedHandle.toLowerCase()]
          : productsFiltered.map((p) => p.handle.toLowerCase())
      const plan = buildBoardSyncPlan({
        products,
        invItems: invDoc.items,
        candById,
        variantsByHandle,
        variantMetaByHandle,
        rejectedSuggestedVariantsByHandle,
        productHandles: handles,
      })
      setBoardSyncPlan(plan)
      setSyncPanelOpen(true)
    },
    [
      invDoc,
      products,
      productsFiltered,
      selectedHandle,
      candById,
      variantsByHandle,
      variantMetaByHandle,
      rejectedSuggestedVariantsByHandle,
    ]
  )

  const applyBoardSync = useCallback(
    (scope: "current" | "collection", safeOnly: boolean) => {
      if (!boardSyncPlan) return
      const handles =
        scope === "current" && selectedHandle
          ? [selectedHandle.toLowerCase()]
          : boardSyncPlan.products.map((p) => p.handle)
      const msg = safeOnly
        ? `Применить только безопасные изменения (${handles.length} товаров)? Ручной порядок gallery и user labels не перезаписываются.`
        : `Применить изменения по правилам sync (${handles.length} товаров)? Primary/gallery обновятся где не защищено вручную.`
      if (!window.confirm(msg)) return

      const zonesPatch: Record<string, ProductZoneState> = {}
      setVariantsByHandle((prev) => {
        const next = { ...prev }
        for (const handle of handles) {
          const productPlan = boardSyncPlan.products.find((p) => p.handle === handle)
          if (!productPlan) continue
          const activeKey = activeVariantByHandle[handle] ?? null
          const result = applyProductSyncPlan({
            plan: productPlan,
            variants: next[handle] ?? {},
            activeVariantKey: activeKey,
            safeOnly,
          })
          next[handle] = result.variants as Record<string, VariantDecisionState>
          if (result.activeZonesMirror && activeKey && result.variants[activeKey]) {
            const prevZones = boardRef.current.zones[handle] ?? emptyZones()
            zonesPatch[handle] = {
              primary: result.activeZonesMirror.primary,
              gallery: [...result.activeZonesMirror.gallery],
              reference_only: [...prevZones.reference_only],
              lane_rejected: [...prevZones.lane_rejected],
            }
          }
        }
        return next
      })
      if (Object.keys(zonesPatch).length > 0) {
        setBoard((prev) => ({ ...prev, zones: { ...prev.zones, ...zonesPatch } }))
      }
      runBoardSyncPreview(scope)
      setDiag((d) => ({
        ...d,
        stateUpdateRequested: true,
        stateActuallyChanged: true,
        lastAction: `sync apply ${safeOnly ? "safe" : "all"} · ${handles.length} product(s)`,
        lastError: "",
      }))
    },
    [boardSyncPlan, selectedHandle, activeVariantByHandle, runBoardSyncPreview]
  )

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
          buttonHandlerFired: source === "button" || source === "assigned-button" || source === "selected-product-default" ? true : d.buttonHandlerFired,
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
      const phSku = productByHandle.get(hh)?.sku?.trim() || ""
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
        const prevChosen = prevH[chosenVariantKey]
        const metaChosen = variantMetaByHandle[hh]?.[chosenVariantKey]
        const labelForChosen = prevChosen
          ? withResolvedVariantLabel(chosenVariantKey, prevChosen, {
              legacyColorName: metaChosen?.legacyColorName,
              productSkuHint: phSku,
            }).label
          : resolveVariantDisplayLabel({
              variantKey: chosenVariantKey,
              legacyColorName: metaChosen?.legacyColorName,
              productSkuHint: phSku,
            }).displayLabel
        const manualPrimary = zone === "primary"
        hVariants[chosenVariantKey] = withManualGalleryOrder(
          fromZoneState(next.zones[hh] ?? emptyZones(), labelForChosen, {
            sourceLabel: prevChosen?.sourceLabel ?? sourceLabelForVariantKey(chosenVariantKey),
            labelEditedByUser: prevChosen?.labelEditedByUser,
            labelStatus: prevChosen?.labelStatus,
            primaryManualOverride: manualPrimary ? true : prevChosen?.primaryManualOverride ?? false,
            primaryAutoPicked: manualPrimary ? false : prevChosen?.primaryAutoPicked ?? false,
            primaryNeedsReview: manualPrimary ? false : prevChosen?.primaryNeedsReview ?? false,
            galleryOrderSource: prevChosen?.galleryOrderSource,
            galleryOrderLocked: prevChosen?.galleryOrderLocked,
          })
        )
        return { ...prevV, [hh]: hVariants }
      })
      if (zone !== "unassigned") {
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
        buttonHandlerFired: source === "button" || source === "assigned-button" || source === "selected-product-default" ? true : d.buttonHandlerFired,
        stateUpdateRequested: true,
        stateActuallyChanged: changed,
        lastAction: `${source} -> ${zone}`,
        lastError: changed ? "" : "state unchanged",
        source,
        mediaId: inventoryId,
        productHandle: activeHandle,
        fromZone:
          diagFromZone ??
          (source === "button"
            ? "pool"
            : source === "assigned-button"
              ? "assigned_lane"
              : source === "selected-product-default"
                ? "storefront_seed_strip"
                : d.fromZone),
        targetZone: zone,
        dragSource: source,
        variantKey: chosenVariantKey,
      }))
      return changed
    },
    [board, selectedHandle, activeVariantByHandle, productByHandle]
  )

  const appendMediaToAllVariantGalleriesForHandle = useCallback(
    (mediaId: string) => {
      const activeHandle = selectedHandle?.trim()
      if (!activeHandle) {
        const msg = "Select product first"
        setPoolActionNote(msg)
        setDiag((d) => ({
          ...d,
          buttonHandlerFired: true,
          stateUpdateRequested: true,
          stateActuallyChanged: false,
          lastAction: "add-to-all-variant-galleries blocked",
          lastError: msg,
          source: "add-to-all-variant-galleries",
          mediaId,
          productHandle: "",
          fromZone: "pool",
          targetZone: "all_variant_galleries",
        }))
        return false
      }
      const hh = activeHandle.toLowerCase()
      const inv = invById.get(mediaId)
      const phSku = productByHandle.get(hh)?.sku?.trim() || ""
      if (!inv) return false
      if (!inv.previewable) {
        const msg = "Фото без preview — массовое добавление недоступно"
        setPoolActionNote(msg)
        setDiag((d) => ({
          ...d,
          buttonHandlerFired: true,
          stateUpdateRequested: true,
          stateActuallyChanged: false,
          lastAction: "add-to-all-variant-galleries blocked",
          lastError: msg,
          source: "add-to-all-variant-galleries",
          mediaId,
          productHandle: activeHandle,
          fromZone: "pool",
          targetZone: "all_variant_galleries",
        }))
        return false
      }
      const identity = classifyMediaProductIdentity(inv, candById.get(mediaId), activeHandle, phSku)
      if (identity.tier === "excluded") {
        const msg = "Чужой SKU — нельзя добавить во все галереи"
        setPoolActionNote(msg)
        setDiag((d) => ({
          ...d,
          buttonHandlerFired: true,
          stateUpdateRequested: true,
          stateActuallyChanged: false,
          lastAction: "add-to-all-variant-galleries blocked",
          lastError: msg,
          source: "add-to-all-variant-galleries",
          mediaId,
          productHandle: activeHandle,
          fromZone: "pool",
          targetZone: "all_variant_galleries",
        }))
        return false
      }
      if (identity.tier === "needs_identity_review") {
        const msg = "Нужна проверка identity перед массовым добавлением"
        setPoolActionNote(msg)
        setDiag((d) => ({
          ...d,
          buttonHandlerFired: true,
          stateUpdateRequested: true,
          stateActuallyChanged: false,
          lastAction: "add-to-all-variant-galleries blocked",
          lastError: msg,
          source: "add-to-all-variant-galleries",
          mediaId,
          productHandle: activeHandle,
          fromZone: "pool",
          targetZone: "all_variant_galleries",
        }))
        return false
      }

      const current = variantsByHandle[hh] ?? {}
      if (countBulkGalleryVariants(current) < 2) {
        const msg = "Нет подтверждённых цветов для массового добавления (нужно ≥2)"
        setPoolActionNote(msg)
        setDiag((d) => ({
          ...d,
          buttonHandlerFired: true,
          stateUpdateRequested: true,
          stateActuallyChanged: false,
          lastAction: "add-to-all-variant-galleries blocked",
          lastError: msg,
          source: "add-to-all-variant-galleries",
          mediaId,
          productHandle: activeHandle,
          fromZone: "pool",
          targetZone: "all_variant_galleries",
        }))
        return false
      }

      const result = appendMediaToAllVariantGalleries(current, mediaId)
      setPoolActionNote(formatAppendToAllGalleriesNote(result))

      if (!result.changed) {
        setDiag((d) => ({
          ...d,
          buttonHandlerFired: true,
          stateUpdateRequested: true,
          stateActuallyChanged: false,
          lastAction: "add-to-all-variant-galleries noop",
          lastError: result.already.length ? "already present" : "no eligible variants",
          source: "add-to-all-variant-galleries",
          mediaId,
          productHandle: activeHandle,
          fromZone: "pool",
          targetZone: "all_variant_galleries",
          variantKey: result.already.map((r) => r.variantKey).join(","),
        }))
        return false
      }

      setVariantsByHandle((prev) => ({
        ...prev,
        [hh]: result.nextVariants as Record<string, VariantDecisionState>,
      }))
      setVariantMetaByHandle((prevMeta) => {
        const row = { ...(prevMeta[hh] ?? {}) }
        for (const added of result.added) {
          row[added.variantKey] = mergeVariantMeta(row[added.variantKey], phSku, {
            reasons: row[added.variantKey]?.reasons?.length ? row[added.variantKey]!.reasons : ["add to all variant galleries"],
            status: "edited",
          })
        }
        return { ...prevMeta, [hh]: row }
      })
      setDiag((d) => ({
        ...d,
        buttonHandlerFired: true,
        stateUpdateRequested: true,
        stateActuallyChanged: true,
        lastAction: `add-to-all-variant-galleries +${result.added.length}`,
        lastError: "",
        source: "add-to-all-variant-galleries",
        mediaId,
        productHandle: activeHandle,
        fromZone: "pool",
        targetZone: "all_variant_galleries",
        variantKey: result.added.map((a) => a.variantKey).join(","),
      }))
      return true
    },
    [selectedHandle, invById, candById, variantsByHandle, productByHandle]
  )

  const updateVariantDecision = useCallback(
    (
      handle: string,
      variantKey: string,
      updater: (prev: VariantDecisionState) => VariantDecisionState,
      action: string,
      mediaId: string,
      diagCtx?: { fromZone?: string; targetZone?: string; source?: ActionSource }
    ) => {
      const hh = handle.toLowerCase()
      let noop = false
      setVariantsByHandle((prev) => {
        const variants =
          prev[hh] ?? {
            [DEFAULT_VARIANT_KEY]: fromZoneState(boardRef.current.zones[hh] ?? emptyZones(), LABEL_NEEDS_REVIEW_RU, {
              sourceLabel: "default",
            }),
          }
        const prevVariant =
          variants[variantKey] ??
          emptyVariant(variantKey === DEFAULT_VARIANT_KEY ? LABEL_NEEDS_REVIEW_RU : variantKey)
        let nextVariant = updater(prevVariant)
        if (galleryOrderTouched(prevVariant, nextVariant)) {
          nextVariant = withManualGalleryOrder(nextVariant)
        }
        if (variantDecisionEqual(prevVariant, nextVariant)) {
          noop = true
          return prev
        }
        const activeVk = activeVariantByHandle[hh] || DEFAULT_VARIANT_KEY
        if (variantKey === activeVk) {
          setBoard((boardPrev) => ({
            ...boardPrev,
            zones: {
              ...boardPrev.zones,
              [hh]: toZoneState(nextVariant),
            },
          }))
        }
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
        source: diagCtx?.source ?? "assigned-button",
        mediaId,
        productHandle: handle,
        fromZone: diagCtx?.fromZone ?? "variant_lane",
        targetZone: diagCtx?.targetZone ?? "variant_workspace",
        dragSource: "variant",
        variantKey,
      }))
    },
    [productByHandle, activeVariantByHandle]
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
          ...(prevV[hh] ?? {
            [DEFAULT_VARIANT_KEY]: fromZoneState(board.zones[hh] ?? emptyZones(), LABEL_NEEDS_REVIEW_RU, { sourceLabel: "default" }),
          }),
          [vk]: withManualGalleryOrder({
            ...(prevV[hh]?.[vk] ?? emptyVariant(vk === DEFAULT_VARIANT_KEY ? LABEL_NEEDS_REVIEW_RU : vk)),
            ...fromZoneState(base, prevV[hh]?.[vk]?.label || LABEL_NEEDS_REVIEW_RU, {
              sourceLabel: prevV[hh]?.[vk]?.sourceLabel,
              labelEditedByUser: prevV[hh]?.[vk]?.labelEditedByUser,
              primaryManualOverride: prevV[hh]?.[vk]?.primaryManualOverride,
              primaryAutoPicked: prevV[hh]?.[vk]?.primaryAutoPicked,
              primaryNeedsReview: prevV[hh]?.[vk]?.primaryNeedsReview,
            }),
          }),
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
      variant_decisions: serializeVariantDecisionsForExport(variantsByHandle, sourceLabelForVariantKey),
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
  const bulkColorVariantCount = useMemo(
    () => (selectedHandle ? countBulkGalleryVariants(variantsByHandle[selectedHandle.toLowerCase()]) : 0),
    [selectedHandle, variantsByHandle]
  )
  const selectedProductSku = selectedHandle ? productByHandle.get(selectedHandle.toLowerCase())?.sku?.trim() || "" : ""
  const poolOverflow = poolIdsForTabFocused.length - poolShown.length

  const collectionLabel = useMemo(() => {
    if (sidebarCollection === UNKNOWN_COLLECTION) return "Unknown / unmatched hints"
    if (!sidebarCollection) return "All collections"
    return sidebarCollection.replace(/-/g, " ")
  }, [sidebarCollection])

  const selectedProduct = selectedHandle ? productByHandle.get(selectedHandle.toLowerCase()) ?? null : null

  const buildSuggestedVariantsForProduct = useCallback(
    (handle: string): SuggestedVariant[] => {
      if (!invDoc?.items?.length) return []
      const h = handle.toLowerCase()
      const built = buildSuggestedVariantsForProductSync({
        handle: h,
        product: productByHandle.get(h) ?? null,
        invItems: invDoc.items,
        candById,
        variantsByHandle: variantsByHandle[h],
        rejectedVariantKeys: rejectedSuggestedVariantsByHandle[h],
      })
      return built.sort((a, b) => {
        if (a.identityTier !== b.identityTier) return a.identityTier === "this_sku" ? -1 : 1
        const order = (vk: string) => {
          if (vk.includes("cream") || vk.includes("milk") || vk.includes("white") || vk.includes("needs_review")) return 0
          if (vk.includes("blue")) return 1
          if (vk.includes("grey") || vk.includes("gray")) return 2
          return 3
        }
        const oa = order(a.variantKey)
        const ob = order(b.variantKey)
        if (oa !== ob) return oa - ob
        return b.mediaIds.length - a.mediaIds.length
      })
    },
    [rejectedSuggestedVariantsByHandle, invDoc, candById, productByHandle, variantsByHandle]
  )

  const suggestedVariantsForSelected = useMemo<SuggestedVariant[]>(() => {
    if (!selectedHandle) return []
    return buildSuggestedVariantsForProduct(selectedHandle)
  }, [selectedHandle, buildSuggestedVariantsForProduct])

  const runArticleScan = useCallback(
    async (targetProducts: ProductRow[]) => {
      if (!invDoc || targetProducts.length === 0) return
      setArticleScanRunning(true)
      setArticleScanProgress({
        started_at: new Date().toISOString(),
        finished_at: null,
        pdp_pages_scanned: 0,
        swatches_found: 0,
        articles_matched: 0,
        suggestions_enriched: 0,
        needs_review: 0,
        missing_pdp_cache: 0,
        listing_only_skipped: 0,
      })
      const suggestions = targetProducts.flatMap((p) => {
        const h = p.handle.toLowerCase()
        return buildSuggestedVariantsForProduct(h)
          .filter((s) => s.identityTier === "this_sku")
          .map((s) => ({
            product_handle: h,
            product_sku_hint: (p.sku || "").trim(),
            variant_key: s.variantKey,
            color_token: s.colorNameRaw,
            filename_color_token: s.filenameColorToken,
            candidate_map_sku: s.candidateMapSku,
            candidate_urls: s.candidatePageUrls.map((c) => ({ url: c.url, source: c.source })),
          }))
      })
      try {
        const res = await fetch(`${API_BASE}/legacy-color-article-index`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "scan", suggestions }),
        })
        const j = (await res.json()) as {
          progress?: ArticleScanProgress
          results?: Record<string, LegacyColorEnrichmentWithIndex>
          error?: string
        }
        if (!res.ok) throw new Error(j.error || `http_${res.status}`)
        if (j.progress) {
          setArticleScanProgress(j.progress)
          try {
            localStorage.setItem(LS_ARTICLE_SCAN_KEY, JSON.stringify({ progress: j.progress, at: new Date().toISOString() }))
          } catch {
            /* ignore */
          }
        }
        if (j.results) {
          setEnrichmentByKey((prev) => {
            const next = { ...prev }
            for (const [key, data] of Object.entries(j.results!)) {
              next[key] = { loading: false, data, error: null }
              enrichLoadedRef.current.add(key)
            }
            return next
          })
        }
      } catch (e) {
        setDiag((d) => ({
          ...d,
          lastError: e instanceof Error ? e.message : String(e),
          lastAction: "article scan failed",
        }))
      } finally {
        setArticleScanRunning(false)
      }
    },
    [invDoc, buildSuggestedVariantsForProduct]
  )

  /** Seed storefront URLs → legacy inventory ids (path/filename), for badges + auto-draft. */
  const seedMatchRowsForSelected = useMemo((): SeedUrlMatchRow[] => {
    if (!selectedHandle || !selectedProduct || !invDoc?.items?.length) return []
    return matchAllSeedUrls(selectedProduct.image_urls, selectedHandle, selectedProduct.sku || "", invDoc.items)
  }, [selectedHandle, selectedProduct, invDoc])

  const seedInvIdsMatchedFromStorefront = useMemo(() => {
    if (!selectedHandle || !selectedProduct || !invDoc?.items?.length) return new Set<string>()
    const ids = orderedInventoryIdsFromSeedUrls(
      selectedProduct.image_urls,
      selectedHandle,
      selectedProduct.sku || "",
      invDoc.items
    )
    return new Set(ids)
  }, [selectedHandle, selectedProduct, invDoc])

  /** When Default variant is active and all lanes are empty, mirror storefront seed order into Primary+Gallery using matched inventory ids. */
  useEffect(() => {
    if (!hydrated || !selectedHandle || !invDoc?.items?.length || !selectedProduct?.image_urls?.length) return
    const hh = selectedHandle.toLowerCase()
    const activeVk = (activeVariantByHandle[hh] || DEFAULT_VARIANT_KEY).trim()
    if (activeVk !== DEFAULT_VARIANT_KEY) return

    const variantRow = variantsByHandle[hh]
    if (variantRow) {
      for (const [vk, vv] of Object.entries(variantRow)) {
        if (vk !== DEFAULT_VARIANT_KEY && variantHasEstablishedGalleryOrder(vv)) return
      }
      const def = variantRow[DEFAULT_VARIANT_KEY]
      if (def && variantHasEstablishedGalleryOrder(def)) return
    }

    const z = board.zones[hh] ?? emptyZones()
    const empty =
      !z.primary && z.gallery.length === 0 && z.reference_only.length === 0 && z.lane_rejected.length === 0
    if (!empty) return

    const ordered = orderedInventoryIdsFromSeedUrls(
      selectedProduct.image_urls,
      hh,
      selectedProduct.sku || "",
      invDoc.items
    )
    if (ordered.length === 0) return

    const invMap = new Map(invDoc.items.map((it) => [it.id, it]))
    const media = buildVariantMediaFromCandidates(ordered, invMap, ordered, candById, null, undefined, {
      selectedSku: (selectedProduct.sku || "").trim(),
      colorToken: "",
    })
    const labelResolved = resolveVariantDisplayLabel({
      variantKey: DEFAULT_VARIANT_KEY,
      seedImageUrls: selectedProduct.image_urls,
      productSkuHint: (selectedProduct.sku || "").trim(),
    })
    const nextZones: ProductZoneState = {
      primary: media.primary,
      gallery: media.gallery,
      reference_only: [],
      lane_rejected: [],
    }
    setBoard((prev) => ({
      ...prev,
      zones: { ...prev.zones, [hh]: nextZones },
    }))
    setVariantsByHandle((prev) => ({
      ...prev,
      [hh]: {
        ...(prev[hh] ?? {}),
        [DEFAULT_VARIANT_KEY]: {
          ...fromZoneState(nextZones, labelResolved.displayLabel, {
            sourceLabel: labelResolved.sourceLabel,
            labelStatus: labelResolved.labelStatus,
            primaryAutoPicked: media.primaryAutoPicked,
            primaryNeedsReview: media.primaryNeedsReview,
            primaryManualOverride: false,
          }),
          galleryOrderSource: "seed",
          galleryOrderLocked: false,
        },
      },
    }))
  }, [hydrated, selectedHandle, selectedProduct, invDoc, board.zones, activeVariantByHandle, variantsByHandle])

  /** Mirror active variant lanes into product zones for drag/drop + legacy export compatibility. */
  useEffect(() => {
    if (!hydrated || !selectedHandle) return
    const hh = selectedHandle.toLowerCase()
    const vk = activeVariantByHandle[hh] || DEFAULT_VARIANT_KEY
    const vv = variantsByHandle[hh]?.[vk]
    if (!vv) return
    const nextZ = toZoneState(vv)
    const cur = board.zones[hh]
    if (
      cur &&
      cur.primary === nextZ.primary &&
      cur.gallery.length === nextZ.gallery.length &&
      cur.gallery.every((id, i) => id === nextZ.gallery[i])
    ) {
      return
    }
    setBoard((prev) => ({
      ...prev,
      zones: { ...prev.zones, [hh]: nextZ },
    }))
  }, [hydrated, selectedHandle, activeVariantByHandle, variantsByHandle, board.zones])

  useEffect(() => {
    enrichLoadedRef.current.clear()
    enrichInflight.current.clear()
  }, [selectedHandle])

  useEffect(() => {
    if (!selectedHandle || !selectedProduct?.sku) return
    let cancelled = false
    const h = selectedHandle.toLowerCase()
    const sku = (selectedProduct.sku || "").trim()
    for (const s of suggestedVariantsForSelected) {
      const sk = suggestionEnrichmentKey(h, s.variantKey)
      if (enrichInflight.current.has(sk) || enrichLoadedRef.current.has(sk)) continue
      enrichInflight.current.add(sk)
      setEnrichmentByKey((prev) => ({ ...prev, [sk]: { loading: true, data: prev[sk]?.data ?? null, error: null } }))
      void fetch(`${API_BASE}/enrich-color-article`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_handle: h,
          variant_key: s.variantKey,
          product_sku_hint: sku,
          color_token: s.colorNameRaw,
          filename_color_token: s.filenameColorToken,
          candidate_map_sku: s.candidateMapSku,
          candidate_urls: [
            ...s.candidatePageUrls,
            ...s.seedImageUrls.map((url) => ({ url, source: "seed_image_url_skipped_as_html" })),
          ],
        }),
      })
        .then(async (res) => {
          const j = (await res.json()) as LegacyColorEnrichmentWithIndex & { error?: string }
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
          minHeight: label ? 132 : 0,
          borderRadius: 14,
          border: hot ? "2px solid #2563eb" : label ? "1px dashed #cbd5e1" : "none",
          background: hot ? "#eff6ff" : label ? "#f8fafc" : "transparent",
          padding: label || hot ? 14 : 0,
          transition: "border 0.12s ease, background 0.12s ease",
        }}
      >
        {label || hot ? (
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: hot ? "#1d4ed8" : "#64748b",
              marginBottom: label ? 8 : 0,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {hot ? dropHint : label}
          </div>
        ) : null}
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
    size: "compact" | "normal" | "large" | "primary" | "gallery" = "compact"
  ) => {
    const inv = invById.get(id)
    const pv = boardThumbPreview(id, inv, seedMatchRowsForSelected)
    const vk = variantKeyForActions
    const vv = variantsForHandle[vk]
    const gi = zone === "gallery" ? (vv?.gallery.indexOf(id) ?? -1) : -1
    const ownerVk = findVariantKeyOwningMedia(variantsForHandle, id)
    const crossVariant = ownerVk !== null && ownerVk !== vk
    const assignSrc: ActionSource =
      selectedHandle?.toLowerCase() === handle.toLowerCase() && seedInvIdsMatchedFromStorefront.has(id)
        ? "selected-product-default"
        : "assigned-button"
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
        <VariantZoneControls
          zone={zone}
          id={id}
          handle={handle}
          vk={vk}
          gi={gi}
          assignSrc={assignSrc}
          isCurrentPrimary={vv?.primary === id}
          shieldBtn={shieldBtn}
          stopCardClick={stopCardClick}
          chipBtn={chipBtn}
          miniBtn={miniBtn}
          btnDangerChip={btnDangerChip}
          onInspect={() => setInspectorId(id)}
          onApply={(src, target, from) => applyAssignment(src, id, target, handle, vk, from)}
          onUpdateGallery={(mut) =>
            updateVariantDecision(
              handle,
              vk,
              (prev) => mut(prev) as VariantDecisionState,
              "gallery lane action",
              id,
              {
                fromZone: zone === "gallery" ? "gallery" : zone,
                targetZone: "gallery_reorder",
                source: assignSrc,
              }
            )
          }
          onSetPrimaryFromGallery={() =>
            updateVariantDecision(
              handle,
              vk,
              (prev) => ({
                ...prev,
                primary: id,
                gallery: prev.gallery.filter((x) => x !== id),
                primaryManualOverride: true,
                primaryAutoPicked: false,
                primaryNeedsReview: false,
              }),
              "set primary from gallery",
              id,
              { fromZone: "gallery", targetZone: "primary", source: assignSrc }
            )
          }
        />
        {crossVariant ? (
          <div style={{ marginTop: 6, fontSize: 10, color: "#b45309", lineHeight: 1.35 }}>
            Variant source: <strong>{ownerVk ? variantsForHandle[ownerVk]?.label || ownerVk : "—"}</strong>
            <button
              type="button"
              data-action-button="move-to-active-variant"
              style={{ ...miniBtn, marginTop: 4, width: "100%" }}
              title="Move this media into the currently active variant's Gallery"
              {...shieldBtn}
              onClick={stopCardClick(() => applyAssignment(assignSrc, id, "gallery", handle, vk, `other_variant:${ownerVk}`))}
            >
              Move to active variant (gallery)
            </button>
          </div>
        ) : null}
      </>
    )
    const cardInv = inv ?? stubInvForBoardThumb(id, pv.reason || pv.caption || "missing inventory row")
    const canDrag = Boolean(inv?.previewable ?? pv.useImg)
    const visualRole = inv ? classifyVisualRole(inv) : null
    const roleBadge = visualRole ? VISUAL_ROLE_BADGE_RU[visualRole] : null
    return (
      <MediaImageCard
        inventoryId={id}
        inv={cardInv}
        productHandle={handle}
        dataZone={zone}
        previewUrl={pv.url}
        useImg={pv.useImg}
        caption={pv.caption || pv.reason}
        sourcePath={cardInv.repo_relative_path || cardInv.source_path}
        sourceType={cardInv.source_type}
        confidenceLabel={candById.get(id)?.confidence || null}
        previewable={canDrag}
        badges={[
          ...(roleBadge ? [roleBadge] : []),
          ...(zone === "primary" ? ["Главное фото"] : []),
          ...(selectedHandle?.toLowerCase() === handle.toLowerCase() && seedInvIdsMatchedFromStorefront.has(id) ? ["storefront seed"] : []),
          ...(!inv ? ["missing inv map"] : []),
          ...(pv.reason ? ["preview fallback"] : []),
          "Assigned",
          ...(zone === "primary" ? [] : [zone]),
        ]}
        size={size}
        draggable={canDrag}
        isDragging={draggingMediaId === id}
        onDragStart={
          canDrag
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
        workspaceMinimal={size === "primary" || size === "gallery"}
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
    let safeCandN = 0
    let reviewCandN = 0
    if (coll === "oxford" || coll === "monchelsea") {
      for (const e of candDoc?.entries ?? []) {
        const it = invById.get(e.inventory_id)
        if (!it) continue
        const matchColl =
          (it.collection_hint || "").toLowerCase() === coll ||
          (e.top_candidate?.medusa_collection_handle || "").toLowerCase() === coll
        if (!matchColl) continue
        if (e.identity_confidence === "confirmed" || e.confidence === "confirmed") safeCandN++
        else if (e.identity_confidence === "ambiguous" || e.confidence === "ambiguous") reviewCandN++
      }
    }
    return { prodN, mediaN, assignedN, ambN, unassignedN, candRows, safeCandN, reviewCandN }
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
    const sku = (productByHandle.get(h)?.sku || "").trim()
    const rejected = new Set(rejectedSuggestedVariantsByHandle[h] ?? [])
    const variants = variantsByHandle[h] ?? {}
    for (const it of invDoc?.items ?? []) {
      const ce = candById.get(it.id)
      const identity = classifyMediaProductIdentity(it, ce, handle, sku)
      if (identity.tier !== "this_sku") continue
      const token = extractColorToken(it, handle, sku)
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

  const goToPreviousProduct = (fromHandle?: string) => {
    if (productsFiltered.length === 0) return
    const startIdx = fromHandle
      ? productsFiltered.findIndex((p) => p.handle.toLowerCase() === fromHandle.toLowerCase())
      : 0
    const i = (Math.max(0, startIdx) - 1 + productsFiltered.length) % productsFiltered.length
    setSelectedHandle(productsFiltered[i].handle)
  }

  const selectedWorkflowPhotosDone = Boolean(
    selectedHandle &&
      (() => {
        const hz = selectedHandle.toLowerCase()
        const z = board.zones[hz] ?? emptyZones()
        return Boolean(z.primary) || z.gallery.length > 0
      })()
  )
  const selectedWorkflowSuggestionsDone =
    Boolean(selectedHandle) && !productHasUnconfirmedSuggestions(selectedHandle)

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
          { n: 1, t: "Product", done: Boolean(selectedHandle) },
          { n: 2, t: "Photos", done: selectedWorkflowPhotosDone },
          { n: 3, t: "Suggestions", done: selectedWorkflowSuggestionsDone },
          { n: 4, t: "Export", done: exportReady },
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
      <details style={{ marginLeft: "auto" }}>
        <summary style={{ cursor: "pointer", fontSize: 10, color: "#94a3b8", fontWeight: 700 }}>Workflow debug</summary>
        <span style={{ fontSize: 11, color: "#64748b", marginLeft: 8 }}>
          {collectionLabel} · {selectedHandle || "—"} · slots {localDecisionSlots}
        </span>
      </details>
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
    const vByHandle =
      variantsByHandle[h] ??
      {
        [DEFAULT_VARIANT_KEY]: fromZoneState(board.zones[h] ?? emptyZones(), LABEL_NEEDS_REVIEW_RU, { sourceLabel: "default" }),
      }
    const vmByHandle = variantMetaByHandle[h] ?? {}
    const activeVariantKey = activeVariantByHandle[h] || Object.keys(vByHandle)[0] || DEFAULT_VARIANT_KEY
    const productSkuHint = (selectedProduct.sku || "").trim()
    const activeVariantMeta = vmByHandle[activeVariantKey] ?? null
    const activeVariant =
      vByHandle[activeVariantKey] ??
      emptyVariant(activeVariantKey === DEFAULT_VARIANT_KEY ? LABEL_NEEDS_REVIEW_RU : activeVariantKey)
    const activeResolved = withResolvedVariantLabel(activeVariantKey, activeVariant, {
      legacyColorName: activeVariantMeta?.legacyColorName,
      productSkuHint,
      seedImageUrls: selectedProduct.image_urls,
    })
    const activeVariantDisplay = activeResolved.label
    const activeLabelStatus = activeResolved.labelStatus
    const z = toZoneState(activeVariant)
    const removeVariantFromProduct = (vk: string) => {
      const vv = vByHandle[vk]
      if (!vv) return
      const hasMedia =
        Boolean(vv.primary) || vv.gallery.length > 0 || vv.reference.length > 0 || vv.rejected.length > 0
      if (hasMedia) {
        const ok = window.confirm(
          "У варианта есть назначенные медиа. Убрать вариант и вернуть медиа в неназначенные?"
        )
        if (!ok) return
      }
      setVariantsByHandle((prev) => {
        const row = { ...(prev[h] ?? {}) }
        delete row[vk]
        if (Object.keys(row).length === 0) {
          row[DEFAULT_VARIANT_KEY] = fromZoneState(emptyZones(), LABEL_NEEDS_REVIEW_RU, { sourceLabel: "default" })
        }
        return { ...prev, [h]: row }
      })
      setVariantMetaByHandle((prev) => {
        const row = { ...(prev[h] ?? {}) }
        delete row[vk]
        return { ...prev, [h]: row }
      })
      if (activeVariantKey === vk) {
        const remaining = Object.keys(vByHandle).filter((k) => k !== vk)
        const nextVk = remaining[0] ?? DEFAULT_VARIANT_KEY
        const nextVariant =
          vByHandle[nextVk] ?? fromZoneState(emptyZones(), LABEL_NEEDS_REVIEW_RU, { sourceLabel: "default" })
        setBoard((prev) => ({
          ...prev,
          zones: { ...prev.zones, [h]: toZoneState(nextVariant) },
        }))
        setActiveVariantByHandle((prev) => ({ ...prev, [h]: nextVk }))
      }
      setDiag((d) => ({
        ...d,
        buttonHandlerFired: true,
        stateUpdateRequested: true,
        stateActuallyChanged: true,
        lastAction: `remove variant ${vk}`,
        lastError: "",
      }))
    }
    const candCount = entryList.filter((e) => e.top_candidate?.medusa_product_handle.toLowerCase() === h).length
    const safeSuggestions = suggestedVariantsForSelected.filter((s) => s.identityTier === "this_sku")
    const reviewSuggestions = suggestedVariantsForSelected.filter((s) => s.identityTier === "needs_identity_review")
    const suggestions = safeSuggestions.filter((s) => !vByHandle[s.variantKey])
    const totalSuggestions = safeSuggestions.length
    const confirmedSuggestionCount = safeSuggestions.filter((s) => Boolean(vByHandle[s.variantKey])).length
    const leftSuggestionCount = Math.max(0, totalSuggestions - confirmedSuggestionCount)
    const allSuggestionsReviewed = totalSuggestions > 0 && leftSuggestionCount === 0
    const galleryItemCount = (z.primary ? 1 : 0) + z.gallery.length
    const confirmedVariantCount = Object.keys(vByHandle).filter((vk) => vk !== DEFAULT_VARIANT_KEY || galleryItemCount > 0).length

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
        const prefs = suggestionRowPrefs[sk] ?? {
          useLegacyName: false,
          useLegacyArticle: false,
          editedLegacyArticle: null,
          chosenArticleCandidateIndex: null,
        }
        const existing = vByHandle[s.variantKey]
        const existingMeta = variantMetaByHandle[h]?.[s.variantKey]
        const labelResolved =
          existing?.labelEditedByUser && existing.label?.trim()
            ? existing.label.trim()
            : resolveSuggestionDisplayLabel(s, enc, prefs, existing ?? null, s.productSkuHint)
        const candidateIds = [s.primaryCandidateId, ...s.galleryCandidateIds].filter(Boolean) as string[]
        const invMap = new Map((invDoc?.items ?? []).map((it) => [it.id, it]))
        if (existing && variantHasEstablishedGalleryOrder(existing, existingMeta?.status)) {
          variantUpdates[s.variantKey] = {
            ...existing,
            label: labelResolved,
            sourceLabel: existing.sourceLabel ?? sourceLabelForVariantKey(s.variantKey),
            labelEditedByUser: Boolean(prefs.displayLabelEdited) || existing.labelEditedByUser,
            labelStatus: prefs.displayLabelEdited
              ? "user_edited"
              : existing.labelStatus ??
                resolveVariantDisplayLabel({
                  variantKey: s.variantKey,
                  legacyColorName: enc?.legacy_color_name,
                  productSkuHint: s.productSkuHint,
                }).labelStatus,
          }
        } else {
          const colorTok = s.colorNameRaw && s.colorNameRaw !== "needs_review" ? s.colorNameRaw : ""
          const media = buildVariantMediaFromCandidates(
            candidateIds,
            invMap,
            candidateIds,
            candById,
            existing ?? null,
            existingMeta?.status,
            { selectedSku: s.productSkuHint, colorToken: colorTok }
          )
          variantUpdates[s.variantKey] = {
            label: labelResolved,
            sourceLabel: sourceLabelForVariantKey(s.variantKey),
            labelEditedByUser: Boolean(prefs.displayLabelEdited),
            labelStatus: prefs.displayLabelEdited
              ? "user_edited"
              : resolveVariantDisplayLabel({
                  variantKey: s.variantKey,
                  legacyColorName: enc?.legacy_color_name,
                  productSkuHint: s.productSkuHint,
                  seedImageUrls: s.seedImageUrls,
                }).labelStatus,
            primary: media.primary ?? s.primaryCandidateId,
            gallery: media.gallery.length ? media.gallery : [...s.galleryCandidateIds],
            reference: existing?.reference ?? [],
            rejected: existing?.rejected ?? [],
            primaryManualOverride: media.primaryManualOverride,
            primaryAutoPicked: media.primaryAutoPicked,
            primaryNeedsReview: media.primaryNeedsReview,
            galleryOrderSource: media.galleryOrderSource,
            galleryOrderLocked: media.galleryOrderLocked,
          }
        }
        metaUpdates[s.variantKey] = variantMetaFromEnrichmentAndSuggestion({
          productSkuHint: s.productSkuHint,
          filenameColorToken: s.filenameColorToken,
          candidateMapSku: s.candidateMapSku,
          suggestionReasons: s.reasons,
          suggestionConfidence: s.confidence,
          suggestionSourcePathHints: s.sourcePathHints,
          suggestionSourceUrl: s.sourceUrl,
          enrichment: enc,
          useLegacyName: prefs.useLegacyName,
          useLegacyArticle: enc?.legacy_color_article_status === "found" ? prefs.useLegacyArticle : false,
          editedLegacyArticle: prefs.editedLegacyArticle,
          status: "confirmed",
        })
      }
      const lastKey = arr[arr.length - 1]?.variantKey
      const lastState = lastKey ? variantUpdates[lastKey] : null
      setVariantsByHandle((prev) => ({
        ...prev,
        [h]: { ...(prev[h] ?? {}), ...variantUpdates },
      }))
      setVariantMetaByHandle((prev) => ({
        ...prev,
        [h]: { ...(prev[h] ?? {}), ...metaUpdates },
      }))
      if (lastState) {
        setBoard((prev) => ({
          ...prev,
          zones: {
            ...prev.zones,
            [h]: {
              primary: lastState.primary,
              gallery: [...lastState.gallery],
              reference_only: [],
              lane_rejected: [],
            },
          },
        }))
      }
      if (lastKey) setActiveVariantByHandle((prev) => ({ ...prev, [h]: lastKey }))
      setDiag((d) => ({
        ...d,
        stateUpdateRequested: true,
        stateActuallyChanged: true,
        lastAction: `confirm ${arr.length} suggestion${arr.length === 1 ? "" : "s"} for variant`,
        lastError: "",
      }))
    }
    const confirmAllVisible = () => confirmAllForSuggestions(suggestions.filter((s) => s.identityTier === "this_sku"))
    const confirmHighConfidence = () =>
      confirmAllForSuggestions(suggestions.filter((s) => s.identityTier === "this_sku" && s.confidence === "high"))
    const totalDuplicatesHidden = suggestions.reduce((n, s) => n + (s.duplicateHiddenCount || 0), 0)
    const skipCurrentProduct = () => {
      goToNextProductWithSuggestions(h)
    }
    const variantLaneIds = new Set([...(z.primary ? [z.primary] : []), ...z.gallery])
    const seedRowsPendingAssign = seedMatchRowsForSelected.filter((r) => r.invId && !variantLaneIds.has(r.invId))
    const seedRowsOnlyNoInv = seedMatchRowsForSelected.filter((r) => !r.invId)
    const showCompactSeedBlock =
      selectedProduct.image_urls.length > 0 && (seedRowsPendingAssign.length > 0 || seedRowsOnlyNoInv.length > 0)

    const productIdx = productsFiltered.findIndex((p) => p.handle.toLowerCase() === h)
    const productOrdinal = productIdx >= 0 ? productIdx + 1 : 0
    const productTotal = productsFiltered.length
    const currentProductSyncPlan = boardSyncPlan?.products.find((p) => p.handle === h) ?? null
    const syncSummary = boardSyncPlan?.summary

    return (
      <section
        data-review-canvas="true"
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
        <div
          data-review-cockpit="true"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 12px",
            borderRadius: 10,
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Review flow · step 4 next product</div>
            <div style={{ fontSize: 13, color: "#475569", marginTop: 2 }}>
              <strong style={{ color: "#0f172a" }}>{collectionLabel}</strong>
              {" · "}
              <span style={{ color: "#64748b" }}>
                {productOrdinal} / {productTotal} товаров
              </span>
            </div>
          </div>
          <span
            data-product-review-status={allSuggestionsReviewed ? "ready" : "needs-review"}
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "4px 10px",
              borderRadius: 999,
              background: allSuggestionsReviewed ? "#dcfce7" : totalSuggestions === 0 ? "#f1f5f9" : "#fef3c7",
              color: allSuggestionsReviewed ? "#166534" : totalSuggestions === 0 ? "#64748b" : "#92400e",
            }}
          >
            {totalSuggestions === 0 ? "Готово" : allSuggestionsReviewed ? "Готово к экспорту" : "Нужна проверка"}
          </span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" style={miniBtn} onClick={() => goToPreviousProduct(h)} title="Предыдущий товар">
              ← Prev
            </button>
            <button type="button" style={btnPrimaryMini} onClick={() => goToNextProductWithSuggestions(h)} title="Следующий товар">
              Next →
            </button>
            <button type="button" style={miniBtn} onClick={skipCurrentProduct} title="Пропустить товар">
              Skip
            </button>
            <button
              type="button"
              data-action-button="board-sync-preview"
              style={{ ...miniBtn, borderColor: "#93c5fd", color: "#1d4ed8" }}
              title="Dry-run: identity + visual roles + dedupe + same-SKU borrow"
              onClick={() => runBoardSyncPreview("current")}
            >
              Синхронизировать по правилам
            </button>
          </div>
        </div>

        {syncPanelOpen && boardSyncPlan && syncSummary ? (
          <div
            data-board-sync-panel="true"
            style={{
              border: "1px solid #bfdbfe",
              borderRadius: 10,
              background: "#eff6ff",
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              minWidth: 0,
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
              <strong style={{ fontSize: 13, color: "#1e3a8a" }}>Sync preview · {boardSyncPlan.ruleVersion}</strong>
              <button type="button" style={{ ...miniBtn, padding: "2px 8px" }} onClick={() => setSyncPanelOpen(false)}>
                Закрыть
              </button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 11, color: "#1e40af" }}>
              <span data-sync-count="products">{syncSummary.productsScanned} products</span>
              <span>· {syncSummary.variantsScanned} variants</span>
              <span>· {syncSummary.wouldChangeCount} would change</span>
              <span>· {syncSummary.safeToApplyCount} safe</span>
              <span>· {syncSummary.protectedManualOrders} protected order</span>
              <span>· {syncSummary.duplicatesHidden} dupes hidden</span>
              <span>· {syncSummary.borrowedSameSkuRoles} borrowed roles</span>
              <span>· {syncSummary.needsIdentityReviewMedia} identity review</span>
              <span>· {syncSummary.excludedOtherSku} excluded SKU</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <button type="button" style={miniBtn} onClick={() => runBoardSyncPreview("current")}>
                Preview · текущий товар
              </button>
              <button type="button" style={miniBtn} onClick={() => runBoardSyncPreview("collection")}>
                Preview · коллекция ({productsFiltered.length})
              </button>
              <button
                type="button"
                style={btnPrimaryMini}
                disabled={!currentProductSyncPlan}
                onClick={() => applyBoardSync("current", true)}
              >
                Apply safe · текущий
              </button>
              <button
                type="button"
                style={miniBtn}
                disabled={!currentProductSyncPlan}
                onClick={() => applyBoardSync("current", false)}
              >
                Apply all · текущий
              </button>
              <button type="button" style={miniBtn} onClick={() => applyBoardSync("collection", true)}>
                Apply safe · коллекция
              </button>
            </div>
            {currentProductSyncPlan ? (
              <div data-sync-product-diff="true" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {currentProductSyncPlan.variantItems
                  .filter((v) => v.wouldChange || v.hiddenDuplicates.length > 0 || v.borrowedSameSku.length > 0)
                  .map((v) => (
                    <details
                      key={v.variantKey}
                      data-sync-variant-key={v.variantKey}
                      style={{ background: "#fff", border: "1px solid #dbeafe", borderRadius: 8, padding: 8 }}
                    >
                      <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#0f172a" }}>
                        {v.displayLabel}{" "}
                        <span style={{ fontWeight: 500, color: "#64748b" }}>
                          {v.wouldChange ? "· изменится" : "· без изменений"}
                          {v.protectedManualOrder ? " · protected order" : ""}
                          {v.protectedLabel ? " · ручное имя" : ""}
                        </span>
                      </summary>
                      <div style={{ marginTop: 8, fontSize: 11, color: "#475569", lineHeight: 1.5 }}>
                        <div>
                          Primary: <code>{v.currentPrimary?.slice(0, 10) ?? "—"}</code> →{" "}
                          <code>{v.proposedPrimary?.slice(0, 10) ?? "—"}</code>
                        </div>
                        <div>
                          Gallery ({v.currentGallery.length} → {v.proposedGallery.length}):{" "}
                          {v.proposedGallery.slice(0, 6).map((id) => id.slice(0, 8)).join(", ")}
                          {v.proposedGallery.length > 6 ? "…" : ""}
                        </div>
                        {v.hiddenDuplicates.length > 0 ? (
                          <div>+{v.hiddenDuplicates.length} похожих скрыто</div>
                        ) : null}
                        {v.borrowedSameSku.length > 0 ? (
                          <div>
                            Borrowed: {v.borrowedSameSku.map((b) => `${b.role} из ${b.fromVariantLabel}`).join("; ")}
                          </div>
                        ) : null}
                        <details style={{ marginTop: 4 }}>
                          <summary style={{ cursor: "pointer", color: "#94a3b8" }}>reasons</summary>
                          <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                            {v.reasons.slice(0, 12).map((r, i) => (
                              <li key={i}>{r}</li>
                            ))}
                          </ul>
                        </details>
                      </div>
                    </details>
                  ))}
                {currentProductSyncPlan.excludedMediaIds.length > 0 ? (
                  <div style={{ fontSize: 11, color: "#64748b" }}>
                    Excluded other SKU: {currentProductSyncPlan.excludedMediaIds.length} media
                  </div>
                ) : null}
                {currentProductSyncPlan.needsIdentityReviewMediaIds.length > 0 ? (
                  <div style={{ fontSize: 11, color: "#92400e" }}>
                    Needs identity review: {currentProductSyncPlan.needsIdentityReviewMediaIds.length} media (Oxford_full_p* / Monchelsea_p* / weak match)
                  </div>
                ) : null}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: "#64748b" }}>Нет плана для текущего товара в этом preview scope.</div>
            )}
            <details>
              <summary style={{ cursor: "pointer", fontSize: 10, color: "#94a3b8" }}>Diagnostics JSON</summary>
              <pre
                style={{
                  marginTop: 6,
                  fontSize: 9,
                  maxHeight: 160,
                  overflow: "auto",
                  background: "#fff",
                  padding: 8,
                  borderRadius: 6,
                }}
              >
                {JSON.stringify(currentProductSyncPlan ?? syncSummary, null, 2)}
              </pre>
            </details>
          </div>
        ) : null}

        <header style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Товар</div>
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
            <details style={{ marginLeft: "auto" }}><summary style={{ fontSize: 10, color: "#94a3b8", cursor: "pointer" }}>Тех. сводка</summary><span style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.4 }}>
              Storefront seeds: <strong>{selectedProduct.image_urls.length}</strong> · matcher rows: <strong>{candCount}</strong> · assigned slots:{" "}
              <strong>{(z.primary ? 1 : 0) + z.gallery.length + z.reference_only.length + z.lane_rejected.length}</strong>
            </span></details>
          </div>
        </header>

        <details
          open={Object.keys(vByHandle).length > 1}
          style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 12, background: "#fff", minWidth: 0 }}
        >
          <summary style={{ cursor: "pointer", fontSize: 10, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Color variants & legacy article (advanced)
          </summary>
          <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.06em" }}>Active variant</span>
            <span style={{ fontSize: 11, color: "#475569" }}>
              Active: <strong>{activeVariantDisplay}</strong>
              {" · "}
              status: <strong>{activeVariantMeta?.status || (activeVariantKey === DEFAULT_VARIANT_KEY ? "confirmed" : "edited")}</strong>
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", rowGap: 6 }}>
            {Object.entries(vByHandle).map(([vk, vv]) => {
              const chipResolved = withResolvedVariantLabel(vk, vv, {
                legacyColorName: vmByHandle[vk]?.legacyColorName,
                productSkuHint,
              })
              const chipLabel = chipResolved.label
              const chipNeedsReview = labelNeedsReviewStyle(chipResolved.labelStatus)
              return (
              <button
                key={vk}
                type="button"
                onClick={() => setActiveVariantByHandle((prev) => ({ ...prev, [h]: vk }))}
                title={chipLabel}
                style={{
                  ...miniBtn,
                  padding: "4px 10px",
                  background: vk === activeVariantKey ? "#0f172a" : chipNeedsReview ? "#fffbeb" : "#f8fafc",
                  color: vk === activeVariantKey ? "#fff" : chipNeedsReview ? "#92400e" : "#334155",
                  borderColor: vk === activeVariantKey ? "#0f172a" : chipNeedsReview ? "#fcd34d" : "#cbd5e1",
                  maxWidth: 220,
                  fontStyle: chipNeedsReview && vk !== activeVariantKey ? "italic" : "normal",
                }}
              >
                {chipLabel}
              </button>
              )
            })}
            <button
              type="button"
              data-action-button="variant-rename-active"
              style={{ ...miniBtn, padding: "4px 10px" }}
              onClick={() => {
                const next = promptVariantRename(activeVariantDisplay)
                if (!next) return
                setVariantsByHandle((prev) => ({
                  ...prev,
                  [h]: {
                    ...(prev[h] ?? {}),
                    [activeVariantKey]: {
                      ...(prev[h]?.[activeVariantKey] ?? activeVariant),
                      label: next,
                      labelEditedByUser: true,
                      labelStatus: "user_edited",
                      sourceLabel: activeVariant.sourceLabel ?? sourceLabelForVariantKey(activeVariantKey),
                    },
                  },
                }))
                setDiag((d) => ({
                  ...d,
                  buttonHandlerFired: true,
                  stateUpdateRequested: true,
                  stateActuallyChanged: true,
                  lastAction: "rename active variant label",
                  lastError: "",
                }))
              }}
            >
              Переименовать
            </button>
            {activeVariantKey !== DEFAULT_VARIANT_KEY ? (
              <button
                type="button"
                data-action-button="variant-remove-active"
                style={{ ...miniBtn, padding: "4px 10px", color: "#b91c1c", borderColor: "#fecaca" }}
                onClick={() => removeVariantFromProduct(activeVariantKey)}
              >
                Удалить вариант
              </button>
            ) : null}
            {activeVariant.labelEditedByUser ? (
              <span style={{ ...pillSlate, background: "#f1f5f9", color: "#475569", fontSize: 10 }}>ручное имя</span>
            ) : null}
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
                  const key = `color_${label.toLowerCase().replace(/\s+/g, "_")}`
                  setVariantsByHandle((prev) => ({
                    ...prev,
                    [h]: {
                      ...(prev[h] ?? {
                        [DEFAULT_VARIANT_KEY]: fromZoneState(board.zones[h] ?? emptyZones(), LABEL_NEEDS_REVIEW_RU, {
                          sourceLabel: "default",
                        }),
                      }),
                      [key]:
                        prev[h]?.[key] ??
                        emptyVariant(label, {
                          sourceLabel: label,
                          labelEditedByUser: true,
                        }),
                    },
                  }))
                  setVariantMetaByHandle((prev) => ({
                    ...prev,
                    [h]: {
                      ...(prev[h] ?? {}),
                      [key]: mergeVariantMeta(prev[h]?.[key], (selectedProduct.sku || "").trim() || "", {
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
        </details>

        {/* Current main media — actionable lanes */}
        <section
          data-review-step="1"
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
            <span style={{ fontSize: 10, fontWeight: 800, color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              1 · Цвет: {activeVariantDisplay}
            </span>
            <span style={{ fontSize: 10, color: "#94a3b8", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {labelNeedsReviewStyle(activeLabelStatus) ? (
                <span style={{ ...pillSlate, background: "#fef3c7", color: "#92400e" }}>уточните название</span>
              ) : null}
              {activeVariant.primaryAutoPicked ? (
                <span style={{ ...pillSlate, background: "#dbeafe", color: "#1e40af" }}>Primary выбран автоматически</span>
              ) : null}
              {z.primary && invById.get(z.primary)
                ? (() => {
                    const pr = classifyVisualRole(invById.get(z.primary)!)
                    const pill = primaryCandidateBadgeRu(pr, Boolean(activeVariant.primaryNeedsReview))
                    return pill ? (
                      <span
                        style={{
                          ...pillSlate,
                          background: activeVariant.primaryNeedsReview ? "#fee2e2" : "#dcfce7",
                          color: activeVariant.primaryNeedsReview ? "#b91c1c" : "#166534",
                        }}
                      >
                        {pill}
                      </span>
                    ) : null
                  })()
                : null}
              {activeVariant.primaryNeedsReview && !invById.get(z.primary || "") ? (
                <span style={{ ...pillSlate, background: "#fee2e2", color: "#b91c1c" }}>Проверь primary</span>
              ) : null}
            </span>
          </div>

          <section
            data-variant-primary-slot="true"
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              padding: 14,
              background: "#fff",
              minWidth: 0,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#0f172a", letterSpacing: "0.02em" }}>Главное фото</h3>
              <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase" }}>Primary</span>
            </div>
            {zoneBox(
              "",
              "Drop to Primary",
              selectedHandle,
              "primary",
              z.primary ? (
                <div data-main-media-slot="primary" style={{ width: 200, maxWidth: "100%", flex: "0 0 auto" }}>
                  {renderZoneThumb(z.primary, selectedHandle, "primary", activeVariantKey, vByHandle, "primary")}
                </div>
              ) : (
                <div
                  data-primary-empty-state="true"
                  style={{
                    width: "100%",
                    maxWidth: 420,
                    minHeight: 160,
                    borderRadius: 12,
                    border: "2px dashed #cbd5e1",
                    background: "#f8fafc",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 20,
                    textAlign: "center",
                    gap: 6,
                  }}
                >
                  <strong style={{ fontSize: 14, color: "#334155" }}>Главное фото не выбрано</strong>
                  <span style={{ fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
                    Нажмите <strong>★ Главное</strong> на фото из галереи или выберите <strong>Главное</strong> в media pool.
                  </span>
                </div>
              )
            )}
          </section>

          <section
            data-variant-gallery-strip="true"
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              padding: 14,
              background: "#fff",
              minWidth: 0,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#0f172a" }}>Галерея</h3>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: "#64748b" }}>{z.gallery.length} фото</span>
                <button
                  type="button"
                  data-action-button="apply-recommended-visual-order"
                  style={miniBtn}
                  title={VISUAL_ROLE_RANKING_TOOLTIP_RU}
                  onClick={() =>
                    updateVariantDecision(
                      h,
                      activeVariantKey,
                      (prev) => applyRecommendedVisualOrderToVariant(prev, invById, candById),
                      "apply recommended visual role order",
                      z.primary || z.gallery[0] || "",
                      { source: "manual", fromZone: "variant_workspace", targetZone: "gallery_reorder" }
                    )
                  }
                >
                  Упорядочить по типам фото
                </button>
                <details>
                  <summary style={{ fontSize: 10, color: "#64748b", cursor: "pointer" }}>Порядок фото</summary>
                  <p style={{ margin: "4px 0 0", fontSize: 10, color: "#64748b", maxWidth: 280, lineHeight: 1.35 }}>
                    {VISUAL_ROLE_RANKING_TOOLTIP_RU}
                  </p>
                </details>
              </div>
            </div>
            {zoneBox(
              "",
              "Drop to Gallery",
              selectedHandle,
              "gallery",
              z.gallery.length === 0 ? (
                <span style={muted}>Галерея пуста — перетащите фото из media pool или нажмите Gallery.</span>
              ) : (
                <div
                  data-gallery-scroll-strip="true"
                  style={{
                    display: "flex",
                    gap: 12,
                    overflowX: "auto",
                    overflowY: "hidden",
                    paddingBottom: 6,
                    width: "100%",
                    minWidth: 0,
                  }}
                >
                  {z.gallery.map((gid) => (
                    <div
                      key={gid}
                      data-legacy-drop-target="true"
                      data-drop-kind="product-zone"
                      data-drop-zone="gallery"
                      data-product-handle={h}
                      data-zone="gallery"
                      data-inventory-id={gid}
                      data-main-media-slot="gallery"
                      style={{ flex: "0 0 196px", width: 196, minWidth: 180, maxWidth: 196 }}
                    >
                      {renderZoneThumb(gid, selectedHandle, "gallery", activeVariantKey, vByHandle, "gallery")}
                    </div>
                  ))}
                </div>
              )
            )}
          </section>

          {showCompactSeedBlock ? (
            <div
              data-default-storefront-seed-compact="true"
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #bfdbfe",
                background: "#f8fafc",
                minWidth: 0,
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#1e3a8a" }}>Default photos available</span>
                {seedRowsPendingAssign.length > 0 ? (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      style={btnPrimaryMini}
                      onClick={() => {
                        const ids = seedRowsPendingAssign.map((r) => r.invId).filter(Boolean) as string[]
                        if (!ids.length) return
                        updateVariantDecision(
                          h,
                          activeVariantKey,
                          (prev) => ({
                            ...prev,
                            gallery: mergeGalleryPreservingOrder(prev.gallery, ids, prev.primary),
                          }),
                          "add all pending seeds to gallery",
                          ids[0],
                          { source: "selected-product-default", fromZone: "storefront_seed_strip", targetZone: "gallery" }
                        )
                      }}
                    >
                      Добавить все в галерею
                    </button>
                    <button
                      type="button"
                      style={miniBtn}
                      onClick={() => {
                        const first = seedRowsPendingAssign.find((r) => r.invId)?.invId
                        if (!first) return
                        updateVariantDecision(
                          h,
                          activeVariantKey,
                          (prev) => ({
                            ...prev,
                            primary: first,
                            gallery: prev.gallery.filter((x) => x !== first),
                            primaryManualOverride: true,
                            primaryAutoPicked: false,
                            primaryNeedsReview: false,
                          }),
                          "set primary from pending seed",
                          first,
                          { source: "selected-product-default", fromZone: "storefront_seed_strip", targetZone: "primary" }
                        )
                      }}
                    >
                      Выбрать главное
                    </button>
                  </div>
                ) : null}
              </div>
              {seedRowsPendingAssign.length > 0 ? (
                <div style={{ display: "flex", gap: 8, marginTop: 10, overflowX: "auto", paddingBottom: 4 }}>
                  {seedRowsPendingAssign.map((r) => (
                    <div key={r.seedUrl} style={{ flex: "0 0 72px", width: 72 }} title={r.basename}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.seedUrl} alt="" width={72} height={72} style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid #bfdbfe" }} />
                    </div>
                  ))}
                </div>
              ) : null}
              {seedRowsOnlyNoInv.length > 0 ? (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ fontSize: 10, color: "#64748b", cursor: "pointer" }}>Seed-only URLs ({seedRowsOnlyNoInv.length})</summary>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                    {seedRowsOnlyNoInv.map((r) => (
                      <StorefrontSeedMediaCard
                        key={r.seedUrl}
                        seedUrl={r.seedUrl}
                        basename={r.basename}
                        reason={r.reason}
                        compact
                        onCopyUrl={() => void navigator.clipboard.writeText(r.seedUrl).catch(() => {})}
                        onInspect={() => window.alert(`Storefront seed (no legacy inventory id)\n\n${r.seedUrl}\n\n${r.reason}`)}
                      />
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          ) : null}

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

        <details
          data-article-scan-panel="true"
          style={{
            border: "1px solid #dbeafe",
            borderRadius: 12,
            padding: 12,
            background: "#f8fafc",
            minWidth: 0,
            marginBottom: 0,
          }}
        >
          <summary style={{ cursor: "pointer", fontSize: 10, fontWeight: 800, color: "#1e3a8a", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Legacy article index scan (optional)
          </summary>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between", marginBottom: 8, marginTop: 10 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#475569" }}>
              Batch scan PDP cache for swatch articles
            </span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button
                type="button"
                data-action-button="scan-articles-visible"
                style={miniBtn}
                disabled={articleScanRunning || productsFiltered.length === 0}
                onClick={() => void runArticleScan(productsFiltered.slice(0, 48))}
              >
                {articleScanRunning ? "Scanning…" : "Scan visible products"}
              </button>
              <button
                type="button"
                data-action-button="scan-articles-collection"
                style={miniBtn}
                disabled={articleScanRunning || productsFiltered.length === 0}
                onClick={() => void runArticleScan(productsFiltered)}
              >
                Scan current collection
              </button>
            </div>
          </div>
          {articleScanProgress ? (
            <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.55 }} data-article-scan-progress="true">
              PDP scanned: <strong>{articleScanProgress.pdp_pages_scanned}</strong> · swatches:{" "}
              <strong>{articleScanProgress.swatches_found}</strong> · matched: <strong>{articleScanProgress.articles_matched}</strong> ·
              enriched: <strong>{articleScanProgress.suggestions_enriched}</strong> · review:{" "}
              <strong>{articleScanProgress.needs_review}</strong> · missing cache:{" "}
              <strong>{articleScanProgress.missing_pdp_cache}</strong> · listing only:{" "}
              <strong>{articleScanProgress.listing_only_skipped}</strong>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "#94a3b8" }}>Run scan to index swatch articles from repo PDP cache (read-only).</div>
          )}
        </details>

        {/* SECTION 2 — Suggested color variants — compact review flow */}
        <div
          data-review-step="2"
          data-suggested-variants-panel="true"
          data-product-handle={h}
          style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 12, background: "#fff", minWidth: 0 }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8, rowGap: 6 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.06em" }}>2 · Suggested variants for this SKU</span>
              {totalSuggestions > 0 ? (
                <span
                  data-suggestions-counter="true"
                  style={{ fontSize: 11, color: "#64748b" }}
                >
                  <strong>{totalSuggestions}</strong> suggestion{totalSuggestions === 1 ? "" : "s"} · <strong>{confirmedSuggestionCount}</strong> confirmed ·{" "}
                  <strong>{leftSuggestionCount}</strong> left
                  {totalDuplicatesHidden > 0 ? (
                    <>
                      {" "}
                      · <strong data-dedupe-hidden-count="true">{totalDuplicatesHidden}</strong> duplicate{totalDuplicatesHidden === 1 ? "" : "s"} hidden
                    </>
                  ) : null}
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
                title={suggestions.length === 0 ? "Нет вариантов для подтверждения" : `Подтвердить ${suggestions.length} вариант(ов)`}
                onClick={confirmAllVisible}
              >
                Подтвердить всё ({suggestions.length})
              </button>
              <details>
                <summary style={{ cursor: "pointer", fontSize: 10, color: "#94a3b8", fontWeight: 700, padding: "6px 4px" }}>Ещё</summary>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              <button
                type="button"
                data-action-button="suggestions-confirm-high"
                style={miniBtn}
                disabled={suggestions.filter((s) => s.identityTier === "this_sku" && s.confidence === "high").length === 0}
                onClick={confirmHighConfidence}
              >
                High-confidence
              </button>
                </div>
              </details>
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
                const defPref: SuggestionPref = {
                  useLegacyName: false,
                  useLegacyArticle: false,
                  editedLegacyArticle: null,
                  chosenArticleCandidateIndex: null,
                }
                const prefs = suggestionRowPrefs[sk] ?? defPref
                const candidates = enc?.article_candidates ?? []
                const chosenCandidate =
                  prefs.chosenArticleCandidateIndex != null && candidates[prefs.chosenArticleCandidateIndex]
                    ? candidates[prefs.chosenArticleCandidateIndex]
                    : null
                const legacyArticle =
                  enc?.legacy_color_article_status === "found"
                    ? chosenCandidate?.article ?? enc?.legacy_color_article ?? null
                    : null
                const articleLine = prefs.editedLegacyArticle?.trim() || legacyArticle || null
                const articleStatusRaw = loading ? "pending" : enc?.legacy_color_article_status ?? (encState?.error ? "legacy_fetch_unreachable" : "legacy_fetch_unreachable")
                const articleStatus = legacyArticleStatusLabel(articleStatusRaw)
                const indexedUi = loading ? "…" : legacyArticleIndexedUiLine(enc)
                const legacyArticleCard = articleStatusRaw === "found" && legacyArticle ? indexedUi : indexedUi
                const sourceMethod = enc?.legacy_article_source_method ?? enc?.source_method ?? null
                const sourceUrl = (enc?.indexed_pdp_url || enc?.legacy_article_source_url || enc?.source_url || s.sourceUrl) as string | null
                const fetchSummary = loading ? "pending" : enc?.fetch_status ?? (encState?.error ? "client_error" : "idle")
                const canUseIndexedArticleBtn = canUseIndexedArticle(enc)
                const canUseLegacyArticle = canUseIndexedArticleBtn
                const needsArticleReview = enc?.indexed_article_status === "multiple_candidates"
                const combinedReasons = enc?.reasons?.length ? [...s.reasons, ...enc.reasons] : s.reasons
                const galleryPreview = [s.primaryCandidateId, ...s.galleryCandidateIds].filter(Boolean) as string[]
                const cardStatus: "suggested" | "edited" =
                  prefs.editedLegacyArticle || prefs.useLegacyArticle || prefs.useLegacyName || prefs.displayLabelEdited
                    ? "edited"
                    : "suggested"
                const confirmedVariant = vByHandle[s.variantKey]
                const suggestionDisplayLabel = resolveSuggestionDisplayLabel(
                  s,
                  enc,
                  prefs,
                  confirmedVariant,
                  productSkuHint
                )
                const suggestionLabelStatus = resolveVariantDisplayLabel({
                  variantKey: s.variantKey,
                  persistedLabel: prefs.displayLabel ?? s.label,
                  labelEditedByUser: prefs.displayLabelEdited,
                  legacyColorName: enc?.legacy_color_name,
                  productSkuHint,
                  preferLegacyColorName: prefs.useLegacyName,
                  seedImageUrls: s.seedImageUrls,
                }).labelStatus
                const confirmedMeta = vmByHandle[s.variantKey]
                const rolesByIdMap = new Map<string, VisualRole>(
                  Object.entries(s.rolesByMediaId ?? {}).map(([id, role]) => [id, role as VisualRole])
                )
                const borrowedById = new Map(
                  (s.borrowedSameSku ?? []).map((b) => [
                    b.mediaId,
                    { ...b, role: b.role as VisualRole } satisfies BorrowedSameSkuEntry,
                  ])
                )
                const primaryPreviewId = confirmedVariant?.primary ?? s.primaryCandidateId
                const gallerySource = confirmedVariant ? confirmedVariant.gallery : s.galleryCandidateIds
                const galleryRest = gallerySource.filter((id) => id && id !== primaryPreviewId && invById.get(id)?.previewable)
                const primaryIsPreviewable = primaryPreviewId ? Boolean(invById.get(primaryPreviewId)?.previewable) : false
                const galleryPreviewOrdered = (
                  confirmedVariant
                    ? primaryPreviewId && primaryIsPreviewable
                      ? [primaryPreviewId, ...galleryRest]
                      : galleryRest
                    : [s.primaryCandidateId, ...s.galleryCandidateIds]
                ).filter((id): id is string => Boolean(id) && Boolean(invById.get(id)?.previewable))
                const roleStripLabels = (s.roleStrip ?? [])
                  .map((role) => VISUAL_ROLE_STRIP_LABEL_RU[role as VisualRole])
                  .filter((l) => l && l !== "?")
                const hiddenRoleGroups = groupHiddenDuplicatesByRole(
                  (s.hiddenDuplicateIds ?? []).map((mediaId) => ({
                    mediaId,
                    reason: "near_duplicate" as const,
                    canonicalMediaId:
                      s.duplicateGroups.find((g) => g.memberIds.includes(mediaId))?.canonicalMediaId ?? "",
                    matchKey: s.duplicateGroups.find((g) => g.memberIds.includes(mediaId))?.matchKey ?? "",
                    filename: invById.get(mediaId)?.filename,
                    sourcePath: invById.get(mediaId)?.source_path ?? null,
                  })),
                  new Map(
                    Array.from(invById.entries()).map(([id, row]) => [id, row as InvItemDedupeFields])
                  ),
                  rolesByIdMap
                )
                const previewMedia = confirmedVariant
                  ? buildVariantMediaFromCandidates(
                      [primaryPreviewId, ...gallerySource].filter(Boolean) as string[],
                      invById,
                      gallerySource,
                      candById,
                      confirmedVariant,
                      confirmedMeta?.status,
                      { selectedSku: s.productSkuHint, colorToken: s.colorNameRaw }
                    )
                  : {
                      primary: s.primaryCandidateId,
                      primaryAutoPicked: true,
                      primaryNeedsReview: s.primaryNeedsReview ?? false,
                    }

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
                    <header style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", minWidth: 0 }}>
                        <strong
                          style={{
                            fontSize: 15,
                            color: labelNeedsReviewStyle(suggestionLabelStatus) ? "#b45309" : "#0f172a",
                            overflowWrap: "anywhere",
                            fontStyle: labelNeedsReviewStyle(suggestionLabelStatus) ? "italic" : "normal",
                          }}
                          data-variant-display-label="true"
                        >
                          {suggestionDisplayLabel}
                        </strong>
                        {labelNeedsReviewStyle(suggestionLabelStatus) ? (
                          <span style={{ ...pillSlate, background: "#fef3c7", color: "#92400e" }}>уточните название</span>
                        ) : null}
                        {confirmedVariant?.labelEditedByUser || prefs.displayLabelEdited ? (
                          <span style={{ ...pillSlate, background: "#f1f5f9", color: "#475569", fontSize: 10 }}>ручное имя</span>
                        ) : null}
                        {s.duplicateHiddenCount > 0 ? (
                          <span
                            data-suggestion-dedupe-badge="true"
                            style={{ ...pillSlate, background: "#f1f5f9", color: "#475569" }}
                            title="Похожие дубликаты скрыты из полосы — см. Details"
                          >
                            +{s.duplicateHiddenCount} похожих скрыто
                          </span>
                        ) : null}
                        {(s.borrowedSameSku?.length ?? 0) > 0 ? (
                          <span style={{ ...pillSlate, background: "#ffedd5", color: "#9a3412" }}>
                            из этого SKU · другой цвет
                          </span>
                        ) : null}
                        <span style={pillIndigo}>{s.confidence}</span>
                        <span
                          style={{
                            ...pillSlate,
                            background:
                              articleStatusRaw === "found"
                                ? "#dcfce7"
                                : articleStatusRaw === "pending"
                                  ? "#dbeafe"
                                  : articleStatusRaw === "legacy_fetch_unreachable"
                                    ? "#fee2e2"
                                    : "#fef3c7",
                            color:
                              articleStatusRaw === "found"
                                ? "#166534"
                                : articleStatusRaw === "pending"
                                  ? "#1e40af"
                                  : articleStatusRaw === "legacy_fetch_unreachable"
                                    ? "#b91c1c"
                                    : "#92400e",
                          }}
                        >
                          {articleStatus}
                        </span>
                        {articleLine ? (
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>{articleLine}</span>
                        ) : loading ? (
                          <span style={{ fontSize: 11, color: "#64748b" }}>…</span>
                        ) : null}
                        <span style={{ ...pillSlate, marginLeft: "auto" }}>{cardStatus}</span>
                    </header>

                    {/* BODY: Primary + Gallery preview for this color variant */}
                    {galleryPreviewOrdered.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                        {roleStripLabels.length > 0 ? (
                          <div
                            data-suggestion-role-strip="true"
                            style={{ fontSize: 10, color: "#475569", fontWeight: 600 }}
                          >
                            {roleStripLabels.join(" · ")}
                          </div>
                        ) : null}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                          <span style={{ fontSize: 10, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            Primary photo · Gallery
                          </span>
                          {!confirmedVariant && previewMedia.primaryAutoPicked ? (
                            <span style={{ ...pillSlate, background: "#dbeafe", color: "#1e40af" }}>Primary выбран автоматически</span>
                          ) : null}
                          {(confirmedVariant?.primaryNeedsReview || previewMedia.primaryNeedsReview) && !confirmedVariant?.primaryManualOverride ? (
                            <span style={{ ...pillSlate, background: "#fee2e2", color: "#b91c1c" }}>Проверь primary</span>
                          ) : null}
                        </div>
                        <div
                          data-suggestion-thumbs="true"
                          style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start", minWidth: 0 }}
                        >
                        {galleryPreviewOrdered.slice(0, 6).map((mid) => {
                          const borrowed = borrowedById.get(mid)
                          const roleBadge = roleBadgeForMedia(mid, rolesByIdMap, borrowedById)
                          const borrowedLabel = borrowed
                            ? `${VISUAL_ROLE_STRIP_LABEL_RU[borrowed.role]} из другого цвета этого SKU (${borrowed.fromVariantLabel})`
                            : null
                          return (
                          <SuggestionVariantThumb
                            key={mid}
                            mid={mid}
                            isPrimary={mid === primaryPreviewId}
                            inv={invById.get(mid)}
                            seedRows={seedMatchRowsForSelected}
                            roleBadge={mid === primaryPreviewId ? null : roleBadge}
                            borrowedLabel={borrowedLabel}
                          />
                          )
                        })}
                        {galleryPreviewOrdered.length > 6 ? (
                          <div style={{ fontSize: 10, color: "#64748b", alignSelf: "center" }}>
                            +{galleryPreviewOrdered.length - 6}
                          </div>
                        ) : null}
                      </div>
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
                        Подтвердить вариант
                      </button>
                      <button
                        type="button"
                        data-action-button="suggestion-rename-label"
                        style={miniBtn}
                        onClick={() => {
                          const next = promptVariantRename(suggestionDisplayLabel)
                          if (!next) return
                          if (confirmedVariant) {
                            setVariantsByHandle((prev) => ({
                              ...prev,
                              [h]: {
                                ...(prev[h] ?? {}),
                                [s.variantKey]: {
                                  ...confirmedVariant,
                                  label: next,
                                  labelEditedByUser: true,
                                  labelStatus: "user_edited",
                                  sourceLabel: confirmedVariant.sourceLabel ?? sourceLabelForVariantKey(s.variantKey),
                                },
                              },
                            }))
                          } else {
                            setSuggestionRowPrefs((prev) => ({
                              ...prev,
                              [sk]: { ...prefs, displayLabel: next, displayLabelEdited: true },
                            }))
                          }
                          setDiag((d) => ({
                            ...d,
                            buttonHandlerFired: true,
                            stateUpdateRequested: true,
                            stateActuallyChanged: true,
                            lastAction: "rename suggestion variant label",
                            lastError: "",
                          }))
                        }}
                      >
                        Переименовать
                      </button>
                      <span data-hidden-advanced-actions="true" style={{ display: "none" }}><button
                        type="button"
                        data-action-button="suggestion-use-indexed-article"
                        disabled={!canUseIndexedArticleBtn}
                        title={
                          canUseIndexedArticleBtn
                            ? "Apply article from indexed PDP swatch evidence"
                            : "Requires found article on matched PDP cache"
                        }
                        style={{
                          ...miniBtn,
                          opacity: canUseIndexedArticleBtn ? 1 : 0.45,
                          cursor: canUseIndexedArticleBtn ? "pointer" : "not-allowed",
                        }}
                        onClick={() => {
                          if (!canUseIndexedArticleBtn) return
                          setSuggestionRowPrefs((prev) => ({
                            ...prev,
                            [sk]: { ...(prev[sk] ?? defPref), useLegacyArticle: true, editedLegacyArticle: null },
                          }))
                        }}
                      >
                        Use indexed article
                      </button>
                      <button
                        type="button"
                        data-action-button="suggestion-use-indexed-name"
                        disabled={!enc?.legacy_color_name}
                        style={{
                          ...miniBtn,
                          opacity: enc?.legacy_color_name ? 1 : 0.45,
                          cursor: enc?.legacy_color_name ? "pointer" : "not-allowed",
                        }}
                        onClick={() => {
                          if (!enc?.legacy_color_name) return
                          setSuggestionRowPrefs((prev) => ({
                            ...prev,
                            [sk]: { ...(prev[sk] ?? defPref), useLegacyName: true },
                          }))
                        }}
                      >
                        Use indexed name
                      </button>
                      {candidates.length > 1 ? (
                        <button
                          type="button"
                          data-action-button="suggestion-choose-article"
                          style={miniBtn}
                          onClick={() => {
                            const lines = candidates.map(
                              (c, i) => `${i + 1}. ${c.article} · ${c.color_name || "—"} · ${c.source_method}`
                            )
                            const pick = window.prompt(`Choose article candidate:\n${lines.join("\n")}\n\nEnter number (1-${candidates.length})`)
                            if (!pick) return
                            const ix = Number.parseInt(pick, 10) - 1
                            if (ix < 0 || ix >= candidates.length) return
                            setSuggestionRowPrefs((prev) => ({
                              ...prev,
                              [sk]: {
                                ...(prev[sk] ?? defPref),
                                chosenArticleCandidateIndex: ix,
                                useLegacyArticle: true,
                                editedLegacyArticle: null,
                              },
                            }))
                          }}
                        >
                          Choose article…
                        </button>
                      ) : null}
                      <button
                        type="button"
                        data-action-button="suggestion-edit-article"
                        style={miniBtn}
                        onClick={() => {
                          const next = window.prompt("Edit legacy color article (manual)", prefs.editedLegacyArticle || legacyArticle || "")
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
                      </span>
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
                            Исходный токен / source:{" "}
                            <strong style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: "#64748b" }}>
                              {s.colorNameRaw} · {sourceLabelForVariantKey(s.variantKey)}
                            </strong>
                            {confirmedVariant?.labelEditedByUser && confirmedVariant.label !== suggestionDisplayLabel ? (
                              <> · исходное: <strong>{sourceLabelForVariantKey(s.variantKey)}</strong></>
                            ) : null}
                          </div>
                          {(s.rejectedBorrowCandidates?.length ?? 0) > 0 ? (
                            <div style={{ marginTop: 6 }} data-suggestion-rejected-borrow="true">
                              <strong>Отклонено заимствование ({s.rejectedBorrowCandidates!.length})</strong>
                              <ul style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: 10, color: "#94a3b8" }}>
                                {s.rejectedBorrowCandidates!.slice(0, 6).map((r) => (
                                  <li key={`${r.mediaId}-${r.reason}`}>
                                    {r.reason} · {(invById.get(r.mediaId)?.filename || r.filename || r.mediaId).slice(0, 36)}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {(s.borrowedSameSku?.length ?? 0) > 0 ? (
                            <div style={{ marginTop: 6 }} data-suggestion-borrowed="true">
                              <strong>Заимствовано из этого SKU</strong>
                              <ul style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: 10, color: "#64748b" }}>
                                {s.borrowedSameSku!.map((b) => (
                                  <li key={`${b.mediaId}-${b.role}`}>
                                    {VISUAL_ROLE_STRIP_LABEL_RU[b.role as VisualRole]} из «{b.fromVariantLabel}» ·{" "}
                                    <code style={{ fontSize: 9 }}>{(invById.get(b.mediaId)?.filename || b.mediaId).slice(0, 40)}</code>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {s.roleCompositionSummary ? (
                            <div style={{ marginTop: 6 }} data-suggestion-role-composition="true">
                              <strong>Состав по ролям</strong>
                              <div style={{ marginTop: 2, fontSize: 10, color: "#64748b" }}>{s.roleCompositionSummary}</div>
                            </div>
                          ) : null}
                          {s.duplicateHiddenCount > 0 ? (
                            <div style={{ marginTop: 6 }} data-suggestion-hidden-duplicates="true">
                              <strong>Похожие скрыты ({s.duplicateHiddenCount})</strong>
                              {hiddenRoleGroups.length > 0 ? (
                                <ul style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: 10, color: "#64748b" }}>
                                  {hiddenRoleGroups.slice(0, 8).map((g) => (
                                    <li key={`${g.role}-${g.canonicalMediaId}`} style={{ marginBottom: 4 }}>
                                      <strong>{g.roleLabel}</strong> · {g.count} шт. · canonical{" "}
                                      <code style={{ fontSize: 9 }}>{g.canonicalMediaId.slice(0, 12)}…</code>
                                      <div style={{ color: "#94a3b8", marginTop: 2 }}>
                                        {g.filenames.slice(0, 3).join(" · ")}
                                        {g.filenames.length > 3 ? ` · +${g.filenames.length - 3}` : null}
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                              <ul style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: 10, color: "#64748b" }}>
                                {s.duplicateGroups.slice(0, 6).map((g) => (
                                  <li key={g.matchKey} style={{ marginBottom: 4 }}>
                                    <span style={{ color: "#94a3b8" }}>{g.reason}</span> · canonical{" "}
                                    <code style={{ fontSize: 9 }}>{g.canonicalMediaId.slice(0, 12)}…</code>
                                    {g.memberIds.length > 2 ? ` · ${g.memberIds.length} files` : null}
                                  </li>
                                ))}
                              </ul>
                              )}
                            </div>
                          ) : null}
                          <div style={{ marginTop: 2 }}>
                            Matched PDP:{" "}
                            {enc?.indexed_pdp_url ? (
                              <a href={enc.indexed_pdp_url} target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>
                                {truncateMiddleClient(enc.indexed_pdp_url, 72)}
                              </a>
                            ) : (
                              "—"
                            )}
                          </div>
                          <div style={{ marginTop: 2 }}>
                            Cache path:{" "}
                            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: "#64748b" }}>
                              {enc?.indexed_cache_path || "—"}
                            </span>
                          </div>
                          <div style={{ marginTop: 2 }}>
                            Index: <strong>{enc?.indexed_article_status || "—"}</strong>
                            {enc?.indexed_article_ui ? (
                              <>
                                {" "}
                                · <strong>{enc.indexed_article_ui}</strong>
                              </>
                            ) : null}
                          </div>
                          {(enc?.rejected_article_candidates?.length ?? 0) > 0 ? (
                            <div style={{ marginTop: 4 }}>
                              <strong>Rejected candidates</strong>
                              <ul style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: 10 }}>
                                {enc!.rejected_article_candidates!.slice(0, 8).map((c, ci) => (
                                  <li key={`rej-${ci}`}>
                                    {c.article} · {c.color_name || "—"} · {c.source_method}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
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
                            Status: <strong>{articleStatus}</strong> · Hover: <strong>{enc?.hover_status || "—"}</strong>
                          </div>
                          <div style={{ marginTop: 4 }}>
                            <strong>URLs checked</strong>
                            <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                              {(enc?.urls_checked?.length
                                ? enc.urls_checked
                                : s.candidatePageUrls.map((c) => ({
                                    url: c.url,
                                    source: c.source,
                                    fetch_status: "not_attempted" as const,
                                    http_status: null,
                                    error: null,
                                    reachable_from_api: false,
                                  }))
                              )
                                .slice(0, 8)
                                .map((u) => (
                                  <li key={`${u.url}-${u.source}`} style={{ marginBottom: 4 }}>
                                    <span style={{ color: "#64748b" }}>[{u.source}]</span>{" "}
                                    <a href={u.url} target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>
                                      {truncateMiddleClient(u.url, 56)}
                                    </a>
                                    <br />
                                    <span style={{ fontSize: 10, color: "#94a3b8" }}>
                                      fetch: {u.fetch_status}
                                      {u.http_status != null ? ` · HTTP ${u.http_status}` : ""}
                                      {u.error ? ` · ${u.error}` : ""}
                                      {u.reachable_from_api ? " · reachable from QA API" : " · unreachable from QA API"}
                                    </span>
                                  </li>
                                ))}
                            </ul>
                          </div>
                          <div style={{ marginTop: 2 }}>
                            Source method: <strong>{sourceMethod || "—"}</strong> · Fetch / parse: <strong>{fetchSummary}</strong>
                            {encState?.error ? <span style={{ color: "#b91c1c" }}> · {encState.error}</span> : null}
                          </div>
                          <div style={{ marginTop: 2 }}>
                            Raw evidence:{" "}
                            <span style={{ color: "#64748b", fontFamily: "ui-monospace, monospace", fontSize: 10 }}>
                              {enc?.raw_evidence_snippet || "—"}
                            </span>
                          </div>
                          <div style={{ marginTop: 2 }}>
                            Swatches inspected: <strong>{enc?.swatches_checked?.length ?? 0}</strong>
                          </div>
                          {(enc?.swatches_checked?.length ?? 0) > 0 ? (
                            <ul style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: 10, color: "#64748b" }}>
                              {enc!.swatches_checked.slice(0, 12).map((sw, swIdx) => (
                                <li key={`${sw.selector_hint}-${swIdx}`} style={{ marginBottom: 4 }}>
                                  <span style={{ fontFamily: "ui-monospace, monospace" }}>{sw.selector_hint}</span>
                                  {" · "}
                                  method: <strong>{sw.source_method}</strong>
                                  {" · "}
                                  article: <strong>{sw.article || "—"}</strong>
                                  {sw.color_name ? (
                                    <>
                                      {" · "}
                                      name: <strong>{sw.color_name}</strong>
                                    </>
                                  ) : null}
                                  {" · "}
                                  color match: <strong>{sw.color_token_match ? "yes" : "no"}</strong>
                                  {sw.hover_text ? (
                                    <>
                                      <br />
                                      <span style={{ color: "#94a3b8" }}>hover/title: {sw.hover_text.slice(0, 120)}</span>
                                    </>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          ) : null}
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
                              disabled={!canUseLegacyArticle}
                              title={
                                canUseLegacyArticle
                                  ? "Apply parsed legacy color article"
                                  : "Only available when legacy_color_article_status is found"
                              }
                              style={{
                                ...miniBtn,
                                background: prefs.useLegacyArticle ? "#0f172a" : "#fff",
                                color: prefs.useLegacyArticle ? "#fff" : "#334155",
                                opacity: canUseLegacyArticle ? 1 : 0.45,
                                cursor: canUseLegacyArticle ? "pointer" : "not-allowed",
                              }}
                              onClick={() => {
                                if (!canUseLegacyArticle) return
                                setSuggestionRowPrefs((prev) => ({
                                  ...prev,
                                  [sk]: { ...(prev[sk] ?? defPref), useLegacyArticle: !(prev[sk]?.useLegacyArticle ?? false) },
                                }))
                              }}
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

          {confirmedVariantCount > 0 ? (
            <div
              data-confirmed-variants-summary="true"
              style={{
                marginTop: 10,
                padding: "10px 12px",
                borderRadius: 10,
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                minWidth: 0,
              }}
            >
              <span style={{ fontSize: 10, fontWeight: 800, color: "#166534", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Подтверждённые цвета · {confirmedVariantCount}
              </span>
              <div style={{ display: "grid", gap: 8 }}>
                {Object.entries(vByHandle)
                  .filter(([vk, vv]) => vk !== DEFAULT_VARIANT_KEY || (vv.primary ? 1 : 0) + vv.gallery.length > 0)
                  .map(([vk, vv]) => {
                    const resolved = withResolvedVariantLabel(vk, vv, {
                      legacyColorName: vmByHandle[vk]?.legacyColorName,
                      productSkuHint,
                    })
                    const readiness =
                      resolved.labelStatus === "needs_review"
                        ? "уточните цвет"
                        : vv.primaryNeedsReview && !vv.primaryManualOverride
                          ? "проверьте primary"
                          : vv.primary
                            ? "готово"
                            : "нет primary"
                    const stripIds = vv.primary ? [vv.primary, ...vv.gallery.filter((id) => id !== vv.primary)] : vv.gallery
                    return (
                      <div
                        key={vk}
                        data-confirmed-variant-row="true"
                        data-variant-key={vk}
                        style={{
                          border: "1px solid #bbf7d0",
                          borderRadius: 8,
                          padding: 8,
                          background: "#fff",
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                          minWidth: 0,
                        }}
                      >
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                          <strong
                            style={{
                              fontSize: 13,
                              color: labelNeedsReviewStyle(resolved.labelStatus) ? "#b45309" : "#0f172a",
                              fontStyle: labelNeedsReviewStyle(resolved.labelStatus) ? "italic" : "normal",
                            }}
                          >
                            {resolved.label}
                          </strong>
                          <button
                            type="button"
                            style={{ ...miniBtn, padding: "2px 8px", fontSize: 10 }}
                            onClick={() => {
                              const next = promptVariantRename(resolved.label)
                              if (!next) return
                              setVariantsByHandle((prev) => ({
                                ...prev,
                                [h]: {
                                  ...(prev[h] ?? {}),
                                  [vk]: {
                                    ...vv,
                                    label: next,
                                    labelEditedByUser: true,
                                    labelStatus: "user_edited",
                                    sourceLabel: vv.sourceLabel ?? sourceLabelForVariantKey(vk),
                                  },
                                },
                              }))
                            }}
                          >
                            Переименовать
                          </button>
                          <button
                            type="button"
                            style={{ ...miniBtn, padding: "2px 8px", fontSize: 10, color: "#b91c1c", borderColor: "#fecaca" }}
                            onClick={() => removeVariantFromProduct(vk)}
                          >
                            Удалить вариант
                          </button>
                          {vv.labelEditedByUser ? (
                            <span style={{ ...pillSlate, fontSize: 9, background: "#f1f5f9", color: "#475569" }}>ручное имя</span>
                          ) : null}
                          <span style={{ ...pillSlate, marginLeft: "auto", background: "#dcfce7", color: "#166534" }}>{readiness}</span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#64748b" }}>Primary</span>
                          {vv.primaryAutoPicked && !vv.primaryManualOverride ? (
                            <span style={{ ...pillSlate, background: "#dbeafe", color: "#1e40af", fontSize: 9 }}>auto</span>
                          ) : null}
                          <span style={{ fontSize: 10, color: "#64748b" }}>Gallery · {vv.gallery.length}</span>
                        </div>
                        {stripIds.length > 0 ? (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {stripIds.slice(0, 5).map((mid) => {
                              const inv = invById.get(mid)
                              const pv = inv ? clientPreviewUrl(inv) : null
                              const isPrimary = mid === vv.primary
                              return (
                                <div
                                  key={mid}
                                  style={{
                                    width: isPrimary ? 56 : 44,
                                    height: isPrimary ? 56 : 44,
                                    borderRadius: 6,
                                    border: isPrimary ? "2px solid #2563eb" : "1px solid #e2e8f0",
                                    overflow: "hidden",
                                    background: "#f8fafc",
                                    flex: "0 0 auto",
                                  }}
                                >
                                  {pv?.url ? (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img src={pv.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                  ) : (
                                    <div style={{ fontSize: 8, color: "#94a3b8", padding: 2 }}>—</div>
                                  )}
                                </div>
                              )
                            })}
                            {stripIds.length > 5 ? (
                              <span style={{ fontSize: 10, color: "#64748b", alignSelf: "center" }}>+{stripIds.length - 5}</span>
                            ) : null}
                          </div>
                        ) : (
                          <span style={{ fontSize: 10, color: "#94a3b8" }}>Нет фото — подтвердите из Suggestions или назначьте из пула</span>
                        )}
                        <button
                          type="button"
                          style={{ ...miniBtn, alignSelf: "flex-start", fontSize: 10 }}
                          onClick={() => setActiveVariantByHandle((prev) => ({ ...prev, [h]: vk }))}
                        >
                          Редактировать в Current
                        </button>
                      </div>
                    )
                  })}
              </div>
            </div>
          ) : null}

                {reviewSuggestions.length > 0 ? (
          <div
            data-needs-identity-review-panel="true"
            style={{ border: "1px solid #fde68a", borderRadius: 12, padding: 12, background: "#fffbeb", minWidth: 0 }}
          >
            <span style={{ fontSize: 10, fontWeight: 800, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Needs identity review
            </span>
            <p style={{ margin: "6px 0 10px", fontSize: 11, color: "#78350f", lineHeight: 1.45 }}>
              Same color token but another SKU/handle may own these files. Not included in <strong>Confirm all</strong> — inspect in Details, then assign manually from the pool.
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              {reviewSuggestions.slice(0, 4).map((s) => (
                <article
                  key={s.variantKey}
                  data-suggestion-review-card="true"
                  style={{ border: "1px solid #fcd34d", borderRadius: 8, padding: 10, background: "#fff", minWidth: 0 }}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "baseline" }}>
                    <strong style={{ fontSize: 13, color: "#0f172a" }}>
                      {displayLabelFromColorToken(s.colorNameRaw, { productSkuHint: s.productSkuHint })}
                    </strong>
                    <span style={{ ...pillSlate, background: "#fef3c7", color: "#92400e" }}>Проверить принадлежность</span>
                    {s.foreignHandle ? (
                      <span style={{ fontSize: 10, color: "#b45309" }}>other handle: {s.foreignHandle}</span>
                    ) : null}
                    {s.foreignSku ? <span style={{ fontSize: 10, color: "#b45309" }}>other sku: {s.foreignSku}</span> : null}
                  </div>
                  <details style={{ marginTop: 6 }}>
                    <summary style={{ cursor: "pointer", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>
                      Why included / excluded from bulk confirm
                    </summary>
                    <ul style={{ margin: "6px 0 0", paddingLeft: 16, fontSize: 11, color: "#475569", lineHeight: 1.45 }}>
                      {s.identityNotes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </details>
                  <button
                    type="button"
                    style={{ ...miniBtn, marginTop: 8, opacity: 0.55, cursor: "not-allowed" }}
                    disabled
                    title="Resolve identity in the media pool — bulk confirm disabled for cross-SKU color matches"
                  >
                    Confirm all (disabled)
                  </button>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        <div
          data-review-step="3"
          data-export-status-panel="true"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #e2e8f0",
            background: "#f8fafc",
            fontSize: 12,
            color: "#475569",
          }}
        >
          <span style={{ fontSize: 10, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>3 · Confirmed / export</span>
          <span>
            Variants <strong>{confirmedVariantCount}</strong>
          </span>
          <span style={{ color: "#cbd5e1" }}>·</span>
          <span>
            Gallery items <strong>{galleryItemCount}</strong>
          </span>
          <span style={{ color: "#cbd5e1" }}>·</span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              padding: "2px 8px",
              borderRadius: 999,
              background: allSuggestionsReviewed ? "#dcfce7" : "#fef3c7",
              color: allSuggestionsReviewed ? "#166534" : "#92400e",
            }}
          >
            {allSuggestionsReviewed ? "Export ready" : "Needs review"}
          </span>
        </div>

        {/* SECTION 5 — Full seed URL list (reference only; editable matched tiles live in Current main media) */}
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
              All storefront seed URLs ({selectedProduct.image_urls.length}) — reference
            </summary>
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 11, color: "#475569", lineHeight: 1.5, overflowWrap: "anywhere" }}>
              {selectedProduct.image_urls.map((u) => (
                <li key={u}>
                  <a href={u} target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>
                    {u}
                  </a>
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 6, fontSize: 10, color: "#94a3b8", lineHeight: 1.4 }}>
              Matched seeds are editable in <strong>Current main media</strong> (Primary/Gallery) with full lane controls and export via inventory ids. Unmatched seeds appear as seed-only cards in the blue strip above.
            </div>
          </details>
        ) : null}
      </section>
    )
  }

  return (
    <div
      className="legacy-board-shell"
      style={{
        width: "100%",
        boxSizing: "border-box",
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
        data-legacy-board-grid="true"
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          width: "100%",
          boxSizing: "border-box",
          display: "grid",
          gridTemplateColumns: focusMode
            ? "minmax(820px, 1fr) minmax(420px, 520px)"
            : "minmax(220px, 260px) minmax(720px, 1fr) minmax(380px, 460px)",
          gap: 16,
          padding: "0 16px 16px",
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
                  {st.safeCandN > 0 ? (
                    <span style={{ ...navBadge, background: "#dcfce7", color: "#166534" }} data-collection-safe-candidates="true">
                      {st.safeCandN} safe
                    </span>
                  ) : null}
                  {st.reviewCandN > 0 ? (
                    <span style={{ ...navBadge, background: "#fef9c3", color: "#854d0e" }} data-collection-needs-identity-review="true">
                      {st.reviewCandN} identity
                    </span>
                  ) : null}
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
                <details open={!selectedHandle} style={{ marginBottom: 14 }}>
                  <summary style={{ fontWeight: 700, fontSize: 13, color: "#334155", cursor: "pointer" }}>
                    Products in this view ({productsFiltered.length})
                    {selectedHandle ? " — switch SKU" : ""}
                  </summary>
                  <div style={{ marginTop: 10 }}>
                  {!selectedHandle ? (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Pick a product to review</h3>
                      <span style={{ fontSize: 12, color: "#64748b" }}>{productsFiltered.length} rows</span>
                    </div>
                  ) : null}
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
                    </div>
                  </details>
              ) : null}
            </>
          )}
        </main>

        <aside
          data-media-pool-aside="true"
          data-legacy-board-right-aside="true"
          style={{
            width: "100%",
            borderLeft: "1px solid #e2e8f0",
            background: "#fff",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            minWidth: 0,
            maxWidth: "100%",
            boxSizing: "border-box",
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
              <div style={{ fontSize: 11, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>Media pool · <span style={{ color: "#64748b" }}>{poolIdsForTabFocused.length} items</span></div>
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
              {poolActionNote ? (
                <p
                  data-pool-action-note="true"
                  style={{ margin: "8px 0 0", fontSize: 11, color: "#166534", fontWeight: 600, lineHeight: 1.4 }}
                >
                  {poolActionNote}
                </p>
              ) : null}
              {inspectorId && selectedHandle ? (
                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                  <button
                    type="button"
                    data-action-button="pool-bulk-add-to-all-galleries"
                    style={{ ...miniBtn, fontWeight: 700 }}
                    disabled={
                      !mediaCanAppendToAllGalleries(
                        invById.get(inspectorId),
                        candById.get(inspectorId),
                        selectedHandle,
                        selectedProductSku,
                        bulkColorVariantCount
                      ).ok
                    }
                    title={
                      mediaCanAppendToAllGalleries(
                        invById.get(inspectorId),
                        candById.get(inspectorId),
                        selectedHandle,
                        selectedProductSku,
                        bulkColorVariantCount
                      ).hint
                    }
                    onClick={() => appendMediaToAllVariantGalleriesForHandle(inspectorId)}
                  >
                    Добавить выбранное во все галереи
                  </button>
                </div>
              ) : null}
              <details style={{ marginTop: 10, borderTop: "1px dashed #cbd5e1", paddingTop: 10 }}>
                <summary style={{ cursor: "pointer", fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Manual assignment (by media id)
                </summary>
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11, color: selectedHandle ? "#334155" : "#b45309", marginBottom: 6 }}>
                    Active product: <strong>{selectedHandle || "Select product first"}</strong>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 6 }}>
                    <input
                      value={manualMediaId}
                      onChange={(e) => setManualMediaId(e.target.value)}
                      placeholder="media id"
                      style={{ ...inputStyle, fontSize: 12, padding: "6px 8px", gridColumn: "1 / -1" }}
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
                        ? Object.entries(
                            variantsByHandle[selectedHandle.toLowerCase()] ?? {
                              [DEFAULT_VARIANT_KEY]: emptyVariant(LABEL_NEEDS_REVIEW_RU, { sourceLabel: "default" }),
                            }
                          ).map(([k, v]) => (
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
                      style={{ ...miniBtn, gridColumn: "1 / -1" }}
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
              </details>
            </div>
            <div data-media-pool-scroll="true" style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", padding: 12 }}>
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
                  <div data-media-pool-grid="true">
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
                      const appendAll = mediaCanAppendToAllGalleries(
                        inv,
                        ce,
                        selectedHandle || "",
                        selectedProductSku,
                        bulkColorVariantCount
                      )
                      return (
                        <div key={id} data-media-pool-card-wrap="true">
                          <MediaImageCard
                            inventoryId={id}
                            inv={inv}
                            productHandle={selectedHandle}
                            previewUrl={pv.url}
                            useImg={pv.useImg}
                            caption={pv.caption}
                            displayMode="pool"
                            sourcePath={inv.repo_relative_path || inv.source_path}
                            sourceType={inv.source_type}
                            confidenceLabel={null}
                            previewable={inv.previewable}
                            badges={poolBadges.slice(0, 1)}
                            size="pool"
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
                            detailTitle={inv.source_path || inv.repo_relative_path || inv.filename}
                          />
                          {elsewhere ? (
                            <div style={{ fontSize: 11, color: "#b45309", lineHeight: 1.35 }}>Assigned: {elsewhere}.</div>
                          ) : null}
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            <button
                              type="button"
                              data-action-button="primary"
                              data-media-id={id}
                              draggable={false}
                              style={miniBtn}
                              disabled={!selectedHandle}
                              title={!selectedHandle ? "Select a product first" : "Сделать главным фото"}
                              aria-label="Сделать главным фото"
                              onMouseDown={(e) => e.stopPropagation()}
                              onDragStart={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                              }}
                              onClick={() =>
                                applyAssignment(
                                  selectedHandle && seedInvIdsMatchedFromStorefront.has(id) ? "selected-product-default" : "button",
                                  id,
                                  "primary"
                                )
                              }
                            >
                              Главное
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
                              onClick={() =>
                                applyAssignment(
                                  selectedHandle && seedInvIdsMatchedFromStorefront.has(id) ? "selected-product-default" : "button",
                                  id,
                                  "gallery"
                                )
                              }
                            >
                              Gallery
                            </button>
                            <button
                              type="button"
                              data-action-button="add-to-all-galleries"
                              data-media-id={id}
                              draggable={false}
                              style={{ ...miniBtn, fontWeight: 700 }}
                              disabled={!appendAll.ok}
                              title={appendAll.hint}
                              onMouseDown={(e) => e.stopPropagation()}
                              onDragStart={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                              }}
                              onClick={() => appendMediaToAllVariantGalleriesForHandle(id)}
                            >
                              Во все галереи
                            </button>
                            <details style={{ flex: "1 1 100%", minWidth: 0 }}>
                              <summary style={{ cursor: "pointer", fontSize: 10, color: "#94a3b8", fontWeight: 700, padding: "2px 0" }}>More</summary>
                              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
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
                              onClick={() =>
                                applyAssignment(
                                  selectedHandle && seedInvIdsMatchedFromStorefront.has(id) ? "selected-product-default" : "button",
                                  id,
                                  "reference"
                                )
                              }
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
                            </details>
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
              style={{ flexShrink: 0, borderTop: "1px solid #e2e8f0", background: "#fafafa" }}
            >
              <summary style={{ cursor: "pointer", padding: "10px 12px", fontSize: 11, fontWeight: 800, color: "#334155" }}>Debug / Diagnostics</summary>
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
                  <button
                    type="button"
                    data-action-button="inspector-primary"
                    style={miniBtn}
                    title="Сделать главным фото"
                    aria-label="Сделать главным фото"
                    onClick={() => applyAssignment("button", inspectorId, "primary")}
                  >
                    Сделать главным
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
const chipBtn: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  padding: "4px 8px",
  borderRadius: 6,
  border: "1px solid #cbd5e1",
  background: "#fff",
  cursor: "pointer",
  minWidth: 28,
  lineHeight: 1.2,
}
const btnDangerChip: React.CSSProperties = {
  ...chipBtn,
  color: "#b91c1c",
  borderColor: "#fecaca",
}
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
