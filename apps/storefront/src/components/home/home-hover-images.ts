import { getBaseUrl, medusaFetch } from "@/lib/api/base"
import {
  collectExtraProductImageUrls,
  resolveStorefrontProductImageSrc,
} from "@/lib/product-images"

/**
 * The catalog projection is hero-only (`images` always empty), so the second
 * shot for the hover cross-fade is fetched separately — one bounded request
 * for the few showcased products only.
 */
export async function loadHoverImages(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (ids.length === 0) return out
  try {
    const search = new URLSearchParams({ fields: "id,thumbnail,*images", limit: String(ids.length) })
    for (const id of ids) search.append("id[]", id)
    const res = await medusaFetch(`${getBaseUrl()}/store/products?${search}`)
    if (!res.ok) return out
    const data = (await res.json()) as { products?: Record<string, unknown>[] }
    for (const p of data.products ?? []) {
      const id = typeof p.id === "string" ? p.id : null
      const thumb = typeof p.thumbnail === "string" ? p.thumbnail : ""
      if (!id) continue
      const extras = collectExtraProductImageUrls(p, thumb)
      if (extras.length > 0) out.set(id, resolveStorefrontProductImageSrc(extras[0]))
    }
  } catch {
    // Hover shots are progressive enhancement — cards render fine without them.
  }
  return out
}
