import { resolveStorefrontProductImageSrc } from "./product-images"
import { getBuyerFacingProductTitle } from "./product-metadata"

type LinkEntry = { name: string; path: string }
type Row = Record<string, unknown>
export type EditorialPageJsonLd = Record<string, unknown>
const slugPattern = /^[a-z0-9][a-z0-9-]{0,120}$/i
const text = (value: unknown) => typeof value === "string" ? value.trim() : ""
const slug = (value: unknown) => slugPattern.test(text(value)) ? text(value) : null
const row = (value: unknown): Row => value && typeof value === "object" ? value as Row : {}

/** Allowlisted page data only: never serialize SKU, candidate matches, prices or offers. */
export function editorialPageJsonLd(input: {
  siteUrl: string
  path: string
  name: string
  description?: string
  image?: string | null
  breadcrumbs: LinkEntry[]
  entries: LinkEntry[]
}): EditorialPageJsonLd | null {
  let origin: string
  try {
    const site = new URL(input.siteUrl)
    if (!["https:", "http:"].includes(site.protocol) || site.username || site.password) return null
    origin = site.origin
  } catch { return null }
  function absolute(path: string): string | null {
    if (!path.startsWith("/") || path.startsWith("//")) return null
    const url = new URL(path, origin)
    return url.origin === origin ? `${url.origin}${url.pathname}` : null
  }
  const url = absolute(input.path)
  if (!url || !input.name.trim()) return null
  const breadcrumbs = input.breadcrumbs.flatMap((entry) => {
    const item = absolute(entry.path)
    return item && entry.name.trim() ? [{ name: entry.name.trim(), item }] : []
  })
  if (breadcrumbs.length < 2) return null
  const seen = new Set<string>()
  const entries = input.entries.flatMap((entry) => {
    const itemUrl = absolute(entry.path)
    if (!itemUrl || !entry.name.trim() || seen.has(itemUrl)) return []
    seen.add(itemUrl)
    return [{ name: entry.name.trim(), url: itemUrl }]
  })
  let image: string | undefined
  if (input.image) {
    try {
      const parsed = new URL(resolveStorefrontProductImageSrc(input.image), origin)
      if (["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password &&
        !/^(localhost|medusa|host\.docker\.internal|127\.|0\.|\[?::1)/i.test(parsed.hostname)) image = parsed.href
    } catch { /* Missing or invalid media is omitted, never invented. */ }
  }
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage", "@id": `${url}#webpage`, url,
        name: input.name.trim(), inLanguage: "ru-RU",
        ...(input.description?.trim() ? { description: input.description.trim() } : {}),
        ...(image ? { primaryImageOfPage: { "@type": "ImageObject", contentUrl: image } } : {}),
        breadcrumb: { "@id": `${url}#breadcrumb` },
        ...(entries.length ? { mainEntity: { "@id": `${url}#items` } } : {}),
      },
      {
        "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`,
        itemListElement: breadcrumbs.map((entry, index) => ({ "@type": "ListItem", position: index + 1, ...entry })),
      },
      ...(entries.length ? [{
        "@type": "ItemList", "@id": `${url}#items`, numberOfItems: entries.length,
        itemListElement: entries.map((entry, index) => ({ "@type": "ListItem", position: index + 1, ...entry })),
      }] : []),
    ],
  }
}

const home = { name: "Главная", path: "/" }
const kids = { name: "Детская", path: "/kids" }
const paintings = { name: "Росписи Вилли Винки", path: "/kids/willie-winkie" }

export function roomPageJsonLd(siteUrl: string, roomSet: Row): EditorialPageJsonLd | null {
  const key = slug(roomSet.slug)
  const name = text(roomSet.title)
  // Inactive drafts can be resolved by older API versions: never describe them as published rooms.
  if (roomSet.is_active !== true || !key || !name) return null
  const path = `/rooms/${key}`
  const parent = roomSet.room_type === "детская"
    ? { name: "Детские комнаты", path: "/kids/rooms" }
    : { name: "Комнаты", path: "/rooms" }
  const items = Array.isArray(roomSet.items) ? [...roomSet.items].sort((a, b) => Number(row(a).sort_order ?? 0) - Number(row(b).sort_order ?? 0)) : []
  return editorialPageJsonLd({ siteUrl, path, name,
    description: text(roomSet.description), image: text(roomSet.hero_image),
    breadcrumbs: [home, ...(roomSet.room_type === "детская" ? [kids] : []), parent, { name, path }],
    entries: items.flatMap((item) => {
      const product = row(row(item).product)
      const handle = slug(product.handle)
      const title = text(product.title)
      return handle && title ? [{ name: getBuyerFacingProductTitle(product), path: `/product/${handle}` }] : []
    }),
  })
}

export function roomDirectoryJsonLd(siteUrl: string, rooms: unknown[], isKids: boolean, name: string) {
  const path = isKids ? "/kids/rooms" : "/rooms"
  const entries = rooms.flatMap((value) => {
    const room = row(value)
    const key = slug(room.slug), title = text(room.title)
    return room.is_active === true && key && title ? [{ name: title, path: `/rooms/${key}` }] : []
  })
  if (!entries.length) return null
  return editorialPageJsonLd({ siteUrl, path, name, breadcrumbs: [home, ...(isKids ? [kids] : []), { name, path }], entries })
}

export function motifPageJsonLd(siteUrl: string, theme: Row, cover: string | null) {
  const key = slug(theme.motif_slug), name = text(theme.motif_title)
  if (!key || !name || !Array.isArray(theme.products) || !theme.products.length) return null
  const path = `/kids/willie-winkie/${key}`
  return editorialPageJsonLd({ siteUrl, path, name, image: cover,
    description: text(theme.motif_description), breadcrumbs: [home, kids, paintings, { name, path }],
    entries: theme.products.flatMap((value) => {
      const product = row(value), handle = slug(product.handle), title = text(product.title)
      return handle && title ? [{ name: getBuyerFacingProductTitle(product), path: `/product/${handle}` }] : []
    }),
  })
}

export function motifDirectoryJsonLd(siteUrl: string, themes: Row[]) {
  const entries = themes.flatMap((theme) => {
    const key = slug(theme.motif_slug), name = text(theme.motif_title)
    return key && name && Number(theme.motif_available_product_count) > 0
      ? [{ name, path: `/kids/willie-winkie/${key}` }] : []
  })
  if (!entries.length) return null
  return editorialPageJsonLd({ siteUrl, ...paintings, breadcrumbs: [home, kids, paintings], entries })
}
