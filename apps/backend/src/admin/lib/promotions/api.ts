import type { AdminCampaignDto, AdminPromotionDto } from "./types.ts"
import type { CreatePromotionPayload } from "./payload.ts"

/**
 * Package E — Admin API fetch helpers (relative paths, session cookies).
 * Same union convention as product-workspace/admin-api.ts:
 * success payload | { status, body } for the error normalizer.
 */

const PROMOTION_FIELDS = [
  "id",
  "code",
  "is_automatic",
  "type",
  "status",
  "created_at",
  "updated_at",
  "campaign_id",
  "*campaign",
  "*campaign.budget",
  "*application_method",
  "*application_method.target_rules",
  "*application_method.target_rules.values",
  "*application_method.buy_rules",
  "*application_method.buy_rules.values",
  "*rules",
  "*rules.values",
].join(",")

type ApiFailure = { status: number; body: unknown }

function jsonHeaders(init?: RequestInit): HeadersInit {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(init?.headers ?? {}),
  }
}

export async function fetchAdminPromotions(
  params?: {
    q?: string
    campaign_id?: string
    limit?: number
    offset?: number
  },
  init?: RequestInit
): Promise<{ promotions: AdminPromotionDto[]; count: number } | ApiFailure> {
  const search = new URLSearchParams()
  search.set("fields", PROMOTION_FIELDS)
  search.set("limit", String(params?.limit ?? 50))
  search.set("offset", String(params?.offset ?? 0))
  if (params?.q?.trim()) search.set("q", params.q.trim())
  if (params?.campaign_id) search.set("campaign_id", params.campaign_id)

  const res = await fetch(`/admin/promotions?${search.toString()}`, {
    credentials: "include",
    ...init,
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return { status: res.status, body }
  const parsed = body as { promotions?: AdminPromotionDto[]; count?: number }
  return { promotions: parsed.promotions ?? [], count: parsed.count ?? 0 }
}

export async function fetchAdminPromotion(
  idOrCode: string,
  init?: RequestInit
): Promise<{ promotion: AdminPromotionDto } | ApiFailure> {
  const res = await fetch(
    `/admin/promotions/${encodeURIComponent(idOrCode)}?fields=${encodeURIComponent(PROMOTION_FIELDS)}`,
    {
      credentials: "include",
      ...init,
      headers: { Accept: "application/json", ...(init?.headers ?? {}) },
    }
  )
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return { status: res.status, body }
  return { promotion: (body as { promotion: AdminPromotionDto }).promotion }
}

export async function createAdminPromotion(
  payload: CreatePromotionPayload,
  init?: RequestInit
): Promise<{ promotion: AdminPromotionDto } | ApiFailure> {
  const res = await fetch("/admin/promotions", {
    method: "POST",
    credentials: "include",
    ...init,
    headers: jsonHeaders(init),
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return { status: res.status, body }
  return { promotion: (body as { promotion: AdminPromotionDto }).promotion }
}

/**
 * Update — Woodright uses it for reversible status changes
 * (disable → `inactive`, enable → `active`) and simple value edits.
 * Delete stays in the stock Admin on purpose.
 */
export async function updateAdminPromotion(
  promotionId: string,
  payload: {
    status?: "draft" | "active" | "inactive"
    code?: string
    application_method?: { value?: number }
  },
  init?: RequestInit
): Promise<{ promotion: AdminPromotionDto } | ApiFailure> {
  const res = await fetch(`/admin/promotions/${encodeURIComponent(promotionId)}`, {
    method: "POST",
    credentials: "include",
    ...init,
    headers: jsonHeaders(init),
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return { status: res.status, body }
  return { promotion: (body as { promotion: AdminPromotionDto }).promotion }
}

export async function fetchAdminCampaigns(
  params?: { q?: string; limit?: number; offset?: number },
  init?: RequestInit
): Promise<{ campaigns: AdminCampaignDto[]; count: number } | ApiFailure> {
  const search = new URLSearchParams()
  search.set("fields", "id,name,campaign_identifier,starts_at,ends_at,*budget")
  search.set("limit", String(params?.limit ?? 50))
  search.set("offset", String(params?.offset ?? 0))
  if (params?.q?.trim()) search.set("q", params.q.trim())

  const res = await fetch(`/admin/campaigns?${search.toString()}`, {
    credentials: "include",
    ...init,
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return { status: res.status, body }
  const parsed = body as { campaigns?: AdminCampaignDto[]; count?: number }
  return { campaigns: parsed.campaigns ?? [], count: parsed.count ?? 0 }
}

export type RuleValueOption = { label?: string | null; value?: string | null }

/**
 * Searchable value catalog for a rule attribute, e.g.
 * rule-value-options/target-rules/items.product.id?q=стол
 */
export async function fetchRuleValueOptions(
  ruleType: "rules" | "target-rules" | "buy-rules",
  ruleAttributeId: string,
  params?: { q?: string; limit?: number },
  init?: RequestInit
): Promise<{ values: RuleValueOption[] } | ApiFailure> {
  const search = new URLSearchParams()
  search.set("limit", String(params?.limit ?? 20))
  if (params?.q?.trim()) search.set("q", params.q.trim())

  const res = await fetch(
    `/admin/promotions/rule-value-options/${ruleType}/${encodeURIComponent(ruleAttributeId)}?${search.toString()}`,
    {
      credentials: "include",
      ...init,
      headers: { Accept: "application/json", ...(init?.headers ?? {}) },
    }
  )
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return { status: res.status, body }
  return { values: (body as { values?: RuleValueOption[] }).values ?? [] }
}

export function stockAdminPromotionsPath(): string {
  return "/app/promotions"
}

export function stockAdminPromotionPath(promotionId: string): string {
  return `/app/promotions/${promotionId}`
}

export function woodrightPromotionsPath(): string {
  return "/app/woodright/promotions"
}

export function woodrightPromotionPath(promotionId: string): string {
  return `/app/woodright/promotions/${promotionId}`
}

export function woodrightPromotionNewPath(params?: { product_id?: string }): string {
  const base = "/app/woodright/promotions/new"
  if (params?.product_id) {
    return `${base}?product_id=${encodeURIComponent(params.product_id)}`
  }
  return base
}
