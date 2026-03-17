import { getBaseUrl, medusaFetch } from "./base"

export async function getProducts() {
  const base = getBaseUrl()
  const url = `${base}/store/products`
  const res = await medusaFetch(url)
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
  const res = await medusaFetch(`${base}/store/products/${id}`)
  if (res.status === 404) throw new Error(NOT_FOUND)
  if (!res.ok) {
    const text = await res.text()
    let message = "Не удалось загрузить товар."
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
