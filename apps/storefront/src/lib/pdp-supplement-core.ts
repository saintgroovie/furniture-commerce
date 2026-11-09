import { NEW_CONTENT_GEOMETRY_KEYS } from "./pdp-supplement-geometry"
import { createHash } from "node:crypto"
import { isBuyerPublicProductStatus } from "./buyer-publication"
import { getDimensions, formatDimensionsCompactLabeled } from "./product-metadata"
import { verifiedMaterialTierCopy } from "./verified-september-catalog"
import type { PdpSupplementView, SupplementalRow } from "./pdp-supplement-view"

type Obj = Record<string, any>
type Fact = { value: any; guards?: Obj; native_source_fields?: { native_field: string; source_value_sha256: string }[] }
export type ContentRecord = { product_id: string; variant_id: string; sku: string; content: Record<string, Fact> }
export type SupplementContext = {
  routeKey: string; productKey: string; urlVariantAtRender: string | null
  existingLabels: string[]; nativeBodyShown: boolean; nativeSleepingShown: boolean
  nativePositionShown: boolean; configurationShown: boolean; materialControlShown: boolean
  resolvedCollection: string | null; initialMaterialCode: string | null
  deliveryPolicyText: string
}

/** Same UTF8 JSON contract as the data authority, including sorted nested keys. */
export function canonicalContentValue(value: any): string {
  if (value === undefined || typeof value === "function" || typeof value === "symbol" || (typeof value === "number" && !Number.isFinite(value))) throw new Error("Non-JSON source value")
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return "[" + value.map(canonicalContentValue).join(",") + "]"
  return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + canonicalContentValue(value[k])).join(",") + "}"
}
function valueAt(root: Obj, path: string): any {
  return path.split(".").reduce((node, key) => node && typeof node === "object" && Object.hasOwn(node, key) ? node[key] : undefined, root)
}
function factMatches(fact: Fact | undefined, root: Obj, collection: string | null, allowNoNative = false): boolean {
  if (!fact || (!allowNoNative && !fact.native_source_fields?.length)) return false
  try {
    for (const source of fact.native_source_fields ?? []) {
      const actual = valueAt(root, source.native_field)
      if (actual === undefined || createHash("sha256").update(canonicalContentValue(actual)).digest("hex") !== source.source_value_sha256) return false
    }
    for (const [path, expected] of Object.entries(fact.guards?.source_values_must_match ?? {})) {
      const actual = path === "resolved_native_collection" ? collection : valueAt(root, path) ?? null
      if (canonicalContentValue(actual) !== canonicalContentValue(expected)) return false
    }
    return true
  } catch { return false }
}

