/**
 * Package E — Promotion DTOs consumed by Woodright Admin UI.
 * Shapes mirror Medusa 2.13.3 Admin REST responses (see
 * docs/admin-ux-recovery/package-e-promotion-contract.md). All fields optional
 * unless the API guarantees them: the UI must fail closed on missing data.
 */

export type PromotionStatusRaw = "draft" | "active" | "inactive"
export type PromotionTypeRaw = "standard" | "buyget"
export type ApplicationMethodTypeRaw = "fixed" | "percentage"
export type ApplicationMethodTargetTypeRaw = "order" | "shipping_methods" | "items"
export type ApplicationMethodAllocationRaw = "each" | "across" | "once"
export type RuleOperatorRaw = "gte" | "lte" | "gt" | "lt" | "eq" | "ne" | "in"
export type CampaignBudgetTypeRaw =
  | "spend"
  | "usage"
  | "use_by_attribute"
  | "spend_by_attribute"

export type AdminRuleValueDto = {
  id?: string
  value?: string | null
  label?: string | null
}

export type AdminPromotionRuleDto = {
  id?: string
  attribute?: string | null
  operator?: string | null
  values?: Array<AdminRuleValueDto | string> | null
}

export type AdminApplicationMethodDto = {
  id?: string
  type?: string | null
  value?: number | string | null
  currency_code?: string | null
  target_type?: string | null
  allocation?: string | null
  max_quantity?: number | null
  apply_to_quantity?: number | null
  buy_rules_min_quantity?: number | null
  target_rules?: AdminPromotionRuleDto[] | null
  buy_rules?: AdminPromotionRuleDto[] | null
}

export type AdminCampaignBudgetDto = {
  id?: string
  type?: string | null
  currency_code?: string | null
  limit?: number | null
  used?: number | null
}

export type AdminCampaignDto = {
  id: string
  name?: string | null
  campaign_identifier?: string | null
  description?: string | null
  starts_at?: string | null
  ends_at?: string | null
  budget?: AdminCampaignBudgetDto | null
}

export type AdminPromotionDto = {
  id: string
  code?: string | null
  is_automatic?: boolean | null
  type?: string | null
  status?: string | null
  created_at?: string | null
  updated_at?: string | null
  campaign_id?: string | null
  campaign?: AdminCampaignDto | null
  application_method?: AdminApplicationMethodDto | null
  rules?: AdminPromotionRuleDto[] | null
}

/** Normalized rule values regardless of object/string payload shape. */
export function ruleValueStrings(rule: AdminPromotionRuleDto | null | undefined): string[] {
  if (!rule?.values) return []
  const out: string[] = []
  for (const v of rule.values) {
    if (typeof v === "string") {
      if (v.trim()) out.push(v.trim())
    } else if (v && typeof v.value === "string" && v.value.trim()) {
      out.push(v.value.trim())
    }
  }
  return out
}

/** Human labels when the API embedded them; falls back to raw values. */
export function ruleValueLabels(rule: AdminPromotionRuleDto | null | undefined): string[] {
  if (!rule?.values) return []
  const out: string[] = []
  for (const v of rule.values) {
    if (typeof v === "string") {
      if (v.trim()) out.push(v.trim())
    } else if (v) {
      const label = typeof v.label === "string" && v.label.trim() ? v.label.trim() : null
      const value = typeof v.value === "string" && v.value.trim() ? v.value.trim() : null
      const pick = label ?? value
      if (pick) out.push(pick)
    }
  }
  return out
}
