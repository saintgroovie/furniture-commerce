import type { DecorConfidence, DecorSource } from "./product-decor"
import {
  decorFromColorGuess,
  decorFromFilename,
  extractMotifFromTitle,
} from "./ww-title-motif-parse"
import { expectedMotifFromSkuPrefix, wwHandlePrefix } from "./ww-sku-prefix-motifs"

export type WwMotifResolution = {
  expected_motif_from_sku_prefix: string | null
  legacy_page_motif: string | null
  resolved_motif: string | null
  motif_confidence: DecorConfidence
  motif_source: DecorSource
  legacy_metadata_mismatch: boolean
  motif_subcollection: string | null
  motif_subcollection_expected: string | null
  motif_subcollection_observed: string | null
  motif_mismatch: boolean
}

function normalizeMotif(s: string | null | undefined): string {
  return (s || "")
    .toLowerCase()
    .replace(/['`]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}

export function resolveWwMotifIdentity(input: {
  handle: string
  productTitleRaw: string | null
  filename?: string | null
  colorGuess?: string | null
}): WwMotifResolution {
  const expected = expectedMotifFromSkuPrefix(input.handle)
  const prefix = wwHandlePrefix(input.handle)
  const legacyPageMotif = input.productTitleRaw ? extractMotifFromTitle(input.productTitleRaw) : null
  const legacy_metadata_mismatch =
    Boolean(expected && legacyPageMotif) &&
    normalizeMotif(expected) !== normalizeMotif(legacyPageMotif)

  let resolved: string | null = null
  let source: DecorSource = "unknown"
  let confidence: DecorConfidence = "unknown"

  if (expected) {
    resolved = expected
    source = "handle_prefix"
    confidence = "high"
  } else if (legacyPageMotif) {
    resolved = legacyPageMotif
    source = "title_parse"
    confidence = "high"
  } else {
    const fromColor = decorFromColorGuess(input.colorGuess)
    const fromFile = decorFromFilename(input.filename)
    if (fromColor) {
      resolved = fromColor
      source = "checklist_color"
      confidence = "low"
    } else if (fromFile) {
      resolved = fromFile
      source = "filename_guess"
      confidence = "low"
    } else if (prefix) {
      source = "unknown"
      confidence = "unknown"
    }
  }

  return {
    expected_motif_from_sku_prefix: expected,
    legacy_page_motif: legacyPageMotif,
    resolved_motif: resolved,
    motif_confidence: confidence,
    motif_source: source,
    legacy_metadata_mismatch,
    motif_subcollection: resolved,
    motif_subcollection_expected: expected,
    motif_subcollection_observed: legacyPageMotif,
    motif_mismatch: legacy_metadata_mismatch,
  }
}

export { extractMotifFromTitle, normalizeMotif }
