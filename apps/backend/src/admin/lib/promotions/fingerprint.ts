import type { AdminPromotionDto, AdminPromotionRuleDto } from "./types.ts"
import { ruleValueStrings } from "./types.ts"

/**
 * Package E — stale edit protection.
 * The edit form captures a fingerprint of the fields it is allowed to change;
 * before saving, the UI refetches the promotion and refuses to write when the
 * fingerprint differs (someone edited concurrently). Fail-closed by design:
 * missing data widens the fingerprint instead of narrowing it.
 */

function ruleKey(rule: AdminPromotionRuleDto): string {
  const attr = (rule.attribute ?? "").trim()
  const op = (rule.operator ?? "").trim().toLowerCase()
  const values = ruleValueStrings(rule).slice().sort().join("|")
  return `${attr}:${op}:${values}`
}

function sortedRuleKeys(rules: AdminPromotionRuleDto[] | null | undefined): string[] {
  return (rules ?? []).map(ruleKey).sort()
}

export function buildPromotionFingerprint(promotion: AdminPromotionDto): string {
  const method = promotion.application_method
  const parts = {
    id: promotion.id,
    updated_at: promotion.updated_at ?? null,
    status: (promotion.status ?? "").trim().toLowerCase() || null,
    code: promotion.code ?? null,
    is_automatic: promotion.is_automatic ?? null,
    type: (promotion.type ?? "").trim().toLowerCase() || null,
    campaign_id: promotion.campaign_id ?? promotion.campaign?.id ?? null,
    method: method
      ? {
          type: (method.type ?? "").trim().toLowerCase() || null,
          value: method.value ?? null,
          currency_code: (method.currency_code ?? "").trim().toLowerCase() || null,
          target_type: (method.target_type ?? "").trim().toLowerCase() || null,
          allocation: (method.allocation ?? "").trim().toLowerCase() || null,
          max_quantity: method.max_quantity ?? null,
          target_rules: sortedRuleKeys(method.target_rules),
          buy_rules: sortedRuleKeys(method.buy_rules),
        }
      : null,
    rules: sortedRuleKeys(promotion.rules),
  }
  return JSON.stringify(parts)
}

export type StaleCheckResult =
  | { stale: false }
  | { stale: true; reason: string }

export function checkPromotionStale(
  originalFingerprint: string,
  current: AdminPromotionDto
): StaleCheckResult {
  const currentFingerprint = buildPromotionFingerprint(current)
  if (originalFingerprint === currentFingerprint) return { stale: false }
  return {
    stale: true,
    reason:
      "Акцию изменили, пока вы редактировали - обновите страницу и внесите правки заново",
  }
}
