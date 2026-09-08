import { getBaseUrl, medusaFetch } from "./base"
import { resolvePdpMediaSrc } from "../product-images"

export type StorePartnerPresentation = {
  id: string
  title: string
  file_url: string
  cover_url: string | null
  page_count: number | null
  mime: string | null
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
      file_url: resolvePdpMediaSrc(deck.file_url),
      cover_url: deck.cover_url ? resolvePdpMediaSrc(deck.cover_url) : null,
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

/** Public partner index. Never throws: missing backend → empty editorial state. */
export async function getPublicPartners(): Promise<StorePartner[]> {
  try {
    const base = getBaseUrl()
    const res = await medusaFetch(`${base}/store/partners`)
    if (!res.ok) return []
    return asPartnerList(await res.json())
  } catch {
    return []
  }
}

export async function getPublicPartnerBySlug(slug: string): Promise<StorePartner | null> {
  const partners = await getPublicPartners()
  return partners.find((partner) => partner.slug === slug) ?? null
}
