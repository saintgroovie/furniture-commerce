import { getBaseUrl } from "./base"

export async function createBespokeRequest(body: {
  lead_id: string
  product_id?: string | null
  room_set_id?: string | null
  dimensions?: string | null
  materials?: string | null
  budget?: string | null
  comment?: string | null
}) {
  const base = getBaseUrl()
  const res = await fetch(`${base}/store/bespoke-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    let message = "Ошибка отправки заявки."
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
