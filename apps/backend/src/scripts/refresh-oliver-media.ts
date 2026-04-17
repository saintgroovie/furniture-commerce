/**
 * Oliver-only media URL backfill for local static serving.
 *
 * - Scope: products with handle `ol-*` only.
 * - Rewrites media URLs from `/uploads/products/oliver/` to `/static/products/oliver/`.
 * - Updates `thumbnail` and `images[].url` only.
 * - Idempotent and safe to re-run.
 *
 * Run from apps/backend: yarn refresh-oliver-media
 *   or: npx medusa exec ./src/scripts/refresh-oliver-media.ts
 */

import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

type ProductImage = { url?: string } | null | undefined
type ProductRow = {
  id: string
  handle: string
  thumbnail?: string | null
  images?: ProductImage[]
}

const OLIVER_HANDLE_PREFIX = "ol-"
const FROM_SEGMENT = "/uploads/products/oliver/"
const TO_SEGMENT = "/static/products/oliver/"

function normalizeOliverMediaUrl(url: string | null | undefined): string | null | undefined {
  if (!url || typeof url !== "string") return url
  if (!url.includes(FROM_SEGMENT)) return url
  return url.replace(FROM_SEGMENT, TO_SEGMENT)
}

function normalizeImageList(images: ProductImage[] | undefined): { url: string }[] {
  const result: { url: string }[] = []
  for (const image of images ?? []) {
    const url = normalizeOliverMediaUrl(image?.url)
    if (url && typeof url === "string") {
      result.push({ url })
    }
  }
  return result
}

export default async function refreshOliverMedia({ container }: ExecArgs) {
  const logger = container.resolve("logger") as { info: (s: string) => void }
  const productModule = container.resolve(Modules.PRODUCT) as {
    listProducts: (
      filters: Record<string, unknown>,
      config?: { take?: number; relations?: string[] }
    ) => Promise<ProductRow[]>
    updateProducts: (
      idOrSelector: string | Record<string, unknown>,
      data: { thumbnail?: string | null; images?: Array<{ url: string }> }
    ) => Promise<unknown>
  }

  logger.info("=== Oliver media URL refresh ===")

  const listed = await productModule.listProducts({}, { take: 2500, relations: ["images"] })
  const products = (listed ?? []).filter((p) => p.handle?.startsWith(OLIVER_HANDLE_PREFIX))

  if (products.length === 0) {
    logger.info("No Oliver products found (handle prefix ol-*).")
    return
  }

  let updated = 0
  let unchanged = 0

  for (const product of products) {
    const nextThumbnail = normalizeOliverMediaUrl(product.thumbnail)
    const nextImages = normalizeImageList(product.images)

    const currentImages = (product.images ?? [])
      .map((image) => (image?.url && typeof image.url === "string" ? image.url : null))
      .filter((url): url is string => Boolean(url))

    const nextImageUrls = nextImages.map((image) => image.url)
    const thumbnailChanged = (product.thumbnail ?? null) !== (nextThumbnail ?? null)
    const imagesChanged = JSON.stringify(currentImages) !== JSON.stringify(nextImageUrls)

    if (!thumbnailChanged && !imagesChanged) {
      unchanged++
      continue
    }

    await productModule.updateProducts(product.id, {
      thumbnail: nextThumbnail ?? null,
      images: nextImages,
    })
    updated++
  }

  logger.info(`Updated media URLs for ${updated} Oliver products.`)
  logger.info(`Unchanged Oliver products: ${unchanged}.`)
  logger.info("=== Oliver media URL refresh complete ===")
}
