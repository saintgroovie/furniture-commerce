/**
 * Willie Winkie design-theme (motif) Store contract.
 *
 * Backend remains source of truth: themes and combinations are aggregated only
 * from published product.metadata that already carries SKU-confirmed motif +
 * family fields. Storefront must not invent family×motif grids.
 *
 * Buyer-safe wire: expose motif_* + counts + product cards by handle.
 * Never leak family_key, source_title, family_options, planned_materials,
 * owner-review flags, workbook paths, or UNKNOWN material labels.
 */

export const WILLIE_WINKIE_COLLECTION = "willie-winkie" as const

/** Keys allowed on motif product-card metadata (if ever nested). Prefer flat DTO. */
export const MOTIF_BUYER_METADATA_KEYS = [
  "motif_key",
  "motif_slug",
  "motif_title",
] as const

export const MOTIF_INTERNAL_METADATA_KEYS = [
  "family_key",
  "family_options",
  "source_title",
  "planned_materials",
  "material_key",
  "material_status",
  "workbook_row_key",
  "workbook_product_code",
  "owner_review_required",
  "painting_code",
  "painting_prefix",
  "legacy_painting_family",
  "willie_winkie_flow_a_pilot",
] as const

export type MotifCtaKind = "view_product" | "view_furniture" | "view_collection"

export type MotifProductCardDto = {
  handle: string
  title: string
  thumbnail: string | null
  price_amount: number | null
  motif_key: string
  motif_slug: string
  motif_title: string
  family_title: string
}

export type MotifThemeDto = {
  motif_key: string
  motif_slug: string
  motif_title: string
  motif_cover: string | null
  motif_description: string | null
  motif_available_family_count: number
  motif_available_product_count: number
  cta_kind: MotifCtaKind
  cta_label: string
  available_family_titles: string[]
  preview_products: MotifProductCardDto[]
}

export type MotifThemeDetailDto = MotifThemeDto & {
  products: MotifProductCardDto[]
}

export type MotifOptionDto = {
  motif_key: string
  motif_slug: string
  motif_title: string
  motif_cover: string | null
  product_handle: string
  title: string
  price_amount: number | null
  selected: boolean
}

export type MotifContextStatus =
  | "absent"
  | "matched"
  | "redirect"
  | "unsupported"
  | "unknown"

export type MotifContextDto = {
  handle: string
  motif_status: MotifContextStatus
  /** Present when status is matched or redirect (buyer-facing selected motif). */
  selected_motif: {
    motif_key: string
    motif_slug: string
    motif_title: string
  } | null
  /** When query motif is valid for this family on a different product. */
  redirect_handle: string | null
  motif_options: MotifOptionDto[]
  related_products_in_motif: MotifProductCardDto[]
  motif_page_path: string | null
}

export const MOTIF_CTA_LABELS: Record<MotifCtaKind, string> = {
  view_product: "Посмотреть товар",
  view_furniture: "Посмотреть мебель",
  view_collection: "Посмотреть коллекцию",
}

export function motifCtaKind(familyCount: number): MotifCtaKind {
  if (familyCount <= 1) return "view_product"
  if (familyCount === 2) return "view_furniture"
  return "view_collection"
}

function asNonEmptyString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null
}

function metaOf(product: Record<string, unknown>): Record<string, unknown> {
  const m = product.metadata
  if (m == null || typeof m !== "object" || Array.isArray(m)) return {}
  return m as Record<string, unknown>
}

export function isWillieWinkieMotifProduct(
  product: Record<string, unknown>
): boolean {
  const meta = metaOf(product)
  if (asNonEmptyString(meta.collection) !== WILLIE_WINKIE_COLLECTION) return false
  return (
    asNonEmptyString(meta.motif_key) != null &&
    asNonEmptyString(meta.motif_slug) != null &&
    asNonEmptyString(meta.motif_title) != null &&
    asNonEmptyString(meta.family_key) != null
  )
}

export function readMotifSlug(product: Record<string, unknown>): string | null {
  return asNonEmptyString(metaOf(product).motif_slug)
}

export function readFamilyKey(product: Record<string, unknown>): string | null {
  return asNonEmptyString(metaOf(product).family_key)
}

function readPriceAmount(product: Record<string, unknown>): number | null {
  const variants = product.variants
  if (!Array.isArray(variants) || variants.length === 0) return null
  const v = variants[0]
  if (!v || typeof v !== "object") return null
  const prices = (v as { prices?: unknown }).prices
  if (!Array.isArray(prices) || prices.length === 0) return null
  const amount = (prices[0] as { amount?: unknown })?.amount
  return typeof amount === "number" && Number.isFinite(amount) ? amount : null
}

function readThumbnail(product: Record<string, unknown>): string | null {
  const t = asNonEmptyString(product.thumbnail)
  if (t) return t
  const images = product.images
  if (!Array.isArray(images)) return null
  for (const img of images) {
    if (!img || typeof img !== "object") continue
    const url = asNonEmptyString((img as { url?: unknown }).url)
    if (url) return url
  }
  return null
}

