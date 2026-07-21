import { formatRub, getPrice } from "@/lib/format"
import { getArticle, getCollectionLabel } from "@/lib/product-metadata"
import {
  collectExtraProductImageUrls,
  resolveStorefrontProductImageSrc,
} from "@/lib/product-images"
import { resolveHomeImageSrc } from "./home-image"

/** Serializable product slice for homepage sections (no business logic). */
export type HomeProduct = {
  id: string
  handle: string | null
  title: string
  href: string
  img: string
  /** Second product shot for the hover cross-fade (may be null). */
  hoverImg: string | null
  /** Curated finish-variant shots the card slowly cycles through. */
  variantImgs: string[]
  priceLabel: string | null
  collectionLabel: string | null
  article: string | null
}

export function toHomeProduct(product: Record<string, unknown>): HomeProduct | null {
  const id = typeof product.id === "string" ? product.id : null
  const title = typeof product.title === "string" ? product.title : null
  const thumbRaw = typeof product.thumbnail === "string" ? product.thumbnail.trim() : ""
  if (!id || !title || !thumbRaw) return null
  const price = getPrice(product)
  const extra = collectExtraProductImageUrls(product, thumbRaw)
  const resolveHome = (raw: string) => resolveHomeImageSrc(resolveStorefrontProductImageSrc(raw))
  return {
    id,
    handle: typeof product.handle === "string" ? product.handle : null,
    title,
    href: `/product/${id}`,
    img: resolveHome(thumbRaw),
    hoverImg: extra.length > 0 ? resolveHome(extra[0]) : null,
    variantImgs: [],
    priceLabel: price != null ? formatRub(price) : null,
    collectionLabel: getCollectionLabel(product),
    article: getArticle(product),
  }
}

/** Pick products by handle in the given order; skip missing ones. */
export function pickByHandles(
  products: Record<string, unknown>[],
  handles: string[]
): HomeProduct[] {
  const byHandle = new Map<string, Record<string, unknown>>()
  for (const p of products) {
    const h = typeof p.handle === "string" ? p.handle : null
    if (h && !byHandle.has(h)) byHandle.set(h, p)
  }
  const out: HomeProduct[] = []
  for (const handle of handles) {
    const p = byHandle.get(handle)
    if (!p) continue
    const hp = toHomeProduct(p)
    if (hp) out.push(hp)
  }
  return out
}
