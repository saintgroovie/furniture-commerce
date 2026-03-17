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
    const text = await res.text()
    let message = "Не удалось загрузить комплект."
    try {
      const data = text ? JSON.parse(text) : null
      if (data && typeof (data as { message?: unknown }).message === "string") {
        message = (data as { message: string }).message
      } else if (text) {
        message = text
      }
    } catch {
      if (text) message = text
    }
    throw new Error(message)
  }
  return res.json()
}
