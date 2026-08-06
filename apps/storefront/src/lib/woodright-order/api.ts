import { getBaseUrl, medusaFetch } from "@/lib/api/base"

export type BuyerProcessResponse = {
  order_id: string
  display_id?: string | number | null
  customer_status?: {
    code?: string
    label?: string
    description?: string
    tone?: string
    progress_step?: number
    next_expected_action?: string | null
    estimated_date?: string | null
  }
  payment?: { code?: string; label?: string }
  production?: {
    stage?: string
    label?: string
    description?: string
    customer_message?: string | null
    estimated_completion_date?: string | null
  }
  delivery?: {
    code?: string
    label?: string
    tracking?: {
      carrier?: string | null
      tracking_number?: string | null
      tracking_url?: string | null
    } | null
  }
  timeline?: Array<{ key: string; label: string; state: string }>
  events?: Array<{
    id: string
    at?: string
    label?: string
    message?: string | null
  }>
}

export async function mintOrderAccess(input: {
  orderId: string
  cartId: string
}): Promise<{ token: string; track_path: string; expires_at?: string }> {
  const base = typeof window !== "undefined" ? "" : getBaseUrl()
  const res = await medusaFetch(
    `${base}/store/woodright/orders/${encodeURIComponent(input.orderId)}/access`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cart_id: input.cartId }),
    }
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `access mint failed (${res.status})`)
  }
  return res.json()
}

export async function fetchOrderProcess(input: {
  orderId: string
  token: string
}): Promise<BuyerProcessResponse> {
  const base = typeof window !== "undefined" ? "" : getBaseUrl()
  // Bearer only - never put the guest token in the query string (access logs / proxies).
  const res = await medusaFetch(
    `${base}/store/woodright/orders/${encodeURIComponent(input.orderId)}/process`,
    {
      headers: {
        Authorization: `Bearer ${input.token}`,
      },
    }
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `process fetch failed (${res.status})`)
  }
  return res.json()
}
