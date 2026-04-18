/**
 * Oliver-only: align `images[0].url` with existing `thumbnail` for a fixed handle list.
 *
 * - Scope: exactly 11 handles (API drift after thumbnail-only backfill).
 * - Does not change `thumbnail`, metadata, variants, or prices.
 * - Reorders `images` so the first entry matches `thumbnail`; removes duplicate thumbnail URL
 *   from later positions; if `thumbnail` is missing from `images`, prepends it (product.thumbnail
 *   is the canonical primary already set on the entity).
 * - Idempotent: no-op when `images[0]?.url` already equals `thumbnail`.
 *
 * Run from apps/backend: yarn sync-oliver-primary-images
 */

import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

const TARGET_HANDLES = new Set([
  "ol-07-1",
  "ol-14-2",
  "ol-16-1",
  "ol-16-2",
  "ol-17-1",
  "ol-17-2",
  "ol-17-3",
  "ol-18-2",
  "ol-23-1",
  "ol-55-1",
  "ol-82-1",
])

type ProductImage = { url?: string | null } | null | undefined

type ProductRow = {
  id: string
  handle: string
  thumbnail?: string | null
  images?: ProductImage[]
}

function normalizeUrl(u: string | null | undefined): string | null {
  if (!u || typeof u !== "string") return null
  const t = u.trim()
  return t.length ? t : null
}

function extractImageUrls(images: ProductImage[] | undefined): string[] {
  const out: string[] = []
  for (const im of images ?? []) {
    const u = normalizeUrl(im?.url as string | undefined)
    if (u && !out.includes(u)) out.push(u)
  }
  return out
}

function buildSyncedImages(thumbnail: string, existingUrls: string[]): { url: string }[] {
  const thumb = normalizeUrl(thumbnail)
  if (!thumb) return existingUrls.map((u) => ({ url: u }))
  const rest = existingUrls.filter((u) => u !== thumb)
  return [thumb, ...rest].map((url) => ({ url }))
}

export default async function syncOliverPrimaryImages({ container }: ExecArgs) {
  const logger = container.resolve("logger") as { info: (s: string) => void; warn: (s: string) => void }
  const productModule = container.resolve(Modules.PRODUCT) as {
    listProducts: (
      filters: Record<string, unknown>,
      config?: { take?: number; relations?: string[] }
    ) => Promise<ProductRow[]>
    updateProducts: (
      idOrSelector: string | Record<string, unknown>,
      data: { images?: Array<{ url: string }> }
    ) => Promise<unknown>
  }

  logger.info("=== Oliver primary image order sync (11 handles) ===")

  const handleList = Array.from(TARGET_HANDLES)
  const listed = await productModule.listProducts(
    { handle: handleList },
    { take: 32, relations: ["images"] }
  )
  const byHandle = new Map((listed ?? []).map((p) => [p.handle, p]))

  let updated = 0
  let unchanged = 0
  const errors: string[] = []

  for (const handle of handleList.sort()) {
    const product = byHandle.get(handle)
    if (!product) {
      errors.push(`Product not found for handle "${handle}".`)
      continue
    }

    const thumb = normalizeUrl(product.thumbnail)
    if (!thumb) {
      errors.push(`Handle "${handle}": missing thumbnail — cannot sync images.`)
      continue
    }

    const urls = extractImageUrls(product.images as ProductImage[] | undefined)
    const first = urls[0] ?? null
    if (first === thumb) {
      unchanged++
      continue
    }

    const nextImages = buildSyncedImages(thumb, urls)
    if (nextImages.length === 0) {
      errors.push(`Handle "${handle}": would produce empty images array.`)
      continue
    }

    await productModule.updateProducts(product.id, { images: nextImages })
    updated++
    logger.info(`Synced images[0] for ${handle} (${urls.length} -> ${nextImages.length} images)`)
  }

  if (errors.length) {
    for (const e of errors) logger.warn(`ERROR: ${e}`)
    throw new Error(`sync-oliver-primary-images failed: ${errors.length} error(s).`)
  }

  logger.info(`Updated: ${updated}, already aligned: ${unchanged}.`)
  logger.info("=== Oliver primary image order sync complete ===")
}
