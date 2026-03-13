import { getBaseUrl } from "./base"

export async function getRegions() {
  const base = getBaseUrl()
  const res = await fetch(`${base}/store/regions`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function completeCart(cartId: string) {
  const base = getBaseUrl()
  const res = await fetch(`${base}/store/carts/${cartId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  })
  if (!res.ok) {
    const text = await res.text()
    let message = "Ошибка оформления заказа."
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