function buyerTitle(product: Record<string, unknown>): string {
  const meta = metaOf(product)
  const familyTitle = asNonEmptyString(meta.family_canonical_title)
  if (familyTitle) return familyTitle
  const title = asNonEmptyString(product.title)
  return title ?? "Товар"
}

export function toMotifProductCard(
  product: Record<string, unknown>
): MotifProductCardDto | null {
  if (!isWillieWinkieMotifProduct(product)) return null
  const meta = metaOf(product)
  const handle = asNonEmptyString(product.handle)
  if (!handle) return null
  return {
    handle,
    title: buyerTitle(product),
    thumbnail: readThumbnail(product),
    price_amount: readPriceAmount(product),
    motif_key: asNonEmptyString(meta.motif_key)!,
    motif_slug: asNonEmptyString(meta.motif_slug)!,
    motif_title: asNonEmptyString(meta.motif_title)!,
    family_title: asNonEmptyString(meta.family_canonical_title) ?? buyerTitle(product),
  }
}

function sortCards(a: MotifProductCardDto, b: MotifProductCardDto): number {
  const ft = a.family_title.localeCompare(b.family_title, "ru")
  if (ft !== 0) return ft
  return a.handle.localeCompare(b.handle)
}

function buildThemeFromCards(
  motifKey: string,
  motifSlug: string,
  motifTitle: string,
  cards: MotifProductCardDto[],
  familyKeys: Set<string>
): MotifThemeDto {
  const familyTitles = [
    ...new Set(cards.map((c) => c.family_title).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, "ru"))
  const familyCount = familyKeys.size
  const cta_kind = motifCtaKind(familyCount)
  const sorted = [...cards].sort(sortCards)
  const cover =
    sorted.find((c) => c.thumbnail)?.thumbnail ??
    sorted[0]?.thumbnail ??
    null
  return {
    motif_key: motifKey,
    motif_slug: motifSlug,
    motif_title: motifTitle,
    motif_cover: cover,
    motif_description: null,
    motif_available_family_count: familyCount,
    motif_available_product_count: sorted.length,
    cta_kind,
    cta_label: MOTIF_CTA_LABELS[cta_kind],
    available_family_titles: familyTitles,
    preview_products: sorted.slice(0, 3),
  }
}

/**
 * Aggregate SKU-confirmed Willie Winkie products into buyer-safe motif themes.
 */
export function buildMotifThemes(
  products: Array<Record<string, unknown>>
): MotifThemeDto[] {
  type Bucket = {
    motif_key: string
    motif_slug: string
    motif_title: string
    cards: MotifProductCardDto[]
    familyKeys: Set<string>
  }
  const bySlug = new Map<string, Bucket>()

  for (const product of products) {
    if (!isWillieWinkieMotifProduct(product)) continue
    const card = toMotifProductCard(product)
    const familyKey = readFamilyKey(product)
    if (!card || !familyKey) continue
    const existing = bySlug.get(card.motif_slug)
    if (!existing) {
      bySlug.set(card.motif_slug, {
        motif_key: card.motif_key,
        motif_slug: card.motif_slug,
        motif_title: card.motif_title,
        cards: [card],
        familyKeys: new Set([familyKey]),
      })
      continue
    }
    // Fail-closed on conflicting motif identity for the same slug.
    if (
      existing.motif_key !== card.motif_key ||
      existing.motif_title !== card.motif_title
    ) {
      continue
    }
    existing.cards.push(card)
    existing.familyKeys.add(familyKey)
  }

  return [...bySlug.values()]
    .map((b) =>
      buildThemeFromCards(
        b.motif_key,
        b.motif_slug,
        b.motif_title,
        b.cards,
        b.familyKeys
      )
    )
    .sort((a, b) => a.motif_title.localeCompare(b.motif_title, "en"))
}

export function buildMotifThemeDetail(
  products: Array<Record<string, unknown>>,
  motifSlug: string
): MotifThemeDetailDto | null {
  const slug = motifSlug.trim().toLowerCase()
  if (!slug) return null
  const cards: MotifProductCardDto[] = []
  const familyKeys = new Set<string>()
  let motifKey = ""
  let motifTitle = ""

  for (const product of products) {
    if (!isWillieWinkieMotifProduct(product)) continue
    const card = toMotifProductCard(product)
    const familyKey = readFamilyKey(product)
    if (!card || !familyKey) continue
    if (card.motif_slug.toLowerCase() !== slug) continue
    if (motifKey && (card.motif_key !== motifKey || card.motif_title !== motifTitle)) {
      continue
    }
    cards.push(card)
    familyKeys.add(familyKey)
    motifKey = card.motif_key
    motifTitle = card.motif_title
  }

  if (cards.length === 0 || !motifKey) return null
  const theme = buildThemeFromCards(
    motifKey,
    cards[0].motif_slug,
    motifTitle,
    cards,
    familyKeys
  )
  return {
    ...theme,
    products: [...cards].sort(sortCards),
  }
}

