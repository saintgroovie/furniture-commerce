import type { AdminCampaignDto, AdminPromotionDto } from "./types.ts"

/**
 * Package E — human promotion status view model.
 * Combines raw promotion status with campaign dates/budget into an honest
 * operator label. There is no dedicated activate endpoint in 2.13.3; the raw
 * field is `status: draft | active | inactive`.
 */

export type PromotionStatusKind =
  | "draft"
  | "inactive"
  | "active"
  | "scheduled"
  | "expired"
  | "budget_exhausted"
  | "usage_exhausted"
  | "invalid"
  | "unknown"

export type PromotionStatusVM = {
  kind: PromotionStatusKind
  label: string
  /** Russian explanation for the operator; null when the label is enough. */
  reason: string | null
  tone: "green" | "orange" | "red" | "grey" | "blue"
  /** True when the promotion can currently discount carts. */
  effectively_active: boolean
  /** Statuses the operator should review (list filter «Требует внимания»). */
  needs_attention: boolean
}

const LABELS: Record<PromotionStatusKind, string> = {
  draft: "Черновик",
  inactive: "Выключена",
  active: "Действует",
  scheduled: "Запланирована",
  expired: "Завершена",
  budget_exhausted: "Бюджет исчерпан",
  usage_exhausted: "Лимит применений исчерпан",
  invalid: "Ошибка настройки",
  unknown: "Статус не определён",
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function make(
  kind: PromotionStatusKind,
  reason: string | null,
  overrides?: Partial<Pick<PromotionStatusVM, "effectively_active">>
): PromotionStatusVM {
  const tone: PromotionStatusVM["tone"] =
    kind === "active"
      ? "green"
      : kind === "scheduled"
        ? "blue"
        : kind === "expired" || kind === "inactive" || kind === "draft"
          ? "grey"
          : kind === "invalid" || kind === "unknown"
            ? "red"
            : "orange"
  return {
    kind,
    label: LABELS[kind],
    reason,
    tone,
    effectively_active: overrides?.effectively_active ?? kind === "active",
    needs_attention:
      kind === "invalid" ||
      kind === "unknown" ||
      kind === "budget_exhausted" ||
      kind === "usage_exhausted",
  }
}

export function buildPromotionStatusVM(input: {
  promotion: Pick<AdminPromotionDto, "status" | "campaign"> & { campaign?: AdminCampaignDto | null }
  now?: Date
}): PromotionStatusVM {
  const now = input.now ?? new Date()
  const rawStatus = (input.promotion.status ?? "").trim().toLowerCase()
  const campaign = input.promotion.campaign ?? null

  if (rawStatus !== "draft" && rawStatus !== "active" && rawStatus !== "inactive") {
    return make(
      "unknown",
      rawStatus
        ? `Система вернула неизвестный статус «${rawStatus}» - проверьте акцию в стандартной админке`
        : "Система не вернула статус акции - проверьте её в стандартной админке"
    )
  }

  if (rawStatus === "draft") {
    return make("draft", "Акция ещё не запускалась и не влияет на корзины")
  }
  if (rawStatus === "inactive") {
    return make("inactive", "Акцию выключили - покупатели её не видят")
  }

  // rawStatus === "active": campaign window and budget can still block it.
  const starts = parseDate(campaign?.starts_at)
  const ends = parseDate(campaign?.ends_at)

  if (starts && ends && ends.getTime() < starts.getTime()) {
    return make(
      "invalid",
      "У кампании дата окончания раньше даты начала - исправьте период кампании"
    )
  }
  if (ends && ends.getTime() < now.getTime()) {
    return make("expired", `Кампания закончилась ${ends.toLocaleDateString("ru-RU")}`)
  }
  if (starts && starts.getTime() > now.getTime()) {
    return make(
      "scheduled",
      `Включится ${starts.toLocaleDateString("ru-RU")} вместе с кампанией`
    )
  }

  const budget = campaign?.budget ?? null
  if (budget && typeof budget.limit === "number" && typeof budget.used === "number") {
    const type = (budget.type ?? "").trim().toLowerCase()
    if (budget.used >= budget.limit) {
      if (type === "usage") {
        return make(
          "usage_exhausted",
          `Использовано ${budget.used} из ${budget.limit} применений - акция больше не срабатывает`
        )
      }
      if (type === "spend") {
        return make(
          "budget_exhausted",
          `Бюджет кампании израсходован (${budget.used} из ${budget.limit}) - акция больше не срабатывает`
        )
      }
      return make(
        "budget_exhausted",
        "Лимит бюджета кампании исчерпан - акция больше не срабатывает"
      )
    }
  }

  return make("active", null)
}
