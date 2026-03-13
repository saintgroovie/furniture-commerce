export function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? ""
}

/** Base URL of the storefront for metadataBase, canonical, OG. */
export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
}
