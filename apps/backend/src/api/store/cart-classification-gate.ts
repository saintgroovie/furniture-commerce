/**
 * Pure cart classification gate for Woodright BESPOKE products.
 * Fail-closed: missing/malformed classification must not reach Medusa add-to-cart.
 */

export const BESPOKE = "BESPOKE" as const

export type AllowedProductType = "STANDARD" | "CONFIGURABLE" | "BESPOKE"

export type CartClassificationDecision =
  | { kind: "allow"; product_type: Exclude<AllowedProductType, "BESPOKE"> }
  | { kind: "block_bespoke" }
  | {
      kind: "reject"
      code: "PRODUCT_TYPE_VALIDATION_FAILED" | "PRODUCT_CLASSIFICATION_REQUIRED"
      message: string
      httpStatus: 400 | 500
    }

const ALLOWED: ReadonlySet<string> = new Set([
  "STANDARD",
  "CONFIGURABLE",
  "BESPOKE",
])

export function decideCartClassification(input: {
  productFound: boolean
  product_type?: string | null
}): CartClassificationDecision {
  if (!input.productFound) {
    return {
      kind: "reject",
      code: "PRODUCT_TYPE_VALIDATION_FAILED",
      message: "Unable to validate product type for cart operation.",
      httpStatus: 500,
    }
  }

  const raw = input.product_type
  if (typeof raw !== "string" || !ALLOWED.has(raw)) {
    return {
      kind: "reject",
      code: "PRODUCT_CLASSIFICATION_REQUIRED",
      message:
        "Product classification is required before adding to cart. Set STANDARD, CONFIGURABLE, or BESPOKE.",
      httpStatus: 400,
    }
  }

  if (raw === BESPOKE) {
    return { kind: "block_bespoke" }
  }

  return { kind: "allow", product_type: raw as Exclude<AllowedProductType, "BESPOKE"> }
}

/** Collect every variant_id from supported add-line-item body shapes. */
export function collectVariantIdsFromCartBody(body: unknown): string[] {
  if (!body || typeof body !== "object") return []
  const b = body as {
    variant_id?: unknown
    items?: unknown
  }
  const ids: string[] = []
  if (typeof b.variant_id === "string" && b.variant_id) {
    ids.push(b.variant_id)
  }
  if (Array.isArray(b.items)) {
    for (const item of b.items) {
      if (!item || typeof item !== "object") continue
      const id = (item as { variant_id?: unknown }).variant_id
      if (typeof id === "string" && id) ids.push(id)
    }
  }
  return [...new Set(ids)]
}
