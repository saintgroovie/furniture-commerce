/**
 * Production sitemap URL set builder (public_indexable only).
 * Fail-closed: never invent product handles; skip non-public routes.
 */
import { isBuyerPublicProductStatus } from "@/lib/buyer-publication"
import { isLegalLaunchComplete } from "@/lib/legal/owner-inputs"

export type SitemapEntry = { loc: string; lastmod?: string }

const STATIC_PATHS = [
  "/",
  "/catalog",
  "/rooms",
  "/kids",
  "/kids/catalog",
  "/kids/rooms",
  "/kids/willie-winkie",
  "/bespoke",
  "/bespoke/wall-panels",
  "/bespoke/request",
  "/designers",
  "/contacts",
  "/about",
  "/about/production",
  "/about/materials",
  "/partners",
  "/delivery",
  "/payment",
  "/returns",
  "/warranty",
  "/privacy",
  "/personal-data",
  "/cookies",
  "/terms",
  "/offer",
  "/requisites",
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

export function collectStaticSitemapEntries(
  origin: string,
  options: { includeKidsRooms?: boolean } = {}
): SitemapEntry[] {
  const legalPackLive = isLegalLaunchComplete()
  return STATIC_PATHS.filter((p) => !isBlockedSitemapPath(p))
    .filter((p) => (p === "/offer" ? legalPackLive : true))
    .filter((p) => p !== "/kids/rooms" || options.includeKidsRooms !== false)
    .map((p) => ({
      loc: absoluteSitemapLoc(origin, p),
    }))
}

export function collectProductSitemapEntries(
  origin: string,
  products: Array<{ handle?: unknown; id?: unknown; status?: unknown }>,
  limit = SITEMAP_PRODUCT_LIMIT
): SitemapEntry[] {
  const seen = new Set<string>()
  const out: SitemapEntry[] = []
  for (const product of products) {
    if (out.length >= limit) break
    if (!isBuyerPublicProductStatus(product.status)) continue
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

/** Only explicit active backend rooms; never construct rooms from product names. */
export function collectRoomSitemapEntries(
  origin: string,
  rooms: Array<{ slug?: unknown; is_active?: unknown }>,
  limit = 256
): SitemapEntry[] {
  const paths = rooms.filter((room) => room.is_active === true)
    .map((room) => typeof room.slug === "string" ? room.slug.trim() : "")
  return collectDetailEntries(origin, "/rooms/", paths, limit)
}

/** Include a painting theme only when its public projection has real products. */
export function collectMotifSitemapEntries(
  origin: string,
  themes: Array<{ motif_slug?: unknown; motif_available_product_count?: unknown }>,
  limit = 256
): SitemapEntry[] {
  const paths = themes.filter((theme) =>
    typeof theme.motif_available_product_count === "number" &&
    Number.isSafeInteger(theme.motif_available_product_count) &&
    theme.motif_available_product_count > 0
  ).map((theme) => typeof theme.motif_slug === "string" ? theme.motif_slug.trim() : "")
  return collectDetailEntries(origin, "/kids/willie-winkie/", paths, limit)
}

function collectDetailEntries(origin: string, prefix: string, slugs: string[], limit: number): SitemapEntry[] {
  if (!Number.isSafeInteger(limit) || limit < 1) return []
  const out: SitemapEntry[] = []
  const seen = new Set<string>()
  for (const slug of slugs) {
    if (!/^[a-z0-9][a-z0-9-]{0,120}$/i.test(slug) || seen.has(slug)) continue
    const loc = absoluteSitemapLoc(origin, `${prefix}${slug}`)
    if (!isProductionSitemapLoc(loc)) continue
    seen.add(slug)
    out.push({ loc })
    if (out.length >= limit) break
  }
  return out
}
