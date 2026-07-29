/** Same-origin admin fetch (session cookie). */
export async function adminJson<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<T> {
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
    const err = data as { message?: string; code?: string }
    const error = new Error(err?.message || `HTTP ${res.status}`) as Error & {
      status?: number
      code?: string
      body?: unknown
    }
    error.status = res.status
    error.code = err?.code
    error.body = data
    throw error
  }
  return data as T
}
