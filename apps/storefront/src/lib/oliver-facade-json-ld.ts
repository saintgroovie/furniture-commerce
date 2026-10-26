import type { MaterialTierOption } from "./material-tiers"
import { buildMaterialTierOptions } from "./material-tiers"
import { orderedSparseVariants, sparseVariantMap, withVariantCapabilities } from "./sparse-variant-map"
import { variantChipTarget } from "./buyer-variant-axis"
import { variantRubPrice } from "./variant-rub-price"
import { buildProductJsonLd, offerAvailabilityFromPurchase } from "./product-json-ld"
import { getDimensions, pdpDimensionCells } from "./product-metadata"
import { resolvePdpMediaSrc } from "./product-images"
import { readProductPurchase } from "./woodright-order/purchase-contract"

type Row = Record<string, unknown>
export type OliverFacadeConfiguration = {
  variantId: string; sku: string; label: string; material: MaterialTierOption
  gallery: string[]; description: string | null; dimensions: ReturnType<typeof pdpDimensionCells>
}

/** The approved D02 family has three actual combinations, never a Cartesian product. */
export function verifiedOliverFacadeConfigurations(product: Row): OliverFacadeConfiguration[] | null {
  if (product.handle !== "ol-08-1" || product.status !== "published") return null
  const map = sparseVariantMap(product)
  const variants = product.variants as Row[] | undefined
  if (!map || map.axes.length !== 1 || map.axes[0].key !== "facade" || variants?.length !== 2 ||
      variants.some(v => !["OL-08-1", "OL-08-2"].includes(String(v.sku))) ||
      new Set(variants.map(v => v.sku)).size !== 2 ||
      !offerAvailabilityFromPurchase(readProductPurchase(product))) return null
  const configurations: OliverFacadeConfiguration[] = []
  for (const choice of orderedSparseVariants(map)) {
    const variant = variants.find(v => v.id === choice.id)!
    const base = variantRubPrice(variant)
    const meta = variant.metadata as Row | undefined
    const capabilities = meta?.capabilities as Row | undefined
    const raw = capabilities?.material_tiers as Record<string, Row> | undefined
    const gallery = meta?.gallery_urls
    if (base == null || !raw || !Array.isArray(gallery) || !gallery.length ||
        !gallery.every((src): src is string => typeof src === "string" && src.startsWith("/static/"))) return null
    const view = withVariantCapabilities(product, variant)
    let options = buildMaterialTierOptions(view, base)
    if (!options && Object.keys(raw).length === 1) {
      const full = raw.solid_full
      if (full?.key !== "solid_full" || full.price_multiplier !== 1 ||
          typeof full.label_ru !== "string" || !full.label_ru.trim()) return null
      options = [{ code: "solid_full", label: full.label_ru, multiplier: 1, price: base,
        position: Number(full.position) || 0, description: typeof full.description_ru === "string" ? full.description_ru : null }]
    }
    if (!options || options.length !== Object.keys(raw).length ||
        options.some(o => o.price == null || o.price <= 0 || !/^[a-z0-9_]+$/.test(o.code) ||
          (raw[o.code]?.price_rub != null && raw[o.code].price_rub !== o.price))) return null
    const dimensions = getDimensions(product, variant)
    for (const material of options) configurations.push({
      variantId: choice.id, sku: choice.sku, label: choice.values.facade.display, material,
      gallery: gallery.map(resolvePdpMediaSrc),
      description: typeof meta?.source_description === "string" ? meta.source_description : null,
      dimensions: dimensions ? pdpDimensionCells(dimensions) : [],
    })
  }
  // Verify the backend opening contract against exactly the configuration the UI opens.
  const opening = (product.metadata as Row | undefined)?.buyer_default_configuration as Row | undefined
  const first = configurations[0]
  if (!opening || !first || configurations.length !== 3 ||
      opening.variant_id !== first.variantId || opening.material_execution_code !== first.material.code ||
      opening.min_unit_price !== first.material.price || opening.material_price_multiplier !== first.material.multiplier ||
      opening.color_multiplier !== 1) return null
  return configurations
}

export function oliverFacadeMaterialOptions(configurations: OliverFacadeConfiguration[] | null, selectedId: string | null) {
  const options = configurations?.filter(c => c.variantId === selectedId).map(c => c.material) ?? []
  return options.length > 1 ? options : null
}

/** A facade chip must not carry an unsupported material from the previous SKU. */
export function oliverFacadeVariantTarget(configurations: OliverFacadeConfiguration[], handle: string, variantId: string,
  search: Record<string, string | string[] | undefined> | undefined) {
  const next = { ...search }
  const material = typeof next.material === "string" ? next.material : undefined
  if (material && !configurations.some(c => c.variantId === variantId && c.material.code === material)) delete next.material
  return variantChipTarget(handle, variantId, next)
}

export function buildOliverFacadeJsonLd(product: Row, configurations: OliverFacadeConfiguration[] | null, scalar: Row): Row | null {
  if (!configurations) return null
  const groupId = `${scalar.url}#facade-materials`
  return {
    "@context": "https://schema.org", "@type": "ProductGroup", "@id": groupId,
    name: scalar.name, brand: scalar.brand, url: scalar.url,
    productGroupID: `${product.id}:facade-materials`, variesBy: ["https://schema.org/material", "Исполнение фасада"],
    hasVariant: configurations.map(c => {
      const url = new URL(String(scalar.url)); url.searchParams.set("variant", c.variantId); url.searchParams.set("material", c.material.code)
      return {
        ...buildProductJsonLd({ name: String(scalar.name),
          url: url.href, description: c.description, images: c.gallery, sku: c.sku, material: c.material.label,
          dimensions: c.dimensions, offerPriceRub: c.material.price,
          offerAvailability: offerAvailabilityFromPurchase(readProductPurchase(product)) }),
        "@id": `${url.href}#product`, productID: `${c.variantId}:${c.material.code}`,
        inProductGroupWithID: `${product.id}:facade-materials`, isVariantOf: { "@id": groupId },
        additionalProperty: [{ "@type": "PropertyValue", name: "Исполнение фасада", value: c.label }],
      }
    }),
  }
}

