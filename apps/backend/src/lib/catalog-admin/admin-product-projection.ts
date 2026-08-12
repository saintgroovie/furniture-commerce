/**
 * Admin product projection — buyer truth first for managers.
 * Pure / fail-closed: never throws on malformed metadata.
 */

import { resolvePublicProductTitle } from "../catalog-normalization/public-title"
import { isMedusaStubOptionTitle } from "../catalog-normalization/option-taxonomy"
import { resolveFurnitureDimensions } from "../woodright-dimensions/resolve"
import { formatDimensionsForDisplay } from "../woodright-dimensions/format"
import { AXIS_OWNER_LABEL, DIMENSION_AXIS_ORDER, AXIS_TO_MM_KEY } from "../woodright-dimensions/types"
import {
  DIMENSIONS_TRUST_STATE_LABEL_RU,
  lookupDimensionsTrust,
  type DimensionsTrustState,
} from "./dimensions-trust"
import {
  formatAxisGlance,
  summarizeBuyerOptions,
  summarizeNativeMedusaOptions,
  type BuyerAxisSummary,
} from "./buyer-options-summary"

export type DataQualityKind =
  | "ok"
  | "needs_source"
  | "conflict"
  | "pending_confirmation"
  | "content_improvement"
  | "malformed"

export type AdminProductProjection = {
  product_id: string | null
  handle: string | null
  sku: string | null
  status: string | null
  classification: string | null
  public_title: string
  public_title_source: string
  technical_title: string | null
  legacy_title: string | null
  legacy_cs_cart_product_id: string | null
  collection_hint: string | null
  buyer_axes: BuyerAxisSummary[]
  native_option_fallback: Array<{ title: string; values: string[] }>
  has_buyer_options: boolean
  technical_variant_count: number
  technical_default_hidden: boolean
  price: {
    /** Raw first-variant Medusa amount — NOT guaranteed storefront price. */
    medusa_base_label: string | null
    semantics_ru: string
  }
  dimensions: {
    height_mm: number | null
    width_mm: number | null
    depth_mm: number | null
    display_lines: string[]
    compact_mm: string | null
    trust_state: DimensionsTrustState
    trust_label_ru: string
    manager_hint_ru: string
    technical_note: string | null
    block_casual_edit: boolean
    missing_axes: Array<"H" | "W" | "D">
  }
  media: {
    thumbnail: string | null
    image_count: number
  }
  data_quality: {
    kind: DataQualityKind
    label_ru: string
    warnings: string[]
  }
}

export type AdminProjectionInput = {
  id?: string | null
  title?: string | null
  handle?: string | null
  status?: string | null
  thumbnail?: string | null
  metadata?: Record<string, unknown> | null
  options?: Array<{ title?: string; values?: Array<{ value?: string }> }> | null
  images?: Array<{ url?: string }> | null
  variants?: Array<{
    id?: string
    title?: string
    sku?: string
    prices?: Array<{ amount?: number; currency_code?: string }>
    metadata?: Record<string, unknown> | null
  }> | null
  /** From product_classification when available. */
  classification?: string | null
  collection_title?: string | null
}

function axisLetter(axis: "height" | "width" | "depth"): "H" | "W" | "D" {
  if (axis === "height") return "H"
  if (axis === "width") return "W"
  return "D"
}

function formatMedusaAmount(
  amount: number | undefined,
  currency: string | undefined
): string | null {
  if (amount == null || !Number.isFinite(Number(amount))) return null
  const code = (currency ?? "").toUpperCase() || "—"
  return `${Number(amount).toLocaleString("ru-RU")} ${code}`.trim()
}

