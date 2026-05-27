/** Willie Winkie decor/motif resolution (read-only). */

import { resolveWwMotifIdentity } from "./ww-motif-resolution"
import {
  expectedMotifFromSkuPrefix,
  isKnownWwSkuPrefix,
  wwHandlePrefix,
  WW_SKU_PREFIX_MOTIFS,
} from "./ww-sku-prefix-motifs"
import {
  decorFromColorGuess,
  decorFromFilename,
  extractMotifFromTitle,
  findMotifInTitle,
} from "./ww-title-motif-parse"

export type DecorSource =
  | "price_list"
  | "seed_products"
  | "normalized"
  | "title_parse"
  | "handle_prefix"
  | "operator_note"
  | "filename_guess"
  | "checklist_color"
  | "unknown"

export type DecorConfidence = "high" | "low" | "unknown"

export type WwTitleParts = {
  product_type_title: string | null
  motif_observed: string | null
  catalog_code_label: string | null
}

export type ProductDecor = {
  is_willie_winkie: boolean
  expected_motif_from_sku_prefix: string | null
  legacy_page_motif: string | null
  resolved_motif: string | null
  legacy_metadata_mismatch: boolean
  motif_subcollection: string | null
  motif_subcollection_expected: string | null
  motif_subcollection_observed: string | null
  catalog_code_label: string | null
  motif_source: DecorSource
  motif_confidence: DecorConfidence
  motif_mismatch: boolean
  decor_motif: string | null
  decor_motif_expected: string | null
  decor_motif_observed: string | null
  decor_source: DecorSource
  decor_confidence: DecorConfidence
  decor_mismatch: boolean
}

/** @deprecated use WW_SKU_PREFIX_MOTIFS */
export const WW_HANDLE_PREFIX_MOTIFS = WW_SKU_PREFIX_MOTIFS
export { WW_SKU_PREFIX_MOTIFS, expectedMotifFromSkuPrefix, isKnownWwSkuPrefix, wwHandlePrefix }
export { extractMotifFromTitle, findMotifInTitle, decorFromColorGuess, decorFromFilename }

export function isWillieWinkieCollection(collection: string | null | undefined): boolean {
  return (collection || "").toLowerCase() === "willie-winkie"
}

export function isWillieWinkieSku(handle: string, collection: string | null | undefined): boolean {
  if (isWillieWinkieCollection(collection)) return true
  const prefix = wwHandlePrefix(handle)
  return Boolean(prefix && isKnownWwSkuPrefix(prefix))
}

export function motifFromHandlePrefix(handle: string): string | null {
  return expectedMotifFromSkuPrefix(handle)
}

export function extractCatalogCodeFromTitle(title: string | null | undefined): string | null {
  if (!title) return null
  const m = title.match(/\(\s*гл\.?\s*(\d+)\s*\)/i)
  return m ? `гл.${m[1]}` : null
}

function motifVariants(motif: string): string[] {
  const base = motif.replace(/[`']/g, "'").trim()
  return [...new Set([motif, base, base.replace(/'/g, "`"), base.replace(/'/g, "'")])]
}

/** Split legacy h1 into product type, motif subcollection, price-list code. */
export function parseWwLegacyTitle(
  title: string | null | undefined,
  expectedMotif?: string | null
): WwTitleParts {
  if (!title?.trim()) {
    return { product_type_title: null, motif_observed: null, catalog_code_label: null }
  }
  const catalog_code_label = extractCatalogCodeFromTitle(title)
  const motif_observed = findMotifInTitle(title, expectedMotif)
  let product_type_title = title.replace(/\s+/g, " ").trim()
  const catalogParen = title.match(/\(\s*гл\.?\s*\d+\s*\)/i)?.[0]
  if (catalogParen) product_type_title = product_type_title.replace(catalogParen, "").trim()
  const stripMotif = motif_observed || expectedMotif
  if (stripMotif) {
    for (const v of motifVariants(stripMotif)) {
      const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      product_type_title = product_type_title.replace(new RegExp(escaped, "i"), "").trim()
    }
  }
  product_type_title = product_type_title.replace(/[,\s·-]+$/g, "").trim()
  return {
    product_type_title: product_type_title || null,
    motif_observed,
    catalog_code_label,
  }
}

export function motifSourceLabel(source: DecorSource): string {
  return decorSourceLabel(source)
}

export function decorSourceLabel(source: DecorSource): string {
  const map: Record<DecorSource, string> = {
    price_list: "price_list",
    seed_products: "seed",
    normalized: "normalized",
    title_parse: "title_parse",
    handle_prefix: "handle_prefix",
    operator_note: "operator_note",
    filename_guess: "filename_guess",
    checklist_color: "checklist_color",
    unknown: "unknown",
  }
  return map[source] || source
}

type PickDecorInput = {
  handle: string
  collection: string | null
  productTitle: string | null
  titleSource?: string
  seedDecor?: string | null
  invDecorHint?: string | null
  filename?: string | null
  colorGuess?: string | null
}

export function pickProductDecor(input: PickDecorInput): ProductDecor {
  const isWw = isWillieWinkieSku(input.handle, input.collection)

  if (isWw) {
    const r = resolveWwMotifIdentity({
      handle: input.handle,
      productTitleRaw: input.productTitle,
      filename: input.filename,
      colorGuess: input.colorGuess,
    })
    return {
      is_willie_winkie: true,
      expected_motif_from_sku_prefix: r.expected_motif_from_sku_prefix,
      legacy_page_motif: r.legacy_page_motif,
      resolved_motif: r.resolved_motif,
      legacy_metadata_mismatch: r.legacy_metadata_mismatch,
      motif_subcollection: r.resolved_motif,
      motif_subcollection_expected: r.expected_motif_from_sku_prefix,
      motif_subcollection_observed: r.legacy_page_motif,
      catalog_code_label: extractCatalogCodeFromTitle(input.productTitle),
      motif_source: r.motif_source,
      motif_confidence: r.motif_confidence,
      motif_mismatch: r.legacy_metadata_mismatch,
      decor_motif: r.resolved_motif,
      decor_motif_expected: r.expected_motif_from_sku_prefix,
      decor_motif_observed: r.legacy_page_motif,
      decor_source: r.motif_source,
      decor_confidence: r.motif_confidence,
      decor_mismatch: r.legacy_metadata_mismatch,
    }
  }

  const titleObserved = extractMotifFromTitle(input.productTitle || "")
  return {
    is_willie_winkie: false,
    expected_motif_from_sku_prefix: null,
    legacy_page_motif: titleObserved,
    resolved_motif: titleObserved,
    legacy_metadata_mismatch: false,
    motif_subcollection: titleObserved,
    motif_subcollection_expected: null,
    motif_subcollection_observed: titleObserved,
    catalog_code_label: null,
    motif_source: "unknown",
    motif_confidence: "unknown",
    motif_mismatch: false,
    decor_motif: titleObserved,
    decor_motif_expected: null,
    decor_motif_observed: titleObserved,
    decor_source: "unknown",
    decor_confidence: "unknown",
    decor_mismatch: false,
  }
}
