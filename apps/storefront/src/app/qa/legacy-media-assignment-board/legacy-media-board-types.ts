export type InvItem = {
  id: string
  source_type: string
  source_path: string | null
  repo_relative_path: string | null
  filename: string
  collection_hint: string | null
  sku_hint: string | null
  handle_hint: string | null
  exists_locally: boolean
  previewable: boolean
  preview_reason: string | null
}

export type CandidateEntry = {
  inventory_id: string
  confidence: string
  identity_confidence: string
  filename: string
  source_type: string
  previewable: boolean
  top_candidate: {
    medusa_product_handle: string
    medusa_variant_sku: string
    medusa_collection_handle: string
    score: number
    basis: string[]
  } | null
  candidates: Array<{
    medusa_product_handle: string
    medusa_variant_sku: string
    medusa_collection_handle: string
    score: number
    basis: string[]
  }>
}

export type ProductRow = {
  handle: string
  sku: string
  collection: string
  title: string | null
  image_urls: string[]
}

/** Drag payload for legacy media board (written to dataTransfer as JSON + text/plain). */
export type LegacyMediaDragZone = "primary" | "gallery" | "reference" | "lane_reject" | "pool"

export type LegacyMediaDragPayload = {
  type: "legacy_media"
  mediaId: string
  fromProductHandle?: string | null
  fromZone?: LegacyMediaDragZone | null
  fromIndex?: number | null
}
