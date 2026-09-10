import { getBaseUrl, medusaFetch } from "./base"
import { resolvePdpMediaSrc } from "../product-images"
import { LEGACY_PARTNERS } from "../legacy-partners"

export type EditorialSlide = {
  src: string
  alt: string
  title: string
  caption: string
}

export type StorePartnerPresentation = {
  id: string
  title: string
  file_url: string
  cover_url: string | null
  page_count: number | null
  mime: string | null
  slides?: EditorialSlide[]
}

export type StorePartner = {
  id: string
  slug: string
  name: string
  description: string | null
  logo_url: string | null
  website_url: string | null
  images: string[]
  featured: boolean
  sort_order: number
  is_active: boolean
  presentations: StorePartnerPresentation[]
}

/** Medusa `/static/...` is not served by Next; buyer URLs go through `/product-static`. */
export function toStorefrontPartner(partner: StorePartner): StorePartner {
  return {
    ...partner,
    logo_url: partner.logo_url ? resolvePdpMediaSrc(partner.logo_url) : null,
    images: partner.images.map((src) => resolvePdpMediaSrc(src)),
    presentations: partner.presentations.map((deck) => ({
      ...deck,
      file_url: deck.file_url ? resolvePdpMediaSrc(deck.file_url) : "",
      cover_url: deck.cover_url ? resolvePdpMediaSrc(deck.cover_url) : null,
      slides: deck.slides?.map((slide) => ({
        ...slide,
        src: resolvePdpMediaSrc(slide.src),
      })),
    })),
  }
}

function asPartnerList(data: unknown): StorePartner[] {
  if (!data || typeof data !== "object") return []
  const partners = (data as { partners?: unknown }).partners
  if (!Array.isArray(partners)) return []
  return partners
    .filter((item): item is StorePartner => Boolean(item) && typeof item === "object")
    .map((item) => toStorefrontPartner(item))
}

function isCatalogStubSrc(src: string): boolean {
  return src.includes("/product-static/products/") || /greenwich/i.test(src)
}

function needsLegacyMedia(partner: StorePartner): boolean {
  if (partner.images.length === 0) return true
  return partner.images.some(isCatalogStubSrc)
}

/** Keep admin names/order, but never let catalog stubs hide owner-supplied case photos. */
export function mergeRemotePartnersWithLegacy(
  remote: StorePartner[],
  legacy: StorePartner[] = LEGACY_PARTNERS
): StorePartner[] {
  const bySlug = new Map(legacy.map((partner) => [partner.slug, partner]))
  const merged = remote.map((partner) => {
    const local = bySlug.get(partner.slug)
    if (!local || !needsLegacyMedia(partner)) return partner
    return {
      ...partner,
      images: local.images,
      presentations: local.presentations.length > 0 ? local.presentations : partner.presentations,
      logo_url: partner.logo_url || local.logo_url,
      description: partner.description || local.description,
    }
  })
  const seen = new Set(merged.map((partner) => partner.slug))
  for (const partner of legacy) {
    if (!seen.has(partner.slug)) merged.push(partner)
  }
  return merged.sort((a, b) => a.sort_order - b.sort_order)
}

/** Public partner index. Admin records win for names; catalog stubs yield to legacy photos. */
export async function getPublicPartners(): Promise<StorePartner[]> {
  try {
    const base = getBaseUrl()
    const res = await medusaFetch(`${base}/store/partners`)
    if (res.ok) {
      const remote = asPartnerList(await res.json())
      if (remote.length > 0) return mergeRemotePartnersWithLegacy(remote)
    }
  } catch {
    /* Medusa on another SHA or unreachable - show legacy roster. */
  }
  return LEGACY_PARTNERS
}

export async function getPublicPartnerBySlug(slug: string): Promise<StorePartner | null> {
  const partners = await getPublicPartners()
  return partners.find((partner) => partner.slug === slug) ?? null
}
