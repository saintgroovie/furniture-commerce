import { resolveAdminCollectionLabel } from "../../admin/lib/collection-display-labels"
import { readDimensionsMm } from "./dimensions-command"
import { hasExecutionMediaContract } from "./execution-media-guard"
import { pickPrimaryRubPrice } from "./price-sanity"
import { catalogPublishGateAudit, computeWorkspacePublishReadiness } from "./publish-readiness"
import { aggregateAttention, summarizeProductReadiness } from "./readiness-summary"
import type {
  AttentionCounts,
  SellerProduct,
  SellerPriceDisplay,
  SellerVariant,
} from "./seller-product-types"

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function flattenVariantPrices(product: Record<string, unknown>): Record<string, unknown> {
  const variants = product.variants
  if (!Array.isArray(variants)) return product
  return {
    ...product,
    variants: variants.map((raw) => {
      const variant = asRecord(raw)
      if (!variant) return raw
      if (variant.prices) return variant
      const nested = asRecord(variant.price_set)?.prices
      if (Array.isArray(nested)) return { ...variant, prices: nested }
      return variant
    }),
  }
}

function mapVariant(raw: unknown): SellerVariant | null {
  const variant = asRecord(raw)
  if (!variant) return null
  const id = typeof variant.id === "string" ? variant.id : ""
  if (!id) return null
  return {
    id,
    sku: typeof variant.sku === "string" && variant.sku ? variant.sku : null,
    title: typeof variant.title === "string" && variant.title ? variant.title : null,
    rub_price: pickPrimaryRubPrice(variant),
  }
}

function priceDisplay(variants: SellerVariant[]): SellerPriceDisplay {
  const amounts = variants
    .map((v) => v.rub_price?.amount)
    .filter((amount): amount is number => typeof amount === "number" && amount > 0)
  if (amounts.length === 0) return { kind: "none" }
  const min = Math.min(...amounts)
  const max = Math.max(...amounts)
  if (variants.length <= 1 || min === max) return { kind: "single", amount: min }
  return { kind: "range", min, max, variant_count: variants.length }
}

function classificationOf(product: Record<string, unknown>): string {
  const cls = asRecord(product.product_classification)
  const t = cls?.product_type
  if (t === "STANDARD" || t === "CONFIGURABLE" || t === "BESPOKE") return t
  return "UNKNOWN"
}

function imageUrlsOf(product: Record<string, unknown>): string[] {
  const urls: string[] = []
  const seen = new Set<string>()
  const push = (raw: unknown) => {
    if (typeof raw !== "string") return
    const url = raw.trim()
    if (!url || seen.has(url)) return
    seen.add(url)
    urls.push(url)
  }
  push(product.thumbnail)
  if (Array.isArray(product.images)) {
    for (const image of product.images) {
      if (typeof image === "string") push(image)
      else {
        const row = asRecord(image)
        push(row?.url)
      }
    }
  }
  return urls
}

export function toSellerProduct(raw: Record<string, unknown>): SellerProduct {
  const product = flattenVariantPrices(raw)
  const meta = asRecord(product.metadata) ?? {}
  const variants = (Array.isArray(product.variants) ? product.variants : [])
    .map(mapVariant)
    .filter((v): v is SellerVariant => v != null)
  const skus = variants.map((v) => v.sku).filter((sku): sku is string => Boolean(sku))
  const collection = asRecord(product.collection)

  const collectionKey =
    typeof meta.collection === "string" && meta.collection.trim() ? meta.collection : null

  return {
    id: String(product.id ?? ""),
    title: typeof product.title === "string" ? product.title : "",
    handle: typeof product.handle === "string" ? product.handle : "",
    status: typeof product.status === "string" ? product.status : "unknown",
    thumbnail: typeof product.thumbnail === "string" && product.thumbnail ? product.thumbnail : null,
    updated_at: typeof product.updated_at === "string" ? product.updated_at : null,
    collection_label: resolveAdminCollectionLabel({
      collectionTitle: typeof collection?.title === "string" ? collection.title : null,
      collectionHandle: typeof collection?.handle === "string" ? collection.handle : null,
      metadataCollection: collectionKey,
      metadataCollectionLabel:
        typeof meta.collection_label === "string" ? meta.collection_label : null,
    }),
    classification: classificationOf(product),
    skus,
    variants,
    price_display: priceDisplay(variants),
    readiness: summarizeProductReadiness(product),
    execution_media_guard: hasExecutionMediaContract(meta),
    dimensions: readDimensionsMm(meta),
    image_urls: imageUrlsOf(product),
    has_material_tiers: Boolean(meta.material_tiers && typeof meta.material_tiers === "object"),
    collection_key: collectionKey,
    publish: computeWorkspacePublishReadiness(product),
  }
}

export function toSellerProductList(products: Record<string, unknown>[]): {
  products: SellerProduct[]
  attention: AttentionCounts
  publish_gate_audit: ReturnType<typeof catalogPublishGateAudit>
} {
  const mapped = products.map(toSellerProduct)
  const attention = aggregateAttention(mapped.map((p) => p.readiness))
  attention.not_ready = mapped.filter((p) => !p.publish.ready).length
  return {
    products: mapped,
    attention,
    publish_gate_audit: catalogPublishGateAudit(mapped),
  }
}

export const SELLER_PRODUCT_GRAPH_FIELDS = [
  "id",
  "handle",
  "title",
  "status",
  "thumbnail",
  "metadata",
  "updated_at",
  "images.url",
  "collection.title",
  "collection.handle",
  "variants.id",
  "variants.sku",
  "variants.title",
  "variants.price_set.prices.id",
  "variants.price_set.prices.amount",
  "variants.price_set.prices.currency_code",
  "product_classification.product_type",
]

export type QueryGraph = {
  graph: (args: {
    entity: string
    fields: string[]
    filters?: Record<string, unknown>
    pagination?: { skip: number; take: number }
  }) => Promise<{ data: unknown[] }>
}

export async function loadSellerProductById(
  query: QueryGraph,
  id: string
): Promise<SellerProduct | null> {
  const { data } = await query.graph({
    entity: "product",
    fields: SELLER_PRODUCT_GRAPH_FIELDS,
    filters: { id },
  })
  const raw = data?.[0] as Record<string, unknown> | undefined
  return raw ? toSellerProduct(raw) : null
}

export type { AttentionCounts, ProductReadinessSummary } from "./seller-product-types"
