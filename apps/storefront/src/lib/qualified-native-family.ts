import registry from "./qualified-native-families.json" with { type: "json" }

type Product = Record<string, unknown>
export type NativeFamilyMember = {
  handle: string
  productId: string
  variantId: string
  sku: string
  collectionId?: string
  axes: Record<string, string>
}
export type NativeFamily = {
  key: string
  title: string
  collection: string
  axes: string[]
  fixedProperties: Record<string, string>
  members: NativeFamilyMember[]
}
export type QualifiedFamilyMember = { family: NativeFamily; member: NativeFamilyMember; product: Product }

/** Explicit owner-qualified identities only, never a title/photo/SKU-suffix
 * inference. Lean browse DTOs may omit collection metadata; the exact native
 * ID+handle+variant+SKU allowlist still binds the accepted collection. Reject
 * contradictory collection evidence whenever the current DTO carries it. */
export function qualifiedNativeFamily(product: Product): QualifiedFamilyMember | null {
  if (product.status !== "published" || product.deleted_at) return null
  const metadata = product.metadata as Product | undefined
  const variants = product.variants as Product[] | undefined
  if (!Array.isArray(variants) || variants.length !== 1 || variants[0]?.deleted_at) return null
  const collection = metadata?.collection || product.collection_handle || (product.collection as Product | undefined)?.handle
  for (const family of registry as NativeFamily[]) {
    const member = family.members.find(row => row.handle === product.handle && row.productId === product.id)
    if (!member || (collection && collection !== family.collection) ||
      (product.collection_id && member.collectionId && product.collection_id !== member.collectionId)) continue
    if (variants[0].id === member.variantId && variants[0].sku === member.sku) return { family, member, product }
  }
  return null
}

export function qualifiedFamilyMembers(current: Product, products: Product[]): QualifiedFamilyMember[] {
  const selected = qualifiedNativeFamily(current)
  if (!selected) return []
  const byId = new Map<string, QualifiedFamilyMember>()
  // Full selected PDP wins over its lean browse projection.
  for (const product of [...products, current]) {
    const row = qualifiedNativeFamily(product)
    if (row?.family.key === selected.family.key) byId.set(row.member.productId, row)
  }
  return selected.family.members.flatMap(member => {
    const row = byId.get(member.productId)
    return row ? [row] : []
  })
}

export function nativeFamilyMemberHref(member: NativeFamilyMember): string {
  return `/product/${member.handle}?variant=${encodeURIComponent(member.variantId)}`
}

/** An axis change keeps all other axes, using only real native combinations.
 * Cross-parent navigation resets that SKU's own material/finish/upholstery;
 * never carry another parent's variant or fabricate the Cartesian product. */
export function nativeFamilyChoiceRows(current: Product, products: Product[]) {
  const selected = qualifiedNativeFamily(current)
  const rows = qualifiedFamilyMembers(current, products)
  if (!selected) return []
  return selected.family.axes.map(label => ({
    label,
    choices: rows.filter(row => selected.family.axes.every(other => other === label ||
      row.member.axes[other] === selected.member.axes[other])).map(row => ({
      id: row.member.productId,
      href: nativeFamilyMemberHref(row.member),
      label: row.member.axes[label],
      isCurrent: row.member.productId === selected.member.productId,
    })),
  }))
}

/** Full DTOs require actual purchasable-cart truth. Lean browse DTOs must
 * contain the authoritative positive eligible-default projection for this
 * exact native variant; missing purchase alone is never eligibility. */
export function nativeFamilyPriceEligible(product: Product): boolean {
  const qualified = qualifiedNativeFamily(product)
  if (!qualified) return false
  if (Object.hasOwn(product, "purchase")) {
    const purchase = product.purchase as Product | null | undefined
    return !!purchase && purchase.purchase_flow === "cart" && purchase.can_purchase === true &&
      purchase.sales_mode !== "unavailable" && purchase.reason_code !== "UNAVAILABLE"
  }
  // A priced browse opening is not a sales-policy purchase decision.
  // The SF bounded full-native read must have qualified this lean member.
  return nativeFamilyPriceProof(product)?.eligible === true
}

function properties(values: Record<string, string>) {
  return Object.entries(values).map(([name, value]) => ({ "@type": "PropertyValue", name, value }))
}

/** Keep selected scalar Offer/media/native dimensions intact. One stable
 * group definition on every retained native URL; references are real native
 * Products, not fake children moved under a single Medusa parent. */
