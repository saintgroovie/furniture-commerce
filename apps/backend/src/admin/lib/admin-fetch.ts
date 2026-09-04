/** Same-origin admin fetch (session cookie). */

export async function adminJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json")
  }
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers,
  })
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { message: text }
  }
  if (!res.ok) {
    const err = data as { message?: string }
    const error = new Error(err?.message || `HTTP ${res.status}`) as Error & {
      status?: number
      body?: unknown
    }
    error.status = res.status
    error.body = data
    throw error
  }
  return data as T
}

export function sellerErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || !error.message || error.message.startsWith("HTTP ")) {
    return fallback
  }
  const message = error.message.trim()
  if (
    message.length > 180 ||
    /validationerror|price_set|stack|internal server|cannot read|econnrefused|zoderror/i.test(
      message
    )
  ) {
    return fallback
  }
  return message
}
