export type OxfordSkuReviewStatus =
  | "ready_for_visual_review"
  | "product_missing_for_media_assignment"
  | "has_ambiguous_media"
  | "has_only_interim_media"
  | "no_media_candidates"

export type OxfordReviewMediaItem = {
  media_key: string
  preview_url: string | null
  source_display: string
  filename: string
  source_kind?: string
  confidence?: string
  match_tier?: string
  media_class?: string
  recommended_use?: string
  matched_sku: string | null
  matched_handle: string | null
  warnings: string[]
  is_orphan: boolean
  role?: "candidate" | "planned_primary" | "planned_gallery" | "gallery_backlog" | "inventory_only"
}

export type OxfordSkuReviewRow = {
  sku: string
  handle: string
  title_or_canonical: string | null
  product_in_local_medusa_db: boolean
  planned_primary_url: string | null
  planned_primary_tier: string | null
  planned_gallery_urls: string[]
  gallery_review_backlog_urls: string[]
  candidates: OxfordReviewMediaItem[]
  media_items: OxfordReviewMediaItem[]
  warnings: string[]
  review_status: OxfordSkuReviewStatus
}

export type OxfordReviewAggregate = {
  total_sku_rows: number
  products_in_local_medusa: number
  product_missing_rows: number
  total_inventory_records: number
  media_confirmed: number
  media_probable: number
  media_ambiguous: number
  media_unassigned: number
  sku_rows_with_gallery_backlog: number
  orphan_media_count: number
}

export type OxfordLocalMvpMediaReviewPayload = {
  static_base_url: string
  sku_rows: OxfordSkuReviewRow[]
  orphan_media: OxfordReviewMediaItem[]
  aggregate: OxfordReviewAggregate
  load_errors: string[]
}
