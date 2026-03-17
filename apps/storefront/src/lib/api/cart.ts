import { getBaseUrl, medusaFetch } from "./base"

export async function createCart() {
  const base = getBaseUrl()
  const res = await medusaFetch(`${base}/store/carts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  })
  if (!res.ok) {
    const text = await res.text()
    let message = "Не удалось создать корзину."
    try {
      const data = text ? JSON.parse(text) : null
      if (data && typeof data.message === "string") {
        message = data.message
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

export const CART_NOT_FOUND = "CART_NOT_FOUND"

export async function getCart(cartId: string) {
  const base = getBaseUrl()
  const res = await medusaFetch(`${base}/store/carts/${cartId}`)
  if (res.status === 404) throw new Error(CART_NOT_FOUND)
  if (!res.ok) {
    const text = await res.text()
    let message = "Не удалось загрузить корзину."
    try {
      const data = text ? JSON.parse(text) : null
      if (data && typeof data.message === "string") {
        message = data.message
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
    const text = await res.text()
    let message = "Не удалось обновить корзину."
    try {
      const data = text ? JSON.parse(text) : null
      if (data && typeof data.message === "string") {
        message = data.message
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

export async function addLineItem(cartId: string, body: { variant_id: string; quantity?: number }) {
  const base = getBaseUrl()
  const res = await medusaFetch(`${base}/store/carts/${cartId}/line-items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    let message = "Не удалось добавить товар в корзину."
    try {
      const data = text ? JSON.parse(text) : null
      if (data && typeof data.message === "string") {
        message = data.message
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

export async function removeLineItem(cartId: string, lineId: string) {
  const base = getBaseUrl()
  const res = await medusaFetch(`${base}/store/carts/${cartId}/line-items/${lineId}`, {
    method: "DELETE",
  })
  if (!res.ok) {
    const text = await res.text()
    let message = "Не удалось удалить товар из корзины."
    try {
      const data = text ? JSON.parse(text) : null
      if (data && typeof data.message === "string") {
        message = data.message
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
