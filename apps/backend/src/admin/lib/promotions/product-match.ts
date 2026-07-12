import { ruleValueStrings, type AdminPromotionDto } from "./types.ts"

export type ProductPromotionMatch = {
  promotion: AdminPromotionDto
  /** How the product may be related — never claims cart application. */
  match: "direct" | "indirect" | "needs_cart_check"
  /** Human reason for the row. */
  reason: string
}

function isExcludeOp(op: string): boolean {
  return op === "ne"
}

/**
 * Match promotions that *may* touch a product. Exclusions that mention the
 * product (or conflict with includes) force `needs_cart_check` — we never
 * claim the promotion applies when include∩exclude is ambiguous.
 */
export function matchPromotionsForProduct(
  promotions: AdminPromotionDto[],
  productId: string,
  collectionId: string | null
): ProductPromotionMatch[] {
  const out: ProductPromotionMatch[] = []
  for (const p of promotions) {
    const rules = [
      ...(p.application_method?.target_rules ?? []),
      ...(p.application_method?.buy_rules ?? []),
    ]

    let includedDirect = false
    let includedIndirect = false
    let excludedDirect = false

    for (const rule of rules) {
      const attr = (rule.attribute ?? "").trim()
      const op = (rule.operator ?? "").trim().toLowerCase()
      const values = ruleValueStrings(rule)

      if (attr === "items.product.id") {
        if (values.includes(productId)) {
          if (isExcludeOp(op)) excludedDirect = true
          else if (op === "in" || op === "eq") includedDirect = true
        }
      }
      if (
        collectionId &&
        attr === "items.product.collection_id" &&
        values.includes(collectionId)
      ) {
        if (isExcludeOp(op)) {
          excludedDirect = true
        } else if (op === "in" || op === "eq") {
          includedIndirect = true
        }
      }
    }

    if (excludedDirect && (includedDirect || includedIndirect)) {
      out.push({
        promotion: p,
        match: "needs_cart_check",
        reason: "Товар одновременно попадает под включение и исключение — проверьте на корзине",
      })
      continue
    }
    if (excludedDirect && !includedDirect && !includedIndirect) {
      continue
    }
    if (includedDirect) {
      out.push({
        promotion: p,
        match: "direct",
        reason: "Прямое правило по этому товару",
      })
      continue
    }
    if (includedIndirect) {
      out.push({
        promotion: p,
        match: "indirect",
        reason: "Через коллекцию (предварительно; итог зависит от корзины)",
      })
    }
  }
  return out
}
