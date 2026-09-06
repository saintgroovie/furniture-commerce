import type { WorkspacePublishReadiness } from "./publish-readiness"

export type ProductReadinessSummary = {
  published: boolean
  visible: boolean
  has_price: boolean
  has_media: boolean
  warning_count: number
  error_count: number
  codes: string[]
}

export type AttentionCounts = {
  missing_media: number
  missing_price: number
  drafts: number
  published_invisible: number
}

export type VariantRubPrice = {
  id: string | null
  amount: number
  currency_code: string
}

export type SellerVariant = {
  id: string
  sku: string | null
  title: string | null
  rub_price: VariantRubPrice | null
}

export type SellerPriceDisplay =
  | { kind: "none" }
  | { kind: "single"; amount: number }
  | { kind: "range"; min: number; max: number; variant_count: number }

export type SellerDimensionsMm = {
  height_mm?: number
  width_mm?: number
  depth_mm?: number
}

export type SellerExecutionFinish = {
  key: string
  label: string
  photo_count: number
}

export type SellerProduct = {
  id: string
  title: string
  subtitle: string
  description: string
  handle: string
  status: string
  thumbnail: string | null
  updated_at: string | null
  collection_label: string | null
  classification: string
  skus: string[]
  variants: SellerVariant[]
  price_display: SellerPriceDisplay
  readiness: ProductReadinessSummary
  execution_media_guard: boolean
  dimensions: SellerDimensionsMm
  image_urls: string[]
  general_image_urls: string[]
  execution_photo_count: number
  execution_finishes: SellerExecutionFinish[]
  has_material_tiers: boolean
  collection_key: string | null
  publish: WorkspacePublishReadiness
}

export type WoodrightProductsResponse = {
  products: SellerProduct[]
  attention: AttentionCounts
  site_url: string
  publish_gate_audit: {
    evaluated: number
    published: number
    would_fail: number
    by_code: Record<string, number>
  }
}

export type AttentionFilter =
  | "all"
  | "missing_media"
  | "missing_price"
  | "drafts"
  | "published_invisible"
