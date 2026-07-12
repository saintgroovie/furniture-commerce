import type { AdminPromotionDto } from "./types.ts"
import { describeRule } from "./rules.ts"
import { ruleValueStrings } from "./types.ts"

/**
 * Package E — honest preliminary catalog impact estimate.
 * The UI must never promise an exact blast radius it cannot compute
 * client-side. Product-id lists give a countable upper bound; collection /
 * category / tag scopes depend on catalog contents; anything unknown is
 * reported as such.
 */

export type ImpactConfidence = "exact_list" | "depends_on_catalog" | "whole_order" | "unknown"

export type ImpactEstimateVM = {
  confidence: ImpactConfidence
  headline: string
  notes: string[]
}

export function buildImpactEstimate(promotion: AdminPromotionDto): ImpactEstimateVM {
  const notes: string[] = []
  const method = promotion.application_method
  const methodType = (method?.type ?? "").trim().toLowerCase()
  if (methodType === "fixed") {
    notes.push(
      "Фиксированная скидка не меняет базовые цены в каталоге — сумма вычитается только при применении в тестовой корзине"
    )
  }
  notes.push("Оценка предварительная: итог зависит от состава корзины и других акций")

  const targetType = (method?.target_type ?? "").trim().toLowerCase()
  if (targetType === "order") {
    return {
      confidence: "whole_order",
      headline: "Действует на итог заказа, а не на отдельные товары",
      notes,
    }
  }
  if (targetType === "shipping_methods") {
    return {
      confidence: "depends_on_catalog",
      headline: "Действует на стоимость доставки - охват зависит от способов доставки",
      notes,
    }
  }
  if (targetType !== "items") {
    return {
      confidence: "unknown",
      headline: "Охват оценить нельзя - область действия не распознана",
      notes,
    }
  }

  const targetRules = method?.target_rules ?? []
  if (!targetRules.length) {
    return {
      confidence: "depends_on_catalog",
      headline: "Действует на все товары каталога",
      notes,
    }
  }

  const described = targetRules.map((r) => ({ rule: r, d: describeRule(r, "target-rules") }))
  if (described.some(({ d }) => d.kind === "fail_closed")) {
    return {
      confidence: "unknown",
      headline: "Охват оценить нельзя - есть условия, которые Woodright не распознаёт",
      notes,
    }
  }

  const hasExclusions = described.some(({ d }) => d.kind === "supported" && d.is_exclusion)
  const inclusive = described.filter(({ d }) => d.kind === "supported" && !d.is_exclusion)

  const productIdRules = inclusive.filter(
    ({ rule }) => (rule.attribute ?? "").trim() === "items.product.id"
  )
  const onlyProductIds = inclusive.length > 0 && productIdRules.length === inclusive.length

  if (onlyProductIds) {
    const ids = new Set<string>()
    for (const { rule } of productIdRules) {
      for (const v of ruleValueStrings(rule)) ids.add(v)
    }
    if (hasExclusions) {
      notes.push("Часть товаров исключена - фактический охват меньше списка")
    }
    return {
      confidence: "exact_list",
      headline: `Затронет до ${ids.size} ${pluralProducts(ids.size)} (по списку в условиях)`,
      notes,
    }
  }

  if (!inclusive.length) {
    return {
      confidence: "depends_on_catalog",
      headline: hasExclusions
        ? "Действует на все товары, кроме исключённых - точное число зависит от каталога"
        : "Действует на все товары каталога",
      notes,
    }
  }

  if (hasExclusions) {
    notes.push("Часть товаров исключена - фактический охват меньше выборки")
  }
  return {
    confidence: "depends_on_catalog",
    headline:
      "Охват зависит от каталога: условия заданы через коллекции, категории, теги или типы",
    notes,
  }
}

function pluralProducts(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return "товара"
  return "товаров"
}
