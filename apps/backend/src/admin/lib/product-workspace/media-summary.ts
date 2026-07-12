import type { AdminProductPayload, MediaSummaryView } from "./types"

const DEFAULT_PREVIEW_LIMIT = 8

/**
 * Media SoT: product.thumbnail + product.images only (not variant.images).
 */
export function buildMediaSummary(
  product: Pick<AdminProductPayload, "thumbnail" | "images">,
  previewLimit = DEFAULT_PREVIEW_LIMIT
): MediaSummaryView {
  const thumb =
    typeof product.thumbnail === "string" && product.thumbnail.trim()
      ? product.thumbnail.trim()
      : null
  const imageUrls = (product.images ?? [])
    .map((img) => (typeof img?.url === "string" ? img.url.trim() : ""))
    .filter(Boolean)

  const warnings: string[] = []
  if (!thumb) warnings.push("Нет главного фото (thumbnail).")
  if (imageUrls.length === 0) warnings.push("Галерея пуста.")

  const preview_urls: string[] = []
  if (thumb) preview_urls.push(thumb)
  for (const url of imageUrls) {
    if (preview_urls.length >= previewLimit) break
    if (!preview_urls.includes(url)) preview_urls.push(url)
  }

  return {
    has_thumbnail: Boolean(thumb),
    image_count: imageUrls.length,
    preview_urls,
    warnings,
  }
}
