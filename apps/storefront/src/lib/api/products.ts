import { getBaseUrl } from "./base"

export async function getProducts(params?: { category_id?: string; product_type?: string }) {
  const base = getBaseUrl()
  const search = new URLSearchParams()
  if (params?.category_id) search.set("category_id", params.category_id)
  if (params?.product_type) search.set("product_type", params.product_type)
  const url = `${base}/store/products${search.toString() ? `?${search}` : ""}`
  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text()
    let message = "Не удалось загрузить каталог."
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

export const NOT_FOUND = "NOT_FOUND"

export async function getProduct(id: string) {
  const base = getBaseUrl()
  const res = await fetch(`${base}/store/products/${id}`)
  if (res.status === 404) throw new Error(NOT_FOUND)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { message?: string }).message ?? await res.text())
  }
  return res.json()
}
