const AUDIT_FIELDS = new Set([
  "customer_id",
  "assignee_id",
  "match_status",
  "role",
  "company_id",
  "counterparty_lead_id",
  "follow_up_id",
  "note_id",
  "kind",
  "status",
  "entity_type",
  "content_changed",
])

/** Allowlist of ids and statuses. Note text, phones, and emails are not fields here. */
export function auditSnapshot(input: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!input) return null
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (!AUDIT_FIELDS.has(key)) continue
    if (value == null || typeof value === "number" || typeof value === "boolean") {
      out[key] = value
      continue
    }
    if (typeof value === "string" && value.length <= 80 && !value.includes("@")) out[key] = value
  }
  return out
}
