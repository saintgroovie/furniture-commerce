/**
 * Designer is a role on a Person, not a second customer.
 * Orders stay Medusa orders; this check only looks at ids.
 */
export function assessDesignerScenario(input: {
  designer: { id: string; roles: string[]; company_ids: string[] }
  company: { id: string }
  end_customer: { id: string }
  request: { lead_id: string; company_id: string | null; counterparty_lead_id: string | null }
  order_ids: string[]
}): { ok: true } | { ok: false; reason: string } {
  if (input.designer.id === input.end_customer.id) return { ok: false, reason: "same_person" }
  if (!input.designer.roles.includes("designer")) return { ok: false, reason: "designer_role" }
  if (!input.designer.company_ids.includes(input.company.id)) return { ok: false, reason: "designer_company" }
  if (input.request.company_id !== input.company.id) return { ok: false, reason: "request_company" }
  const parties = new Set(
    [input.request.lead_id, input.request.counterparty_lead_id].filter((id): id is string => Boolean(id))
  )
  if (!parties.has(input.designer.id) || !parties.has(input.end_customer.id)) {
    return { ok: false, reason: "parties" }
  }
  if (input.order_ids.some((id) => !id || id.includes(" "))) return { ok: false, reason: "order_id" }
  return { ok: true }
}
