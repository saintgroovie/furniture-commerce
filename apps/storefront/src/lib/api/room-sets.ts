import { getBaseUrl, medusaFetch } from "./base"

export async function getRoomSets() {
  const base = getBaseUrl()
  const res = await medusaFetch(`${base}/store/room-sets`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export const NOT_FOUND = "NOT_FOUND"

export async function getRoomSetBySlug(slug: string) {
  const base = getBaseUrl()
  const res = await medusaFetch(`${base}/store/room-sets/${slug}`)
  if (res.status === 404) throw new Error(NOT_FOUND)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { message?: string }).message ?? await res.text())
  }
  return res.json()
}

/**
 * Lean RoomSet detail: items → product.id only (`?view=product_ids`).
 * Default full detail (`getRoomSetBySlug`) is unchanged for /rooms.
 */
export async function getRoomSetProductIdsBySlug(slug: string) {
  const base = getBaseUrl()
  const res = await medusaFetch(
    `${base}/store/room-sets/${encodeURIComponent(slug)}?view=product_ids`
  )
  if (res.status === 404) throw new Error(NOT_FOUND)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { message?: string }).message ?? await res.text())
  }
  return res.json() as Promise<{
    room_set?: {
      items?: Array<{ product?: { id?: string } }>
    }
  }>
}
