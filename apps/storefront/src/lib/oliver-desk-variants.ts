import type { BuyerVariantAxis } from "./buyer-variant-axis"
import { buildMaterialTierOptions, type MaterialTierOption } from "./material-tiers"
import { buildProductJsonLd, offerAvailabilityFromPurchase, readUniformRubAmounts } from "./product-json-ld"
import { verifiedMaterialOptions } from "./product-variant-json-ld"
import { readProductPurchase } from "./woodright-order/purchase-contract"

type Product = Record<string, unknown>
type DeskChoice = { id: string; sku: string; label: string; hero: string }
export type OliverDesk = { choices: DeskChoice[]; materials: MaterialTierOption[] }

// The published family already contains both photographs. These immutable
// import assets were checked against the 0П / П0 source rows and the gallery.
// Promote the matching photograph; keep every other current photo accessible.
const EVIDENCE = [
  { sku: "OL-65-1", rawCode: "0П", title: "Слева без наполнения, справа полки", label: "Тумба справа", hero: "25cc40df99f115319a41da4dacea181ec29b7c449e13ec65a134769398ab9774.jpg" },
  { sku: "OL-65-2", rawCode: "П0", title: "Слева полки, справа без наполнения", label: "Тумба слева", hero: "0e8dbdc6733f2d174e3d041d33bc25738aa61a8871c1e24e404afd6baeb51df1.jpg" },
] as const

/** A bounded exception for the already merged desk; no inference from SKU suffixes. */
export function verifiedOliverDesk(product: Product): OliverDesk | null {
  if (product.handle !== "ol-65" || product.status !== "published") return null
  const purchase = readProductPurchase(product)
  if (purchase?.sales_mode !== "configurable_to_order" || purchase.purchase_flow !== "cart" || !purchase.can_purchase) return null
  const meta = product.metadata as Product | undefined
  if (meta?.family_key !== "oliver:t65:stol-pismennyi-n-tumb" || meta.display_group) return null
  const variants = product.variants as Product[] | undefined
  if (!Array.isArray(variants) || variants.length !== 2) return null
  const amounts = readUniformRubAmounts(product)
  if (!amounts || !amounts.every((amount) => amount === amounts[0])) return null
  const images = product.images as Product[] | undefined
  if (!Array.isArray(images)) return null
  const choices: DeskChoice[] = []
  for (const evidence of EVIDENCE) {
    const variant = variants.find((item) => item.sku === evidence.sku)
    const variantMeta = variant?.metadata as Product | undefined
    const imported = variantMeta?.woodright_import as Product | undefined
    if (!variant || variant.deleted_at || typeof variant.id !== "string" ||
        variant.title !== evidence.title || imported?.package_sku !== evidence.sku ||
        imported.raw_code !== evidence.rawCode || variantMeta?.capabilities || variantMeta?.gallery_urls) return null
    const photo = images.find((image) => typeof image.url === "string" &&
      image.url === `/static/imports/WR-PFW-20260721T020528Z/${evidence.hero}`)
    if (!photo || typeof photo.url !== "string") return null
    choices.push({ id: variant.id, sku: evidence.sku, label: evidence.label, hero: photo.url })
  }
  if (new Set(choices.map((choice) => choice.id)).size !== 2) return null
  const opening = meta.buyer_default_configuration as Product | undefined
  const openingVariant = variants.find((variant) => variant.id === opening?.variant_id)
  if (!openingVariant) return null
  // Equal native base amounts and one shared tier contract establish both
  // sides' prices. Never treat OL-65-1 / -2 as material execution codes.
  const materials = verifiedMaterialOptions(
    { ...product, variants: [openingVariant] }, buildMaterialTierOptions(product, amounts[0])
  )
  return materials ? { choices, materials } : null
}

export function oliverDeskAxis(desk: OliverDesk): BuyerVariantAxis {
  return { label: "Расположение тумбы", choices: desk.choices.map((choice, sort) => ({ ...choice, sort })) }
}

/** Directional copy must follow the selected SKU, including structured data. */
export function oliverDeskTextProduct(product: Product, desk: OliverDesk | null, selectedId: string | null): Product {
  if (!desk || desk.choices.find((choice) => choice.id === selectedId)?.sku !== "OL-65-2") return product
  const description = typeof product.description === "string" ? product.description : ""
  const subtitle = typeof product.subtitle === "string" ? product.subtitle : ""
  return {
    ...product,
    description: description.replace("стоит справа", "стоит слева").replace("Слева остаётся", "Справа остаётся"),
    subtitle: subtitle.replace("тумба справа", "тумба слева"),
  }
}

export function oliverDeskMedia(
  desk: OliverDesk | null, selectedId: string | null, mainSrc: string, extraSrcs: string[]
): { mainSrc: string; extraSrcs: string[] } {
  const choice = desk?.choices.find((item) => item.id === selectedId)
  if (!choice) return { mainSrc, extraSrcs }
  const hero = choice.hero.replace(/^\/static\//, "/product-static/")
  const images = [...new Set([mainSrc, ...extraSrcs])]
  // Refuse to invent/reintroduce a URL outside the actual resolved gallery.
  if (!images.includes(hero)) return { mainSrc, extraSrcs }
  return { mainSrc: hero, extraSrcs: images.filter((src) => src !== hero) }
}

export function buildOliverDeskJsonLd(product: Product, desk: OliverDesk | null, scalar: Product): Product | null {
  if (!desk) return null
  const url = String(scalar.url)
  const groupId = `${url}#configurations`
  const productGroupID = `${product.id}:configurations`
  return {
    "@context": "https://schema.org", "@type": "ProductGroup", "@id": groupId,
    name: scalar.name, brand: scalar.brand, url, productGroupID,
    description: "Письменный стол Оливер с одной тумбой. Расположение тумбы и материал выбираются при заказе.",
    variesBy: ["https://schema.org/material", "Расположение тумбы"],
    hasVariant: desk.choices.flatMap((choice) => desk.materials.map((material) => {
      const target = new URL(url)
      target.searchParams.set("variant", choice.id)
      target.searchParams.set("material", material.code)
      const copy = oliverDeskTextProduct(product, desk, choice.id)
      const variant = buildProductJsonLd({
        name: String(scalar.name),
        description: typeof copy.description === "string" ? copy.description : null,
        url: target.href, images: [choice.hero.replace(/^\/static\//, "/product-static/")],
        sku: choice.sku, offerPriceRub: material.price,
        offerAvailability: offerAvailabilityFromPurchase(readProductPurchase(product)),
      })
      return {
        ...variant, "@id": `${target.href}#product`, productID: `${choice.id}:${material.code}`,
        material: material.label, inProductGroupWithID: productGroupID, isVariantOf: { "@id": groupId },
        additionalProperty: [{ "@type": "PropertyValue", name: "Расположение тумбы", value: choice.label }],
        ...Object.fromEntries(["height", "width", "depth"].filter((key) => scalar[key]).map((key) => [key, scalar[key]])),
      }
    })),
  }
}