/** Read-only exact selected record. No source ledger or whole dataset leaves here. */
export function buildPdpSupplement(record: ContentRecord | null, product: Obj,
  selectedVariantId: string | null, context: SupplementContext): PdpSupplementView | null {
  if (!record || !isBuyerPublicProductStatus(product.status) || record.product_id !== product.id || record.variant_id !== selectedVariantId) return null
  const variant = Array.isArray(product.variants) ? product.variants.find((v: Obj) => v?.id === selectedVariantId) : null
  if (!variant || variant.sku !== record.sku) return null
  const root = { product, variant }, facts = record.content, rows: SupplementalRow[] = []
  const hasLabel = (label: string) => context.existingLabels.includes(label)
  const add = (label: string, value: unknown) => {
    if (!hasLabel(label) && typeof value === "string" && value.trim()) rows.push({ label, value })
  }
  const body = facts.body_dimensions
  if (!context.nativeBodyShown && !getDimensions(product, variant) && factMatches(body, root, context.resolvedCollection, true)) {
    const missingGuard = body?.guards?.source_values_must_match
    // The only non-native geometry is the authority's exact missing-only workbook join.
    const missingOnly = NEW_CONTENT_GEOMETRY_KEYS.includes(record.product_id + "|" + record.variant_id + "|" + record.sku) && missingGuard?.["product.metadata.dimensions"] === null && missingGuard?.["product.metadata.dimensions_normalized"] === null &&
      typeof missingGuard?.["product.metadata.workbook_row_key"] === "string" && typeof missingGuard?.["product.metadata.workbook_product_code"] === "string" && typeof missingGuard?.resolved_native_collection === "string" &&
      product.metadata?.dimensions == null && product.metadata?.dimensions_normalized == null &&
      variant.metadata?.dimensions == null && variant.metadata?.dimensions_normalized == null
    // A null native presenter can mean an explicit rejection, not missing data.
    // Never reconstruct a native-sourced measurement behind that presenter.
    if (missingOnly) {
      const dim = getDimensions({ metadata: { dimensions: body.value.dimensions } })
      if (dim) { const formatted = formatDimensionsCompactLabeled(dim); add("Габариты", formatted.values + (formatted.caption ? " · " + formatted.caption : "")) }
    }
  }
  const sleeping = facts.sleeping_place
  // Structured mattress bags supersede older variant-axis/title facts, including
  // explicit unknown or inconsistent bags deliberately hidden by the presenter.
  const sleepingSourceMissing = variant.metadata?.mattress_size == null && product.metadata?.mattress_size == null
  if (!context.nativeSleepingShown && sleepingSourceMissing && factMatches(sleeping, root, context.resolvedCollection)) add(sleeping.value.label, sleeping.value.value)
  const position = facts.separate_position_dimensions
  if (!context.nativePositionShown && factMatches(position, root, context.resolvedCollection) && position.value.not_body_height === true && Number.isFinite(position.value.height_with_raised_mirror_mm))
    add(position.value.label, position.value.height_with_raised_mirror_mm + " мм")
  const configuration = facts.selected_configuration
  if (!context.configurationShown && factMatches(configuration, root, context.resolvedCollection))
    for (const [label, value] of Object.entries(configuration.value)) add(label, value)
  const bundle = facts.documented_supplied_items
  if (factMatches(bundle, root, context.resolvedCollection) && Array.isArray(bundle.value))
    for (const item of bundle.value) if (typeof item.item === "string" && typeof item.included === "boolean") add(item.included ? "Входит в комплект" : "Не входит в комплект", item.item)
  const materials: Record<string, string> = {}
  const material = facts.material_options
  if (!context.materialControlShown && factMatches(material, root, context.resolvedCollection) && Array.isArray(material.value)) {
    const capabilities = variant.metadata?.capabilities
    const tiers = capabilities && Object.hasOwn(capabilities, "material_tiers") ? capabilities.material_tiers : product.metadata?.material_tiers
    for (const row of material.value) {
      const raw = tiers?.[row.key]
      if (!raw || raw.key !== row.key || row.applies_only_when_selected_material_key !== row.key) continue
      const metadata = { ...product.metadata, material_tiers: tiers }
      const label = verifiedMaterialTierCopy(metadata, row.key)?.label ?? raw.label_ru
      if (label === row.label && typeof label === "string") materials[row.key] = label
    }
  }
  const delivery = facts.delivery_policy_reference
  const deliveryHref = factMatches(delivery, root, context.resolvedCollection, true) && delivery.value.href === "/delivery" && delivery.value.label === "Доставка" &&
    typeof delivery.value.summary === "string" && context.deliveryPolicyText.startsWith(delivery.value.summary) ? "/delivery" : null
  if (!rows.length && !Object.keys(materials).length && !deliveryHref) return null
  return { routeKey: context.routeKey, productKey: context.productKey, productId: product.id,
    variantId: variant.id, sku: variant.sku, urlVariantAtRender: context.urlVariantAtRender,
    rows, materials, initialMaterialCode: context.initialMaterialCode ?? (Object.keys(materials).length === 1 ? (Object.keys(materials)[0] ?? null) : null), deliveryHref }
}
