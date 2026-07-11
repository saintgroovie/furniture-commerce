import { getBaseUrl, medusaFetch } from "./base"

export async function createLead(body: {
  source?: string
  name?: string | null
  email?: string | null
  phone?: string | null
  comment?: string | null
  payload?: Record<string, unknown> | null
}) {
  const base = getBaseUrl()
  const res = await medusaFetch(`${base}/store/leads`, {
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
