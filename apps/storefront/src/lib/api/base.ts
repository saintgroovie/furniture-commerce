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
