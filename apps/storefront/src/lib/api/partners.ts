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

/** Public partner index. Admin records win; otherwise the confirmed legacy roster. */
export async function getPublicPartners(): Promise<StorePartner[]> {
  try {
    const base = getBaseUrl()
    const res = await medusaFetch(`${base}/store/partners`)
    if (res.ok) {
      const remote = asPartnerList(await res.json())
      if (remote.length > 0) return remote
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
