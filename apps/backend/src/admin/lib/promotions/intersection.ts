import type { AdminPromotionDto } from "./types.ts"
import { describeRule } from "./rules.ts"
import { ruleValueStrings } from "./types.ts"

/**
 * Package E — target intersection analysis between two promotions.
 * Verdicts describe only whether the promotions can touch the same items;
 * they NEVER claim how discounts stack. Stacking is decided by the Medusa
 * cart engine and must be verified in a real cart.
 */

export type IntersectionVerdict =
  | "exact_overlap"
  | "possible_overlap"
  | "no_overlap_known"
  | "unknown"

export type IntersectionVM = {
  verdict: IntersectionVerdict
  explanation: string
  /** Mandatory honesty caveat: intersection ≠ stacking result. */
  stacking_note: string
}

const STACKING_NOTE =
  "Пересечение по товарам не означает суммирование скидок — совместный эффект покажет только проверка расчёта в тестовой корзине (не витрина)"

type TargetProfile =
  | { kind: "order" }
  | { kind: "shipping" }
  | { kind: "all_items" }
  | {
      kind: "items"
      product_ids: Set<string>
      only_product_ids: boolean
      has_exclusions: boolean
    }
  | { kind: "unknown" }

function profileOf(promotion: AdminPromotionDto): TargetProfile {
  const method = promotion.application_method
  const targetType = (method?.target_type ?? "").trim().toLowerCase()
  if (targetType === "order") return { kind: "order" }
  if (targetType === "shipping_methods") return { kind: "shipping" }
  if (targetType !== "items") return { kind: "unknown" }

  const rules = method?.target_rules ?? []
  if (!rules.length) return { kind: "all_items" }

  const productIds = new Set<string>()
  let onlyProductIds = true
  let hasExclusions = false
  for (const rule of rules) {
    const d = describeRule(rule, "target-rules")
    if (d.kind === "fail_closed") return { kind: "unknown" }
    if (d.is_exclusion) {
      hasExclusions = true
      continue
    }
    if ((rule.attribute ?? "").trim() === "items.product.id") {
      for (const v of ruleValueStrings(rule)) productIds.add(v)
    } else {
      onlyProductIds = false
    }
  }
  return {
    kind: "items",
    product_ids: productIds,
    only_product_ids: onlyProductIds,
    has_exclusions: hasExclusions,
  }
}

export function analyzeTargetIntersection(
  a: AdminPromotionDto,
  b: AdminPromotionDto
): IntersectionVM {
  const pa = profileOf(a)
  const pb = profileOf(b)

  if (pa.kind === "unknown" || pb.kind === "unknown") {
    return {
      verdict: "unknown",
      explanation:
        "У одной из акций условия, которые Woodright не распознаёт - пересечение оценить нельзя",
      stacking_note: STACKING_NOTE,
    }
  }

  // Order-level promotions touch the whole order total, so any promotion that
  // discounts items or the order intersects with them on the same purchase.
  if (pa.kind === "order" || pb.kind === "order") {
    const other = pa.kind === "order" ? pb : pa
    if (other.kind === "shipping") {
      return {
        verdict: "possible_overlap",
        explanation:
          "Одна акция действует на итог заказа, другая на доставку - в одном заказе могут сработать обе",
        stacking_note: STACKING_NOTE,
      }
    }
    return {
      verdict: "exact_overlap",
      explanation: "Акция на итог заказа пересекается с любой скидкой в том же заказе",
      stacking_note: STACKING_NOTE,
    }
  }

  if (pa.kind === "shipping" && pb.kind === "shipping") {
    return {
      verdict: "exact_overlap",
      explanation: "Обе акции действуют на доставку",
      stacking_note: STACKING_NOTE,
    }
  }
  if (pa.kind === "shipping" || pb.kind === "shipping") {
    return {
      verdict: "no_overlap_known",
      explanation: "Одна акция действует на товары, другая на доставку - по товарам они не пересекаются",
      stacking_note: STACKING_NOTE,
    }
  }

  if (pa.kind === "all_items" || pb.kind === "all_items") {
    return {
      verdict: "exact_overlap",
      explanation: "Одна из акций действует на все товары, поэтому пересечение есть всегда",
      stacking_note: STACKING_NOTE,
    }
  }

  if (pa.kind === "items" && pb.kind === "items") {
    if (pa.only_product_ids && pb.only_product_ids && !pa.has_exclusions && !pb.has_exclusions) {
      const common = [...pa.product_ids].filter((id) => pb.product_ids.has(id))
      if (common.length) {
        return {
          verdict: "exact_overlap",
          explanation: `Общие товары в условиях обеих акций: ${common.length}`,
          stacking_note: STACKING_NOTE,
        }
      }
      return {
        verdict: "no_overlap_known",
        explanation: "Списки товаров в условиях не пересекаются",
        stacking_note: STACKING_NOTE,
      }
    }
    // Collections / categories / tags / exclusions cannot be resolved to
    // product membership on the client — only a possible overlap is honest.
    return {
      verdict: "possible_overlap",
      explanation:
        "Условия заданы через коллекции, категории, теги или исключения - пересечение возможно, но точно определить его без каталога нельзя",
      stacking_note: STACKING_NOTE,
    }
  }

  return {
    verdict: "unknown",
    explanation: "Не удалось сопоставить условия акций",
    stacking_note: STACKING_NOTE,
  }
}
