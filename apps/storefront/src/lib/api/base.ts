export function getBaseUrl(): string {
  if (typeof window === "undefined" && process.env.MEDUSA_BACKEND_URL) {
    return process.env.MEDUSA_BACKEND_URL
  }
  return process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? ""
}

/** Base URL of the storefront for metadataBase, canonical, OG. */
export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:8000"
}

function getPublishableKey(): string {
  return process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? ""
}

/** Fetch wrapper that adds the publishable API key header. */
export function medusaFetch(url: string, init?: RequestInit): Promise<Response> {
  const key = getPublishableKey()
  const headers = new Headers(init?.headers)
  if (key) {
    headers.set("x-publishable-api-key", key)
  }
  return fetch(url, { ...init, headers })
}
