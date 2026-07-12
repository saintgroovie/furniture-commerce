import type { AdminCampaignDto } from "./types.ts"

/**
 * Package E — campaign compatibility helpers.
 * Budget type is immutable after create and `currency_code` is required for
 * `spend` / forbidden for `usage` (2.13.3 contract). These checks run before
 * attaching a promotion to a campaign so the operator sees the conflict in
 * Russian instead of a raw API error.
 */

export type CampaignCompatibilityInput = {
  /** Promotion currency (fixed discounts) — null for percentage. */
  promotion_currency_code?: string | null
  campaign: AdminCampaignDto
  now?: Date
}

export type CampaignCompatibilityResult = {
  ok: boolean
  /** Blocking problems - attaching must be prevented. */
  errors: string[]
  /** Non-blocking warnings the operator should read. */
  warnings: string[]
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function checkCampaignCompatibility(
  input: CampaignCompatibilityInput
): CampaignCompatibilityResult {
  const errors: string[] = []
  const warnings: string[] = []
  const now = input.now ?? new Date()
  const campaign = input.campaign

  const budget = campaign.budget ?? null
  const budgetType = (budget?.type ?? "").trim().toLowerCase()
  if (budget && budgetType === "spend") {
    const budgetCurrency = (budget.currency_code ?? "").trim().toLowerCase()
    const promoCurrency = (input.promotion_currency_code ?? "").trim().toLowerCase()
    if (!budgetCurrency) {
      errors.push(
        "У кампании денежный бюджет без валюты - проверьте кампанию в разделе кампаний"
      )
    } else if (promoCurrency && promoCurrency !== budgetCurrency) {
      errors.push(
        `Валюта акции (${promoCurrency.toUpperCase()}) не совпадает с валютой бюджета кампании (${budgetCurrency.toUpperCase()})`
      )
    }
  }
  if (
    budget &&
    budgetType &&
    budgetType !== "spend" &&
    budgetType !== "usage"
  ) {
    warnings.push(
      "У кампании нестандартный тип бюджета - поведение лимитов проверяйте в разделе кампаний"
    )
  }
  if (budget && typeof budget.limit === "number" && typeof budget.used === "number") {
    if (budget.used >= budget.limit) {
      warnings.push("Бюджет кампании уже исчерпан - акция не будет срабатывать до изменения лимита")
    }
  }

  const starts = parseDate(campaign.starts_at)
  const ends = parseDate(campaign.ends_at)
  if (starts && ends && ends.getTime() < starts.getTime()) {
    errors.push("У кампании дата окончания раньше даты начала")
  } else if (ends && ends.getTime() < now.getTime()) {
    warnings.push(
      `Кампания уже завершилась ${ends.toLocaleDateString("ru-RU")} - акция в ней не будет действовать`
    )
  }

  return { ok: errors.length === 0, errors, warnings }
}

/** One-line campaign description for selects and detail pages. */
export function describeCampaign(campaign: AdminCampaignDto): string {
  const name = campaign.name?.trim() || campaign.campaign_identifier?.trim() || campaign.id
  const parts: string[] = [name]
  const starts = parseDate(campaign.starts_at)
  const ends = parseDate(campaign.ends_at)
  if (starts && ends) {
    parts.push(
      `${starts.toLocaleDateString("ru-RU")} - ${ends.toLocaleDateString("ru-RU")}`
    )
  } else if (starts) {
    parts.push(`с ${starts.toLocaleDateString("ru-RU")}`)
  } else if (ends) {
    parts.push(`до ${ends.toLocaleDateString("ru-RU")}`)
  } else {
    parts.push("без ограничения по датам")
  }
  const budget = campaign.budget
  const budgetType = (budget?.type ?? "").trim().toLowerCase()
  if (budget && typeof budget.limit === "number") {
    if (budgetType === "usage") {
      parts.push(`лимит ${budget.limit} применений`)
    } else if (budgetType === "spend") {
      parts.push(
        `бюджет ${budget.limit} ${(budget.currency_code ?? "").toUpperCase() || "?"}`
      )
    }
  }
  return parts.join(" · ")
}
