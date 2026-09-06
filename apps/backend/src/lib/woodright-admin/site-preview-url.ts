const DEFAULT_DEV_SITE_URL = "http://localhost:3002"

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "")
}

/**
 * Buyer-facing origin for admin preview links.
 * `WOODRIGHT_SITE_URL` is canonical when set. The localhost fallback is local-dev only.
 */
export function resolveWoodrightSiteUrl(
  env: NodeJS.Dict<string | undefined> = process.env
): string {
  const raw = env.WOODRIGHT_SITE_URL?.trim()
  if (raw) return stripTrailingSlash(raw)
  return DEFAULT_DEV_SITE_URL
}

/**
 * Build a buyer PDP URL. `siteUrl` must already be resolved server-side
 * (`resolveWoodrightSiteUrl`) and sent to Admin. Do not call this with
 * `process.env` in browser/Vite bundles.
 */
export function buyerProductPreviewUrl(productId: string, siteUrl: string): string {
  const origin = stripTrailingSlash(siteUrl.trim())
  if (!origin) {
    throw new Error("buyerProductPreviewUrl requires a resolved site origin")
  }
  const id = productId.trim()
  return `${origin}/product/${encodeURIComponent(id)}`
}