export function buildMotifContext(args: {
  products: Array<Record<string, unknown>>
  handle: string
  motifQuery: string | null
}): MotifContextDto | null {
  const handle = args.handle.trim()
  if (!handle) return null

  const current = args.products.find(
    (p) => asNonEmptyString(p.handle) === handle
  )
  if (!current || !isWillieWinkieMotifProduct(current)) return null

  const currentCard = toMotifProductCard(current)
  const familyKey = readFamilyKey(current)
  if (!currentCard || !familyKey) return null

  const familySiblings = args.products.filter((p) => {
    if (!isWillieWinkieMotifProduct(p)) return false
    return readFamilyKey(p) === familyKey
  })

  const motif_options: MotifOptionDto[] = familySiblings
    .map((p) => {
      const card = toMotifProductCard(p)
      if (!card) return null
      return {
        motif_key: card.motif_key,
        motif_slug: card.motif_slug,
        motif_title: card.motif_title,
        motif_cover: card.thumbnail,
        product_handle: card.handle,
        title: card.title,
        price_amount: card.price_amount,
        selected: card.handle === handle,
      }
    })
    .filter((o): o is MotifOptionDto => o != null)
    .sort((a, b) => a.motif_title.localeCompare(b.motif_title, "en"))

  const q = asNonEmptyString(args.motifQuery)?.toLowerCase() ?? null
  let motif_status: MotifContextStatus = "absent"
  let selected_motif: MotifContextDto["selected_motif"] = null
  let redirect_handle: string | null = null

  if (!q) {
    motif_status = "absent"
    selected_motif = {
      motif_key: currentCard.motif_key,
      motif_slug: currentCard.motif_slug,
      motif_title: currentCard.motif_title,
    }
  } else if (q === currentCard.motif_slug.toLowerCase()) {
    motif_status = "matched"
    selected_motif = {
      motif_key: currentCard.motif_key,
      motif_slug: currentCard.motif_slug,
      motif_title: currentCard.motif_title,
    }
  } else {
    const sibling = familySiblings.find((p) => {
      const slug = readMotifSlug(p)
      return slug != null && slug.toLowerCase() === q
    })
    if (sibling) {
      const siblingCard = toMotifProductCard(sibling)
      motif_status = "redirect"
      redirect_handle = siblingCard?.handle ?? null
      selected_motif = siblingCard
        ? {
            motif_key: siblingCard.motif_key,
            motif_slug: siblingCard.motif_slug,
            motif_title: siblingCard.motif_title,
          }
        : null
    } else {
      const knownAnywhere = args.products.some((p) => {
        const slug = readMotifSlug(p)
        return slug != null && slug.toLowerCase() === q
      })
      motif_status = knownAnywhere ? "unsupported" : "unknown"
      selected_motif = {
        motif_key: currentCard.motif_key,
        motif_slug: currentCard.motif_slug,
        motif_title: currentCard.motif_title,
      }
    }
  }

  const related_products_in_motif = args.products
    .map((p) => toMotifProductCard(p))
    .filter((c): c is MotifProductCardDto => c != null)
    .filter(
      (c) =>
        c.motif_key === currentCard.motif_key && c.handle !== currentCard.handle
    )
    .sort(sortCards)

  return {
    handle,
    motif_status,
    selected_motif,
    redirect_handle,
    motif_options,
    related_products_in_motif,
    motif_page_path: `/kids/willie-winkie/${currentCard.motif_slug}`,
  }
}

/** Deep scrub check for tests / route assertions. */
export function assertBuyerSafeMotifPayload(value: unknown, path = "$"): string[] {
  const leaks: string[] = []
  const forbiddenExact = new Set(
    MOTIF_INTERNAL_METADATA_KEYS.map((k) => k.toLowerCase())
  )
  const forbiddenSubstrings = [
    "family_key",
    "source_title",
    "family_options",
    "planned_materials",
    "workbook_",
    "owner_review",
    "variant_id",
    "product_id",
  ]

  const walk = (node: unknown, p: string) => {
    if (node == null) return
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${p}[${i}]`))
      return
    }
    if (typeof node !== "object") {
      if (typeof node === "string" && node === "UNKNOWN") {
        leaks.push(`${p}=UNKNOWN`)
      }
      return
    }
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const kl = k.toLowerCase()
      if (forbiddenExact.has(kl)) leaks.push(`${p}.${k}`)
      for (const sub of forbiddenSubstrings) {
        if (kl === sub || kl.includes(sub)) {
          // motif_key / motif_slug are allowed; only exact internal names above.
          if (kl.startsWith("motif_")) continue
          if (!leaks.includes(`${p}.${k}`)) leaks.push(`${p}.${k}`)
        }
      }
      // Buyer cards must not expose Medusa ids as UI fields.
      if ((k === "id" || k === "sku") && p.includes("products")) {
        leaks.push(`${p}.${k}`)
      }
      walk(v, `${p}.${k}`)
    }
  }

  walk(value, path)
  return leaks
}
