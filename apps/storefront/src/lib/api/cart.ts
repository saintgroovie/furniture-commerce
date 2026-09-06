import { getBaseUrl, medusaFetch } from "./base"

async function defaultCartCreateBody(): Promise<Record<string, unknown>> {
  const base = getBaseUrl()
  try {
    const res = await medusaFetch(`${base}/store/regions`)
    if (!res.ok) return {}
    const data = (await res.json()) as { regions?: Array<{ id?: string }> }
    const regionId = data.regions?.[0]?.id
    return regionId ? { region_id: regionId } : {}
  } catch {
    return {}
  }
}

export async function createCart() {
  const base = getBaseUrl()
  const body = await defaultCartCreateBody()
  const res = await medusaFetch(`${base}/store/carts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export const CART_NOT_FOUND = "CART_NOT_FOUND"

/**
 * Expand line-item product metadata so cart Kids grouping can use
 * storefront_section / willie-winkie collection without a catalog fan-out.
 * `+` keeps default cart retrieve fields.
 */
const CART_RETRIEVE_FIELDS = "+items.product.metadata"

export async function getCart(cartId: string) {
  const base = getBaseUrl()
  const res = await medusaFetch(
    `${base}/store/carts/${cartId}?fields=${encodeURIComponent(CART_RETRIEVE_FIELDS)}`
  )
  if (res.status === 404) throw new Error(CART_NOT_FOUND)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function updateCart(
  cartId: string,
  body: { email?: string; shipping_address?: Record<string, unknown> }
) {
  const base = getBaseUrl()
  const res = await medusaFetch(`${base}/store/carts/${cartId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { message?: string }).message ?? await res.text())
  }
  return res.json()
}

export async function addLineItem(
  cartId: string,
  body: { variant_id: string; quantity?: number; metadata?: Record<string, unknown> }
) {
  const base = getBaseUrl()
  const res = await medusaFetch(`${base}/store/carts/${cartId}/line-items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.message ?? await res.text())
  }
  return res.json()
}

export async function removeLineItem(cartId: string, lineId: string) {
  const base = getBaseUrl()
  const res = await medusaFetch(`${base}/store/carts/${cartId}/line-items/${lineId}`, {
    method: "DELETE",
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
