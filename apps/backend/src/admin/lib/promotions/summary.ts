import type { AdminPromotionDto } from "./types.ts"
import { formatFixedAmount, formatPercent } from "./amount.ts"
import { classifyRuleAttribute, describeRule } from "./rules.ts"

/**
 * Package E — one-line human summaries.
 * The primary text never exposes raw target_type / allocation / attribute
 * paths; those stay in the technical section. Unsupported shapes get an
 * honest fallback sentence instead of a guessed description.
 */

export type PromotionSummaryVM = {
  /** One line for lists and headers. */
  text: string
  /** True when the Woodright UI fully understands this promotion. */
  supported: boolean
  /** Why the promotion is routed to the stock Admin (when unsupported). */
  fallback_reason: string | null
  /** Secondary honesty notes, e.g. fixed discounts not touching base prices. */
  notes: string[]
}

function numericValue(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
    return Number(value)
  }
  return null
}

function scopePhrase(promotion: AdminPromotionDto): {
  phrase: string
  supported: boolean
  reason: string | null
} {
  const method = promotion.application_method
  const targetType = (method?.target_type ?? "").trim().toLowerCase()
  if (targetType === "order") {
    return { phrase: "на весь заказ", supported: true, reason: null }
  }
  if (targetType === "shipping_methods") {
    return { phrase: "на доставку", supported: true, reason: null }
  }
  if (targetType !== "items") {
    return {
      phrase: "с нераспознанной областью действия",
      supported: false,
      reason: "Область действия акции не входит в проверенный набор",
    }
  }

  const targetRules = method?.target_rules ?? []
  if (!targetRules.length) {
    return { phrase: "на все товары", supported: true, reason: null }
  }

  const described = targetRules.map((r) => describeRule(r, "target-rules"))
  const failed = described.find((d) => d.kind === "fail_closed")
  if (failed && failed.kind === "fail_closed") {
    return {
      phrase: "с условиями, которые нужно смотреть в стандартной админке",
      supported: false,
      reason: failed.reason,
    }
  }

  const inclusive = described.filter((d) => d.kind === "supported" && !d.is_exclusion)
  const exclusions = described.filter((d) => d.kind === "supported" && d.is_exclusion)

  let phrase: string
  if (!inclusive.length) {
    phrase = "на все товары"
  } else {
    const first = inclusive[0]
    const meta =
      first.kind === "supported"
        ? classifyRuleAttribute(first.attribute, "target-rules")
        : null
    phrase =
      meta && meta.kind === "supported" && inclusive.length === 1
        ? `на ${meta.meta.scope_phrase}`
        : "на выбранные товары"
  }
  if (exclusions.length) {
    phrase += " с исключениями"
  }
  return { phrase, supported: true, reason: null }
}

export function buildPromotionSummary(promotion: AdminPromotionDto): PromotionSummaryVM {
  const notes: string[] = []
  const type = (promotion.type ?? "").trim().toLowerCase()

  if (type === "buyget") {
    return {
      text: "Акция «купи - получи» - настраивается в стандартной админке",
      supported: false,
      fallback_reason:
        "Акции «купи X - получи Y» пока управляются только в стандартной админке",
      notes,
    }
  }
  if (type && type !== "standard") {
    return {
      text: "Акция нераспознанного типа - откройте её в стандартной админке",
      supported: false,
      fallback_reason: `Тип «${type}» не входит в проверенный набор`,
      notes,
    }
  }

  const method = promotion.application_method
  const methodType = (method?.type ?? "").trim().toLowerCase()
  const value = numericValue(method?.value)

  let resultPart: string | null = null
  if (methodType === "percentage" && value != null) {
    const targetType = (method?.target_type ?? "").trim().toLowerCase()
    if (value === 100 && targetType === "shipping_methods") {
      return {
        text: "Бесплатная доставка - настраивается в стандартной админке",
        supported: false,
        fallback_reason:
          "Бесплатная доставка пока не проверена в Woodright - управляйте ей в стандартной админке",
        notes,
      }
    }
    resultPart = `Скидка ${formatPercent(value)}`
  } else if (methodType === "fixed" && value != null) {
    resultPart = `Скидка ${formatFixedAmount(value, method?.currency_code)}`
    notes.push(
      "Фиксированная скидка не меняет базовые цены товаров — она вычитается при применении в Store API"
    )
  } else {
    return {
      text: "Не удалось прочитать размер скидки - откройте акцию в стандартной админке",
      supported: false,
      fallback_reason: "Способ расчёта скидки не распознан",
      notes,
    }
  }

  const trigger = promotion.is_automatic
    ? "применяется автоматически"
    : promotion.code
      ? `по коду ${promotion.code}`
      : "без кода и без автоприменения"

  const scope = scopePhrase(promotion)
  const text = `${resultPart} ${scope.phrase}, ${trigger}`
  return {
    text,
    supported: scope.supported,
    fallback_reason: scope.reason,
    notes,
  }
}
