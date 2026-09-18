/**
 * Buyer-facing option presentation contract (PASS C).
 *
 * Semantics live next to execution metadata — storefront must not infer
 * swatch vs text from filenames or SKU hacks.
 *
 * presentation:
 *   - swatch_image — confirmed fabric/material texture URL (never product hero)
 *   - swatch_color — confirmed swatch_hex (including fabric-family representative colors)
 *   - text         — label chips (no evidenced visual sample)
 *   - model        — shape / headboard style chips
 *   - material     — material tier dropdown (pricing), not a color swatch
 *   - size         — size option chips
 */

export type OptionPresentation =
  | "swatch_image"
  | "swatch_color"
  | "text"
  | "model"
  | "material"
  | "size"

export type OptionSemanticType =
  | "upholstery"
  | "finish"
  | "wood"
  | "headboard"
  | "material_tier"
  | "size"
  | "configuration"
  | "unknown"

export type ExecutionPresentationFields = {
  presentation?: OptionPresentation
  /** Confirmed texture/sample URL only — never a full-product hero. */
  swatch_image?: string
  swatch_type?: "image" | "color" | "none"
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

export function isConfirmedSwatchHex(value: unknown): value is string {
  return typeof value === "string" && HEX_RE.test(value.trim())
}

export function isConfirmedSwatchImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false
  const t = value.trim()
  if (!t) return false
  /* Trust boundary: only the curated metadata field `swatch_image` / `swatch_url`
     should be passed here. Callers must not feed execution hero `urls` / mainSrc.
     Non-empty curated values are accepted as-is (no filename heuristics). */
  return true
}

/**
 * Resolve presentation for one execution row.
 * Never invents colors or texture URLs — only reads evidenced fields.
 */
export function resolveExecutionPresentation(row: {
  swatch_hex?: string | null
  swatch_image?: string | null
  presentation?: OptionPresentation | null
  swatch_type?: string | null
}): OptionPresentation {
  if (row.presentation === "swatch_image" || row.presentation === "swatch_color") {
    if (row.presentation === "swatch_image" && isConfirmedSwatchImageUrl(row.swatch_image)) {
      return "swatch_image"
    }
    if (row.presentation === "swatch_color" && isConfirmedSwatchHex(row.swatch_hex)) {
      return "swatch_color"
    }
  }
  if (row.swatch_type === "image" && isConfirmedSwatchImageUrl(row.swatch_image)) {
    return "swatch_image"
  }
  if (isConfirmedSwatchImageUrl(row.swatch_image)) {
    return "swatch_image"
  }
  if (isConfirmedSwatchHex(row.swatch_hex)) {
    return "swatch_color"
  }
  return "text"
}

/**
 * Row-level UI mode for an upholstery axis.
 * Color/image swatches when any value has evidenced visual data; else text chips.
 */
export function resolveUpholsteryAxisPresentation(
  rows: Array<{
    swatchHex?: string | null
    swatchImageUrl?: string | null
    presentation?: OptionPresentation | null
  }>
): OptionPresentation {
  if (!rows.length) return "text"
  if (
    rows.some(
      (r) =>
        r.presentation === "swatch_image" ||
        isConfirmedSwatchImageUrl(r.swatchImageUrl)
    )
  ) {
    return "swatch_image"
  }
  if (
    rows.some(
      (r) =>
        r.presentation === "swatch_color" || isConfirmedSwatchHex(r.swatchHex)
    )
  ) {
    return "swatch_color"
  }
  return "text"
}
