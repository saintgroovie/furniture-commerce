/**
 * Production sitemap URL set builder (public_indexable only).
 * Fail-closed: never invent product handles; skip non-public routes.
 */
export type SitemapEntry = { loc: string; lastmod?: string }

const STATIC_PATHS = [
  "/",
  "/catalog",
  "/rooms",
  "/kids",
  "/kids/willie-winkie",
  "/bespoke",
  "/contacts",
  "/delivery",
  "/payment",
  "/returns",
  "/privacy",
  "/terms",
  "/offer",
  "/warranty",
] as const

const BLOCKED_PATH_PREFIXES = [
  "/cart",
  "/checkout",
  "/admin",
  "/store/",
  "/app/",
  "/qa/",
] as const

export function isBlockedSitemapPath(pathname: string): boolean {
  const p = pathname.startsWith("/") ? pathname : `/${pathname}`
  return BLOCKED_PATH_PREFIXES.some(
    (prefix) => p === prefix || p.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`)
  )
}

export function absoluteSitemapLoc(origin: string, pathname: string): string {
  const base = origin.replace(/\/$/, "")
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`
  return `${base}${path === "/" ? "/" : path.replace(/\/$/, "") || "/"}`
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

/** Cap product URLs to keep generation bounded. */
export const SITEMAP_PRODUCT_LIMIT = 5000

export function collectStaticSitemapEntries(origin: string): SitemapEntry[] {
  return STATIC_PATHS.filter((p) => !isBlockedSitemapPath(p)).map((p) => ({
    loc: absoluteSitemapLoc(origin, p),
  }))
}

export function collectProductSitemapEntries(
  origin: string,
  products: Array<{ handle?: unknown; id?: unknown }>,
  limit = SITEMAP_PRODUCT_LIMIT
): SitemapEntry[] {
  const seen = new Set<string>()
  const out: SitemapEntry[] = []
  for (const product of products) {
    if (out.length >= limit) break
    const handle =
      typeof product.handle === "string" ? product.handle.trim() : ""
    if (!handle) continue
    if (!/^[a-z0-9][a-z0-9-]{0,120}$/i.test(handle)) continue
    const path = `/product/${handle}`
    if (isBlockedSitemapPath(path)) continue
    const loc = absoluteSitemapLoc(origin, path)
    if (seen.has(loc)) continue
    seen.add(loc)
    out.push({ loc })
  }
  return out
}

export function isProductionSitemapLoc(loc: string): boolean {
  let url: URL
  try {
    url = new URL(loc)
  } catch {
    return false
  }
  return url.protocol === "https:" && url.hostname.toLowerCase() === "woodright.ru"
}

export function mergeSitemapEntries(entries: SitemapEntry[]): SitemapEntry[] {
  const seen = new Set<string>()
  const merged: SitemapEntry[] = []
  for (const entry of entries) {
    if (!entry.loc || seen.has(entry.loc)) continue
    if (!isProductionSitemapLoc(entry.loc)) continue
    seen.add(entry.loc)
    merged.push(entry)
  }
  merged.sort((a, b) => a.loc.localeCompare(b.loc))
  return merged
}

export function renderSitemapXml(entries: SitemapEntry[]): string {
  const body = entries
    .map((e) => {
      const last = e.lastmod
        ? `\n    <lastmod>${escapeXml(e.lastmod)}</lastmod>`
        : ""
      return `  <url>\n    <loc>${escapeXml(e.loc)}</loc>${last}\n  </url>`
    })
    .join("\n")
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${body}\n` +
    `</urlset>\n`
  )
}
