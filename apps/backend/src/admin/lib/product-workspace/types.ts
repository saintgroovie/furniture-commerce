export type WoodrightProductTypeCode =
  | "STANDARD"
  | "CONFIGURABLE"
  | "BESPOKE"

export type ClassificationView = {
  code: WoodrightProductTypeCode | null
  label: string
  warning: string | null
  source: "productClassification.product_type" | "missing"
}

export type PriceAmount = {
  amount: number
  currency_code: string
}

export type PriceSummaryView = {
  groups: Array<{
    currency_code: string
    min: number
    max: number
    priced_variant_count: number
  }>
  variants_without_price: number
  variant_count: number
  label: string
  warning: string | null
}

export type MediaSummaryView = {
  has_thumbnail: boolean
  image_count: number
  preview_urls: string[]
  warnings: string[]
}

export type ProductWorkspaceTabId =
  | "overview"
  | "variants"
  | "gallery"
  | "inventory"
  | "promotions"
  | "seo"
  | "technical"

export type SaveStatus =
  | "clean"
  | "dirty"
  | "saving"
  | "saved"
  | "error"
  | "conflict"

export type EditableProductFields = {
  title: string
  description: string
  status: "draft" | "published" | "proposed" | "rejected"
}

export type AdminProductPayload = {
  id: string
  title?: string | null
  description?: string | null
  handle?: string | null
  status?: string | null
  thumbnail?: string | null
  updated_at?: string | null
  collection?: { id?: string; title?: string | null } | null
  images?: Array<{ id?: string; url?: string | null }> | null
  variants?: Array<{ id?: string; sku?: string | null; title?: string | null }> | null
  productClassification?: { product_type?: string | null } | null
  product_classification?: { product_type?: string | null } | null
  /** @deprecated legacy joiner name before product_classification rename */
  productType?: { product_type?: string | null } | null
  product_type?: { product_type?: string | null } | null
  metadata?: Record<string, unknown> | null
}
