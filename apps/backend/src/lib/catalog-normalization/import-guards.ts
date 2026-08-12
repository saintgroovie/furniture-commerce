/**
 * Import / ingest guards for catalog normalization invariants.
 * Fail-closed helpers — call from migrate toolkit and future ingest validators.
 * Do not invent titles or swatches here; only reject known-bad shapes.
 */

import { extractPedestalDeskCode } from "./pedestal-desk-codes"
import type { OptionPresentation } from "../option-presentation-contract"

export type ImportGuardFinding = {
  code:
    | "PEDESTAL_CODE_IN_PUBLIC_TITLE"
    | "DEFAULT_VARIANT_PUBLIC_TITLE"
    | "SWATCH_IMAGE_WITHOUT_ASSET"
    | "SWATCH_COLOR_WITHOUT_HEX"
    | "HERO_AS_SWATCH_URL"
  message: string
  path?: string
}

const DEFAULT_TITLE_RE = /default\s*variant|\bdefault\b/i

/**
 * Reject buyer-facing titles that still carry verified pedestal letter codes
 * or Medusa stub wording.
 */
export function guardBuyerFacingTitle(title: string): ImportGuardFinding[] {
  const out: ImportGuardFinding[] = []
  const t = title.trim()
  if (!t) return out
  if (extractPedestalDeskCode(t)) {
    out.push({
      code: "PEDESTAL_CODE_IN_PUBLIC_TITLE",
      message: `public title still ends with pedestal code: ${t}`,
    })
  }
  if (DEFAULT_TITLE_RE.test(t)) {
    out.push({
      code: "DEFAULT_VARIANT_PUBLIC_TITLE",
      message: `public title looks like Medusa stub: ${t}`,
    })
  }
  return out
}

/**
 * Texture presentation requires an explicit swatch asset URL.
 * Color presentation requires an explicit hex.
 * Hero/product gallery URLs must not be accepted as swatch_image without
 * a separate evidence flag (callers pass heroUrls to compare).
 */
export function guardExecutionSwatchRow(
  entry: Record<string, unknown>,
  opts?: { heroUrls?: string[]; path?: string }
): ImportGuardFinding[] {
  const out: ImportGuardFinding[] = []
  const path = opts?.path
  const presentation = entry.presentation as OptionPresentation | undefined
  const swatchImage =
    (typeof entry.swatch_image === "string" && entry.swatch_image.trim()) ||
    (typeof entry.swatch_url === "string" && entry.swatch_url.trim()) ||
    ""
  const swatchHex =
    typeof entry.swatch_hex === "string" ? entry.swatch_hex.trim() : ""

  if (presentation === "swatch_image" && !swatchImage) {
    out.push({
      code: "SWATCH_IMAGE_WITHOUT_ASSET",
      message: "presentation=swatch_image without swatch asset",
      path,
    })
  }
  if (presentation === "swatch_color" && !swatchHex) {
    out.push({
      code: "SWATCH_COLOR_WITHOUT_HEX",
      message: "presentation=swatch_color without swatch_hex",
      path,
    })
  }
  if (swatchImage && opts?.heroUrls?.length) {
    const norm = (u: string) => u.trim().split("?")[0]!.toLowerCase()
    const heroes = new Set(opts.heroUrls.map(norm).filter(Boolean))
    if (heroes.has(norm(swatchImage))) {
      out.push({
        code: "HERO_AS_SWATCH_URL",
        message: "swatch_image matches a product hero URL",
        path,
      })
    }
  }
  return out
}
