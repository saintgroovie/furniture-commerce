import type { AdminPromotionRuleDto } from "./types.ts"
import { ruleValueLabels } from "./types.ts"

/**
 * Package E — rule attribute mapping (fail-closed).
 * Only attributes from the proven 2.13.3 helper catalog are described in
 * operator language. Everything else (including any variant-level targeting,
 * which is NOT in the official rule-attribute map) is reported as unsupported
 * and routed to the stock Admin.
 */

export type RuleContext = "rules" | "target-rules" | "buy-rules"

export type KnownRuleAttribute = {
  attribute: string
  context: RuleContext[]
  /** Short noun for lists, e.g. «Товар». */
  label: string
  /** Prepositional wording for summaries, e.g. «выбранные товары». */
  scope_phrase: string
}

export const KNOWN_CONDITION_ATTRIBUTES: KnownRuleAttribute[] = [
  {
    attribute: "customer.groups.id",
    context: ["rules"],
    label: "Группа покупателей",
    scope_phrase: "выбранные группы покупателей",
  },
  {
    attribute: "region.id",
    context: ["rules"],
    label: "Регион",
    scope_phrase: "выбранные регионы",
  },
  {
    attribute: "shipping_address.country_code",
    context: ["rules"],
    label: "Страна доставки",
    scope_phrase: "выбранные страны доставки",
  },
  {
    attribute: "sales_channel_id",
    context: ["rules"],
    label: "Канал продаж",
    scope_phrase: "выбранные каналы продаж",
  },
  {
    attribute: "currency_code",
    context: ["rules"],
    label: "Валюта",
    scope_phrase: "выбранную валюту",
  },
]

export const KNOWN_TARGET_ATTRIBUTES: KnownRuleAttribute[] = [
  {
    attribute: "items.product.id",
    context: ["target-rules", "buy-rules"],
    label: "Товар",
    scope_phrase: "выбранные товары",
  },
  {
    attribute: "items.product.categories.id",
    context: ["target-rules", "buy-rules"],
    label: "Категория",
    scope_phrase: "товары выбранных категорий",
  },
  {
    attribute: "items.product.collection_id",
    context: ["target-rules", "buy-rules"],
    label: "Коллекция",
    scope_phrase: "товары выбранных коллекций",
  },
  {
    attribute: "items.product.type_id",
    context: ["target-rules", "buy-rules"],
    label: "Тип товара (Medusa)",
    scope_phrase: "товары выбранных типов Medusa",
  },
  {
    attribute: "items.product.tags.id",
    context: ["target-rules", "buy-rules"],
    label: "Тег",
    scope_phrase: "товары с выбранными тегами",
  },
  {
    attribute: "shipping_methods.shipping_option.shipping_option_type_id",
    context: ["target-rules"],
    label: "Тип доставки",
    scope_phrase: "выбранные способы доставки",
  },
]

const ALL_KNOWN = [...KNOWN_CONDITION_ATTRIBUTES, ...KNOWN_TARGET_ATTRIBUTES]

export type RuleSupport =
  | { kind: "supported"; meta: KnownRuleAttribute }
  | { kind: "fail_closed"; reason: string }

export function classifyRuleAttribute(
  attribute: string | null | undefined,
  context: RuleContext
): RuleSupport {
  const attr = (attribute ?? "").trim()
  if (!attr) {
    return {
      kind: "fail_closed",
      reason: "Условие без атрибута - управляйте этой акцией в стандартной админке",
    }
  }
  if (/variant/i.test(attr)) {
    // Variant-level targeting is not in the official 2.13.3 attribute catalog.
    return {
      kind: "fail_closed",
      reason:
        "Нацеливание на отдельные варианты не поддерживается модулем акций - выберите товар целиком",
    }
  }
  const meta = ALL_KNOWN.find((k) => k.attribute === attr && k.context.includes(context))
  if (!meta) {
    return {
      kind: "fail_closed",
      reason: `Условие «${attr}» не входит в проверенный набор - управляйте им в стандартной админке`,
    }
  }
  return { kind: "supported", meta }
}

const OPERATOR_PHRASES: Record<string, string> = {
  in: "включая",
  eq: "равно",
  ne: "кроме",
  gt: "больше",
  gte: "не меньше",
  lt: "меньше",
  lte: "не больше",
}

export function describeOperator(operator: string | null | undefined): string | null {
  const op = (operator ?? "").trim().toLowerCase()
  return OPERATOR_PHRASES[op] ?? null
}

export type RuleDescription =
  | {
      kind: "supported"
      attribute: string
      label: string
      operator_phrase: string
      values: string[]
      text: string
      is_exclusion: boolean
    }
  | { kind: "fail_closed"; attribute: string | null; reason: string }

export function describeRule(
  rule: AdminPromotionRuleDto,
  context: RuleContext
): RuleDescription {
  const support = classifyRuleAttribute(rule.attribute, context)
  if (support.kind === "fail_closed") {
    return { kind: "fail_closed", attribute: rule.attribute ?? null, reason: support.reason }
  }
  const operatorPhrase = describeOperator(rule.operator)
  if (!operatorPhrase) {
    return {
      kind: "fail_closed",
      attribute: rule.attribute ?? null,
      reason: `Оператор «${rule.operator ?? "не задан"}» не входит в проверенный набор - управляйте условием в стандартной админке`,
    }
  }
  const values = ruleValueLabels(rule)
  const valueText = values.length ? values.join(", ") : "значения не заданы"
  return {
    kind: "supported",
    attribute: support.meta.attribute,
    label: support.meta.label,
    operator_phrase: operatorPhrase,
    values,
    text: `${support.meta.label}: ${operatorPhrase} ${valueText}`,
    is_exclusion: (rule.operator ?? "").trim().toLowerCase() === "ne",
  }
}

/** True when every rule in the list is fully supported by the Woodright UI. */
export function allRulesSupported(
  rules: AdminPromotionRuleDto[] | null | undefined,
  context: RuleContext
): boolean {
  return (rules ?? []).every((r) => describeRule(r, context).kind === "supported")
}
