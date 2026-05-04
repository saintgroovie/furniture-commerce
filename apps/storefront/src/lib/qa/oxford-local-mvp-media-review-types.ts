export type OxfordSkuReviewStatus =
  | "ready_for_visual_review"
  | "product_missing_for_media_assignment"
  | "has_ambiguous_media"
  | "has_only_interim_media"
  | "no_media_candidates"

export type OxfordPreviewStatus =
  | "preview_url_ready"
  | "local_file_preview_ready"
  | "backend_static_preview_ready"
  | "manifest_only_no_local_file"
  | "source_not_mounted"
  | "unsupported_path"
  | "file_missing"

export type OxfordReviewMediaItem = {
  media_key: string
  preview_url: string | null
  preview_status: OxfordPreviewStatus
  preview_error_reason?: string | null
  /** Short path / handle for collapsed details */
  debug_source_path?: string | null
  /** Optional legacy HTTP URL when present on inventory row */
  manifest_http_url?: string | null
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
  /** All media_items across SKU rows + orphan_media */
  review_total_media_items: number
  /** Count where an <img> with preview_url is expected to work */
  review_media_with_img_preview: number
  review_media_without_img_preview: number
  orphan_with_img_preview: number
  orphan_without_img_preview: number
}

export type OxfordLocalMvpMediaReviewPayload = {
  static_base_url: string
  sku_rows: OxfordSkuReviewRow[]
  orphan_media: OxfordReviewMediaItem[]
  aggregate: OxfordReviewAggregate
  load_errors: string[]
}

/** Client + server safe — do not import from server-only preview modules in client components. */
export function previewCanUseImgTag(m: Pick<OxfordReviewMediaItem, "preview_url" | "preview_status">): boolean {
  return Boolean(
    m.preview_url &&
      (m.preview_status === "preview_url_ready" ||
        m.preview_status === "backend_static_preview_ready" ||
        m.preview_status === "local_file_preview_ready")
  )
}