export function withQualifiedNativeFamilyJsonLd(current: Product, products: Product[], scalar: Product): Product | null {
  const selected = qualifiedNativeFamily(current)
  const rows = qualifiedFamilyMembers(current, products)
  if (!selected || rows.length < 2 || typeof scalar.url !== "string") return null
  const groupId = new URL(`/product/${selected.family.members[0].handle}#native-family`, scalar.url).href
  const groupKey = `woodright:${selected.family.key}`
  const productId = `${scalar.url}#product`
  const size = selected.member.axes["Размер спального места"] ?? selected.member.axes["Размер"]
  return {
    ...scalar, "@id": productId, productID: selected.member.productId,
    ...(size ? { size } : {}), inProductGroupWithID: groupKey,
    additionalProperty: [
      ...(Array.isArray(scalar.additionalProperty) ? scalar.additionalProperty : []),
      ...properties({ ...selected.family.fixedProperties, ...selected.member.axes }),
    ],
    isVariantOf: {
      "@type": "ProductGroup", "@id": groupId, productGroupID: groupKey,
      name: selected.family.title, brand: scalar.brand,
      variesBy: selected.family.axes.map(axis => axis === "Размер спального места" || axis === "Размер" ? "https://schema.org/size" : axis),
      additionalProperty: properties(selected.family.fixedProperties),
      hasVariant: rows.map(row => row.member.productId === selected.member.productId
        ? { "@id": productId }
        : { "@type": "Product", url: new URL(nativeFamilyMemberHref(row.member), String(scalar.url)).href,
            productID: row.member.productId, sku: row.member.sku,
            ...(row.member.axes["Размер спального места"] || row.member.axes["Размер"]
              ? { size: row.member.axes["Размер спального места"] ?? row.member.axes["Размер"] } : {}),
            additionalProperty: properties({ ...row.family.fixedProperties, ...row.member.axes }) }),
    },
  }
}

/** Pure pass after existing search/size/price/section filters. Existing price
 * resolver is injected: one source of runtime eligible FROM prices, with a
 * real minimum-price native member as the card's navigation target. */
export function qualifiedNativeDisplayEntries(products: Product[], resolvePrice: (product: Product) => {
  amount: number | null
  requestQuoteLabel: string | null
}) {
  const seen = new Set<string>()
  const entries: Array<{ product: Product; displayGroup?: {
    familyKey: string; title: string; count: number; minPrice: number | null;
    priceSuppressed: boolean; hint: string; axis: "size"
  } }> = []
  for (const product of products) {
    const selected = qualifiedNativeFamily(product)
    const members = selected ? qualifiedFamilyMembers(product, products) : []
    if (!selected) { entries.push({ product }); continue }
    // Exact SKU filters still present the common family title, while keeping
    // the sole native product and its own price semantics unchanged.
    if (members.length < 2) {
      entries.push({ product, displayGroup: {
        familyKey: selected.family.key, title: selected.family.title, count: 1,
        minPrice: null, priceSuppressed: false, hint: "", axis: "size",
      } })
      continue
    }
    if (seen.has(selected.family.key)) continue
    seen.add(selected.family.key)
    let unresolved = false
    const priced = members.flatMap(row => {
      const proof = nativeFamilyPriceProof(row.product)
      if (proof?.state === "unknown" || (!proof && !row.product.purchase)) unresolved = true
      if (!nativeFamilyPriceEligible(row.product)) return []
      const price = resolvePrice(row.product)
      if (price.requestQuoteLabel == null && price.amount != null && Number.isFinite(price.amount) && price.amount > 0) return [{ row, amount: price.amount }]
      unresolved = true
      return []
    }).sort((a, b) => a.amount - b.amount)
    const sizeAxis = selected.family.axes.find(axis => axis === "Размер спального места" || axis === "Размер")
    const sizeCount = sizeAxis ? new Set(members.map(row => row.member.axes[sizeAxis])).size : 0
    const hint = sizeCount ? `${sizeCount} ${sizeCount === 1 ? "размер" : sizeCount < 5 ? "размера" : "размеров"}` : `${members.length} исполнения`
    entries.push({ product: (priced[0]?.row ?? members[0]).product, displayGroup: {
      familyKey: selected.family.key, title: selected.family.title, count: members.length,
      minPrice: unresolved ? null : priced[0]?.amount ?? null, priceSuppressed: unresolved || priced.length === 0,
      hint: `${hint}${selected.family.axes.includes("Изножье")
        ? ` · ${new Set(members.map(row => row.member.axes["Изножье"])).size > 1
          ? "с изножьем и без" : members[0].member.axes["Изножье"].toLocaleLowerCase("ru-RU")}` : ""}`, axis: "size",
    } })
  }
  return entries
}

