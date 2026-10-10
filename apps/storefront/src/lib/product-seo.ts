/**
 * Product page SEO surfaces from one buyer entity.
 *
 * H1 / card / breadcrumb use `getBuyerFacingProductTitle`.
 * `<title>`, og:title and Product JSON-LD `name` use `getProductSeoName`:
 * the same title, plus the painting for Willie Winkie rows where the page is
 * one painting of a piece (the PDP selector shows the same painting).
 *
 * Meta description is a deterministic snippet of the buyer description.
 * No runtime generation, no invented facts, no commercial promises.
 */
import { motifBuyerDisplayName, MOTIF_BUYER_DISPLAY_NAMES_RU } from "../../../backend/src/lib/motif-theme"
import { sanitizeBuyerDescription } from "@/lib/catalog-normalization"
import { getBuyerFacingProductTitle } from "@/lib/product-metadata"

type ProductLike = Record<string, unknown>

export const META_DESCRIPTION_MAX = 160

function meta(product: ProductLike): Record<string, unknown> {
  const m = product.metadata
  return m && typeof m === "object" && !Array.isArray(m) ? (m as Record<string, unknown>) : {}
}

function rawTitle(product: ProductLike): string | null {
  return typeof product.title === "string" ? product.title : null
}

/** RU painting name only for canonical motif slugs (never the English legacy label). */
export function productMotifDisplayName(product: ProductLike): string | null {
  const slug = meta(product).motif_slug
  if (typeof slug !== "string") return null
  const key = slug.trim().toLowerCase()
  if (!(key in MOTIF_BUYER_DISPLAY_NAMES_RU)) return null
  return motifBuyerDisplayName(key)
}

export function getProductSeoName(product: ProductLike): string {
  const title = getBuyerFacingProductTitle(product)
  const motif = productMotifDisplayName(product)
  if (!motif || title.includes(`«${motif}»`)) return title
  return `${title}, роспись «${motif}»`
}

/** Description shown on the PDP: internal price-list lines removed, prose untouched. */
export function getBuyerDescription(product: ProductLike): string | null {
  return sanitizeBuyerDescription(
    typeof product.description === "string" ? product.description : null,
    { title: rawTitle(product) }
  ).text
}

/** Description for snippets and JSON-LD: also without the shared execution note. */
export function getSeoDescriptionSource(product: ProductLike): string | null {
  return sanitizeBuyerDescription(
    typeof product.description === "string" ? product.description : null,
    { title: rawTitle(product), dropSharedNote: true }
  ).text
}

function normalizeSnippetText(s: string): string {
  return s
    .replace(/\u00a0|\u202f/g, " ")
    .replace(/\s*[—–]\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim()
}

function splitSentences(text: string): string[] {
  const out: string[] = []
  for (const block of text.split(/\n+/)) {
    const b = normalizeSnippetText(block)
    if (!b) continue
    for (const s of b.split(/(?<=[.!?])\s+(?=[А-ЯЁA-Z«"])/u)) {
      const t = s.trim()
      if (t) out.push(/[.!?…]$/u.test(t) ? t : `${t}.`)
    }
  }
  return out
}

function cutAtWord(s: string, max: number): string {
  if (s.length <= max) return s
  const slice = s.slice(0, max - 1)
  const at = slice.lastIndexOf(" ")
  const base = (at > max * 0.6 ? slice.slice(0, at) : slice).replace(/[\s,;:.-]+$/u, "")
  return `${base}…`
}

export type MetaDescriptionContext = {
  /** Material tiers / execution choices exist on the PDP. */
  hasOptions: boolean
  /** "price": a price is shown; "quote": price on request. */
  priceMode: "price" | "quote"
}

function fallbackMetaDescription(name: string, ctx: MetaDescriptionContext): string {
  const parts = ["размеры"]
  if (ctx.hasOptions) parts.push("варианты исполнения")
  if (ctx.priceMode === "price") parts.push("цену")
  const what =
    parts.length > 1 ? `${parts.slice(0, -1).join(", ")} и ${parts.at(-1)}` : parts[0]!
  const tail =
    ctx.priceMode === "price"
      ? `Посмотрите ${what} на сайте Woodright.`
      : `Посмотрите ${what} и оставьте заявку на расчёт на сайте Woodright.`
  return cutAtWord(`${name}. ${tail}`, META_DESCRIPTION_MAX)
}

/**
 * Order: whole leading description sentences that fit → subtitle →
 * first sentence cut at a word → factual fallback built from the entity name.
 */
export function buildProductMetaDescription(
  product: ProductLike,
  ctx: MetaDescriptionContext
): string {
  const source = getSeoDescriptionSource(product)
  const sentences = source ? splitSentences(source) : []
  if (sentences.length && sentences[0]!.length <= META_DESCRIPTION_MAX) {
    let out = sentences[0]!
    for (const s of sentences.slice(1)) {
      if (out.length + 1 + s.length > META_DESCRIPTION_MAX) break
      out = `${out} ${s}`
    }
    return out
  }
  const subtitle =
    typeof product.subtitle === "string" ? normalizeSnippetText(product.subtitle) : ""
  if (subtitle) return cutAtWord(subtitle, META_DESCRIPTION_MAX)
  if (sentences.length) return cutAtWord(sentences[0]!, META_DESCRIPTION_MAX)
  return fallbackMetaDescription(getProductSeoName(product), ctx)
}