export function buildAdminProductProjection(
  data: AdminProjectionInput
): AdminProductProjection {
  const meta =
    data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? data.metadata
      : {}

  const resolved = resolvePublicProductTitle({
    title: data.title,
    handle: data.handle,
    metadata: meta,
  })

  const variants = data.variants ?? []
  const sku =
    variants.map((v) => v.sku).find((s) => typeof s === "string" && s.trim()) ??
    (typeof meta.sku === "string" ? meta.sku : null)

  const optionsSummary = summarizeBuyerOptions(meta)
  const nativeFallback = summarizeNativeMedusaOptions(data.options ?? [])

  const stubTitles = (data.options ?? []).some((o) =>
    isMedusaStubOptionTitle(o?.title ?? "")
  )
  const defaultVariant = variants[0]
  const price = defaultVariant?.prices?.[0]

  const dims = resolveFurnitureDimensions({
    product: { metadata: meta },
    variant: defaultVariant
      ? { metadata: defaultVariant.metadata ?? null }
      : null,
  })
  const trust = lookupDimensionsTrust({ sku, handle: data.handle })
  const display = formatDimensionsForDisplay(dims.mm, {
    unit: "mm",
    audience: "admin",
  })

  const display_lines: string[] = []
  if (display.mode === "compact" && display.compact) {
    display_lines.push(`${display.compact} мм`)
  } else if (display.mode === "partial") {
    display_lines.push(...display.lines)
  } else {
    display_lines.push(display.missing_label)
  }

  const missing_axes: Array<"H" | "W" | "D"> = []
  for (const axis of DIMENSION_AXIS_ORDER) {
    if (dims.mm[AXIS_TO_MM_KEY[axis]] == null) missing_axes.push(axisLetter(axis))
  }

  // Per-axis labeled detail for partial/conflict clarity
  if (display.mode !== "missing") {
    for (const axis of DIMENSION_AXIS_ORDER) {
      const v = dims.mm[AXIS_TO_MM_KEY[axis]]
      if (v == null) {
        display_lines.push(`${AXIS_OWNER_LABEL[axis]}: нет данных`)
      }
    }
  }

  const warnings: string[] = []
  let kind: DataQualityKind = "ok"
  let label_ru = "Ок"

  if (trust.state === "TEMPORARY_PENDING") {
    kind = "pending_confirmation"
    label_ru = "Временно"
    warnings.push(trust.manager_hint_ru)
  } else if (trust.state === "STRONG_CANDIDATE_PENDING_OWNER") {
    kind = "pending_confirmation"
    label_ru = "Нужно подтверждение"
    warnings.push(trust.manager_hint_ru)
  } else if (trust.state === "CONFLICT_SOURCE_DEBT") {
    kind = "conflict"
    label_ru = "Конфликт источников"
    warnings.push(trust.manager_hint_ru)
  } else if (trust.state === "MISSING_SOURCE_DEBT" || missing_axes.length === 3) {
    kind = "needs_source"
    label_ru = "Нужен источник"
    warnings.push(trust.manager_hint_ru || "Габариты отсутствуют - не угадывайте")
  } else if (missing_axes.length > 0 && trust.state === "UNKNOWN") {
    kind = "needs_source"
    label_ru = "Неполные габариты"
    warnings.push(`Не заполнены оси: ${missing_axes.join(", ")}`)
  }

  if (optionsSummary.has_malformed) {
    warnings.push("В покупательских опциях есть некорректные строки - сырые данные сохранены")
    if (kind === "ok") {
      kind = "malformed"
      label_ru = "Повреждённые опции"
    }
  }
  if (optionsSummary.has_texture_content_debt) {
    warnings.push("Texture-образец отсутствует - покупатель видит текст (это content debt, не ошибка)")
    if (kind === "ok") {
      kind = "content_improvement"
      label_ru = "Можно улучшить"
    }
  }

  const classification =
    data.classification ??
    (typeof meta.product_type === "string" ? meta.product_type : null)

  const legacyId =
    typeof meta.legacy_cs_cart_product_id === "string"
      ? meta.legacy_cs_cart_product_id
      : meta.legacy_cs_cart_product_id != null
        ? String(meta.legacy_cs_cart_product_id)
        : null

  return {
    product_id: data.id ?? null,
    handle: data.handle ?? null,
    sku: sku ? String(sku) : null,
    status: data.status ?? null,
    classification,
    public_title: resolved.public_title,
    public_title_source: resolved.source,
    technical_title: data.title ?? null,
    legacy_title:
      typeof meta.legacy_title === "string"
        ? meta.legacy_title
        : typeof meta.canonical_name === "string"
          ? meta.canonical_name
          : null,
    legacy_cs_cart_product_id: legacyId,
    collection_hint: data.collection_title ?? null,
    buyer_axes: optionsSummary.axes,
    native_option_fallback: nativeFallback,
    has_buyer_options:
      optionsSummary.axes.length > 0 || nativeFallback.length > 0,
    technical_variant_count: variants.length,
    technical_default_hidden: stubTitles,
    price: {
      medusa_base_label: formatMedusaAmount(price?.amount, price?.currency_code),
      semantics_ru:
        "Базовая цена Medusa (первый technical variant). Не равна автоматически цене на сайте при CONFIGURABLE / tiers",
    },
    dimensions: {
      height_mm: dims.mm.height_mm,
      width_mm: dims.mm.width_mm,
      depth_mm: dims.mm.depth_mm,
      display_lines,
      compact_mm: display.mode === "compact" ? display.compact : null,
      trust_state: trust.state,
      trust_label_ru: DIMENSIONS_TRUST_STATE_LABEL_RU[trust.state],
      manager_hint_ru: trust.manager_hint_ru,
      technical_note: trust.technical_note ?? null,
      block_casual_edit: trust.block_casual_verify_implication,
      missing_axes,
    },
    media: {
      thumbnail: data.thumbnail ?? null,
      image_count: Array.isArray(data.images) ? data.images.length : 0,
    },
    data_quality: { kind, label_ru, warnings },
  }
}

export function formatBuyerAxesForAdmin(axes: BuyerAxisSummary[]): string[] {
  return axes.map((a) => `${a.label_ru}: ${formatAxisGlance(a)}`)
}