/** A filtered singleton exposes its own selected properties below the common
 * family title. Multi-member cards keep the existing family hint instead. */
export function qualifiedNativeCardChoiceCaption(product: Product,
  displayGroup: { familyKey?: string; count: number } | undefined, fallback: string): string {
  if (!displayGroup?.familyKey) return fallback
  if (displayGroup.count !== 1) return ""
  const selected = qualifiedNativeFamily(product)
  if (!selected || selected.family.key !== displayGroup.familyKey) return fallback
  return Object.entries({ ...selected.family.fixedProperties, ...selected.member.axes })
    .filter(([label]) => label !== "Раздел")
    .map(([label, value]) => `${label}: ${value}`).join(" · ")
}

/** Public ephemeral SF projection only. Never written to native metadata. */
type FamilyPriceProof = { productId: string; variantId: string; eligible: boolean; amount: number | null; state: "eligible" | "ineligible" | "unknown" }
export function nativeFamilyPriceProof(product: Product): FamilyPriceProof | null {
  const row = qualifiedNativeFamily(product)
  const proof = product.qualified_family_price as FamilyPriceProof | undefined
  if (!row || !proof || proof.productId !== row.member.productId || proof.variantId !== row.member.variantId ||
    typeof proof.eligible !== "boolean" || !["eligible", "ineligible", "unknown"].includes(proof.state) ||
    proof.eligible !== (proof.state === "eligible")) return null
  if (proof.eligible && (typeof proof.amount !== "number" || !Number.isFinite(proof.amount) || proof.amount <= 0)) return null
  return proof
}

/** Exact42 allowlist only, max3 concurrent full DTOs, discarded immediately
 * after price/purchase qualification. Caller owns the existing abort/read
 * budget. No shared full-product cache or eager all-catalog hydration. */
export async function qualifyNativeFamilyCatalog(products: Product[], readFull: (id: string) => Promise<Product | null>, resolvePrice: (product: Product) => {
  amount: number | null; requestQuoteLabel: string | null
}): Promise<Product[]> {
  const targets = products.flatMap((product, index) => qualifiedNativeFamily(product) ? [{ product, index }] : [])
  if (targets.length > 42) throw new Error("Qualified family read scope exceeded")
  const output = [...products]
  for (let i = 0; i < targets.length; i += 3) {
    await Promise.all(targets.slice(i, i + 3).map(async ({ product, index }) => {
      const identity = qualifiedNativeFamily(product)!
      let amount: number | null = null
      let eligible = false
      let state: FamilyPriceProof["state"] = "unknown"
      try {
        const full = await readFull(identity.member.productId)
        const actual = full && qualifiedNativeFamily(full)
        if (actual && actual.member.productId === identity.member.productId && full!.purchase && typeof full!.purchase === "object") {
          state = "ineligible"
          if (nativeFamilyPriceEligible(full!)) {
            const price = resolvePrice(full!)
            if (price.requestQuoteLabel == null && price.amount != null && Number.isFinite(price.amount) && price.amount > 0) {
              eligible = true; amount = price.amount; state = "eligible"
            } else state = "unknown"
          }
        }
      } catch { /* Only this family price fails closed; never stale raw-price fallback. */ }
      output[index] = { ...product, qualified_family_price: {
        productId: identity.member.productId, variantId: identity.member.variantId, eligible, amount, state,
      } satisfies FamilyPriceProof }
    }))
  }
  return output
}

/** Read-only cart/checkout naming from four exact persisted native identities.
 * No metadata, prices, line grouping or configuration identity is rewritten. */
export function qualifiedNativeCartFamily(item: Product): { family: NativeFamily; member: NativeFamilyMember } | null {
  const product = item.product as Product | undefined
  const variant = item.variant as Product | undefined
  const productId = product?.id ?? item.product_id
  const handle = product?.handle ?? item.product_handle
  const variantId = variant?.id ?? item.variant_id
  const sku = variant?.sku ?? item.variant_sku
  for (const family of registry as NativeFamily[]) {
    const member = family.members.find(row => row.productId === productId && row.handle === handle && row.variantId === variantId && row.sku === sku)
    if (member) return { family, member }
  }
  return null
}
