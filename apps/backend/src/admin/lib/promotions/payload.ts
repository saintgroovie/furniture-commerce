/**
 * Package E — create payload builder for the promotion wizard.
 * Emits only shapes proven against the 2.13.3 AdminCreatePromotion schema:
 * standard type, percentage/fixed, order/items targets, product/collection
 * selectors, exclusions via per-id `ne` rules. Everything else fails closed
 * before any network call.
 */

export type PromotionWizardValues = {
  /** How the discount is triggered. */
  trigger: "code" | "automatic"
  /** Code is required by the API even for automatic promotions. */
  code: string
  kind: "percentage" | "fixed"
  /** Required when kind = percentage. 0 < n <= 100. */
  percent?: number | null
  /** Required when kind = fixed. Major units, > 0. */
  amount?: number | null
  /** Defaults to rub for fixed promotions. */
  currency_code?: string | null
  scope: "order" | "products" | "collections"
  product_ids?: string[]
  collection_ids?: string[]
  /** Exclusions — always product ids, emitted as per-id `ne` target rules. */
  excluded_product_ids?: string[]
  /** Woodright default is draft; active only for «Создать и включить». */
  status: "draft" | "active"
  campaign_id?: string | null
  /** Inline campaign creation (nested payload) — smoke-pending, optional. */
  campaign?: {
    name: string
    campaign_identifier: string
    starts_at?: string | null
    ends_at?: string | null
  } | null
}

export type PromotionRulePayload = {
  attribute: string
  operator: "in" | "eq" | "ne"
  values: string[]
}

export type CreatePromotionPayload = {
  code: string
  type: "standard"
  status: "draft" | "active"
  is_automatic: boolean
  campaign_id?: string
  campaign?: {
    name: string
    campaign_identifier: string
    starts_at?: string
    ends_at?: string
  }
  application_method: {
    type: "percentage" | "fixed"
    value: number
    currency_code?: string
    target_type: "order" | "items"
    allocation?: "across"
    target_rules?: PromotionRulePayload[]
  }
  rules?: PromotionRulePayload[]
}

export type BuildPayloadResult =
  | { ok: true; payload: CreatePromotionPayload }
  | { ok: false; errors: string[] }

const CODE_PATTERN = /^[A-Za-z0-9_-]{2,64}$/

function dedupe(list: string[] | undefined | null): string[] {
  return [...new Set((list ?? []).map((v) => v.trim()).filter(Boolean))]
}

export function buildCreatePromotionPayload(
  values: PromotionWizardValues
): BuildPayloadResult {
  const errors: string[] = []

  // Preserve operator casing — Medusa does not document forced uppercase.
  const code = values.code.trim()
  if (!code) {
    errors.push("Укажите код акции - он обязателен даже для автоматических акций")
  } else if (!CODE_PATTERN.test(code)) {
    errors.push("Код: латинские буквы, цифры, дефис и подчёркивание, от 2 до 64 символов")
  }

  let value: number | null = null
  let currency: string | null = null
  if (values.kind === "percentage") {
    const p = values.percent
    if (p == null || !Number.isFinite(p)) {
      errors.push("Укажите процент скидки")
    } else if (p <= 0 || p > 100) {
      errors.push("Процент должен быть больше 0 и не больше 100")
    } else {
      value = p
    }
  } else if (values.kind === "fixed") {
    const a = values.amount
    if (a == null || !Number.isFinite(a)) {
      errors.push("Укажите сумму скидки в рублях")
    } else if (!Number.isInteger(a) || a <= 0) {
      errors.push("Сумма скидки - целое число рублей больше нуля")
    } else {
      value = a
    }
    currency = (values.currency_code ?? "rub").trim().toLowerCase()
    if (!currency) {
      errors.push("Для фиксированной скидки нужна валюта")
      currency = null
    }
  } else {
    errors.push("Этот вид скидки пока настраивается в общем разделе акций")
  }

  const productIds = dedupe(values.product_ids)
  const collectionIds = dedupe(values.collection_ids)
  const excludedIds = dedupe(values.excluded_product_ids)

  if (values.scope === "products" && !productIds.length) {
    errors.push("Выберите хотя бы один товар")
  }
  if (values.scope === "collections" && !collectionIds.length) {
    errors.push("Выберите хотя бы одну коллекцию")
  }
  if (values.scope === "order" && excludedIds.length) {
    errors.push("Исключения товаров доступны только для акций на товары или коллекции")
  }
  if (values.scope === "products") {
    const conflict = excludedIds.filter((id) => productIds.includes(id))
    if (conflict.length) {
      errors.push("Один и тот же товар нельзя и выбрать, и исключить")
    }
  }

  if (values.campaign_id && values.campaign) {
    errors.push("Выберите существующую кампанию или создайте новую - но не обе сразу")
  }
  if (values.campaign) {
    errors.push(
      "Создание кампании вместе с акцией пока недоступно — создайте кампанию в разделе «Кампании» и выберите её"
    )
  }

  if (errors.length) return { ok: false, errors }

  const targetRules: PromotionRulePayload[] = []
  if (values.scope === "products") {
    targetRules.push({ attribute: "items.product.id", operator: "in", values: productIds })
  }
  if (values.scope === "collections") {
    targetRules.push({
      attribute: "items.product.collection_id",
      operator: "in",
      values: collectionIds,
    })
  }
  // Exclusions: one `ne` rule per id. Rules are AND-ed by the promotion
  // module, so per-id rules give proven "not this product" semantics without
  // relying on unverified multi-value `ne` behavior.
  for (const id of excludedIds) {
    targetRules.push({ attribute: "items.product.id", operator: "ne", values: [id] })
  }

  const isItems = values.scope !== "order"
  const payload: CreatePromotionPayload = {
    code,
    type: "standard",
    status: values.status,
    is_automatic: values.trigger === "automatic",
    application_method: {
      type: values.kind,
      value: value as number,
      target_type: isItems ? "items" : "order",
      // `items` target requires allocation; `across` needs no max_quantity.
      ...(isItems ? { allocation: "across" as const } : {}),
      ...(currency ? { currency_code: currency } : {}),
      ...(targetRules.length ? { target_rules: targetRules } : {}),
    },
  }

  if (currency) {
    // Fixed discounts are currency-bound: mirror the currency as a condition
    // rule so the promotion never applies to carts in another currency.
    payload.rules = [{ attribute: "currency_code", operator: "eq", values: [currency] }]
  }

  if (values.campaign_id) payload.campaign_id = values.campaign_id

  return { ok: true, payload }
}

/** Slug helper for inline campaign identifiers. */
export function campaignIdentifierFromName(name: string): string {
  const translit: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
    и: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
    с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch",
    ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  }
  const slug = name
    .toLowerCase()
    .split("")
    .map((ch) => translit[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
  return slug || "campaign"
}
