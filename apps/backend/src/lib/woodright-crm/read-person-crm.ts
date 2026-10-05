import { COMPANY_TYPE_LABEL, PERSON_ROLE_LABEL, type CompanyType, type PersonRole } from "./constants"

type Row = Record<string, unknown>

export type CrmReader = {
  listPersonRoleRows: (filters: object) => Promise<Row[]>
  listPersonCompanies: (filters: object) => Promise<Row[]>
  listCompanies: (filters: object, config?: object) => Promise<Row[]>
  listPersonNotes: (filters: object, config?: object) => Promise<Row[]>
  listFollowUps: (filters: object, config?: object) => Promise<Row[]>
  listRequestOrders: (filters: object) => Promise<Row[]>
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function time(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString()
  return text(value)
}

export async function readPersonCrm(crm: CrmReader, leadId: string, requestIds: string[]) {
  const [roles, memberships, notes, personFollowUps] = await Promise.all([
    crm.listPersonRoleRows({ lead_id: leadId }),
    crm.listPersonCompanies({ lead_id: leadId }),
    crm.listPersonNotes({ lead_id: leadId }, { order: { created_at: "DESC" }, take: 40 }),
    crm.listFollowUps({ entity_type: "person", entity_id: leadId }, { take: 50, order: { due_at: "ASC" } }),
  ])
  const requestFollowUps: Row[] = []
  let followUpsTruncated = personFollowUps.length >= 50
  for (const requestId of requestIds.slice(0, 20)) {
    const rows = await crm.listFollowUps({ entity_type: "request", entity_id: requestId }, { take: 20, order: { due_at: "ASC" } })
    if (rows.length >= 20) followUpsTruncated = true
    requestFollowUps.push(...rows)
  }
  const followUps = [...personFollowUps, ...requestFollowUps]
  const companyIds = [...new Set(memberships.map((row) => text(row.company_id)).filter((id): id is string => Boolean(id)))]
  const linkedAt = new Map(memberships.map((row) => [text(row.company_id), time(row.created_at)]))
  const companyRows = companyIds.length > 0 ? await crm.listCompanies({}, { take: 200 }) : []
  const companies = companyRows.filter((row) => companyIds.includes(String(row.id)))
  const requestOrders: Row[] = []
  for (const requestId of requestIds) {
    const rows = await crm.listRequestOrders({ request_id: requestId })
    requestOrders.push(...rows)
  }
  const relevantFollowUps = followUps.filter((row) => {
    const type = text(row.entity_type)
    const id = text(row.entity_id)
    if (type === "person" && id === leadId) return true
    if (type === "request" && id && requestIds.includes(id)) return true
    return false
  })
  return {
    roles: roles.map((row) => {
      const role = text(row.role) as PersonRole | null
      return {
        id: String(row.id),
        role,
        label: role && role in PERSON_ROLE_LABEL ? PERSON_ROLE_LABEL[role] : role,
      }
    }),
    companies: companies.map((row) => {
      const type = text(row.type) as CompanyType | null
      return {
        id: String(row.id),
        name: text(row.name) ?? "Без названия",
        type,
        type_label: type && type in COMPANY_TYPE_LABEL ? COMPANY_TYPE_LABEL[type] : null,
        linked_at: linkedAt.get(String(row.id)) ?? null,
      }
    }),
    notes: notes.map((row) => ({
      id: String(row.id),
      body: text(row.body) ?? "",
      kind: text(row.kind) ?? "note",
      created_at: time(row.created_at),
    })),
    follow_ups: relevantFollowUps.map((row) => ({
      id: String(row.id),
      entity_type: text(row.entity_type),
      entity_id: text(row.entity_id),
      assignee_id: text(row.assignee_id),
      due_at: time(row.due_at),
      summary: text(row.summary) ?? "",
      status: text(row.status) ?? "open",
    })),
    request_orders: requestOrders.map((row) => ({
      id: String(row.id),
      request_id: text(row.request_id),
      order_id: text(row.order_id),
    })),
    follow_ups_truncated: followUpsTruncated || requestIds.length > 20,
  }
}
