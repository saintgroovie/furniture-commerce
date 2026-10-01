import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { COMPANY_TYPE_LABEL, isCompanyType, type CompanyType } from "../../../../lib/woodright-crm/constants"
import { requireDeskWrite } from "../../../../lib/woodright-workspace/require-desk-write"
import { CRM_MODULE } from "../../../../modules/crm"

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const gate = await requireDeskWrite(req, res, "crm.view")
  if (!gate) return
  let service: {
    listCompanies: (filters: object, config?: object) => Promise<Array<Record<string, unknown>>>
    listPersonCompanies: (filters: object, config?: object) => Promise<Array<Record<string, unknown>>>
  }
  try {
    service = req.scope.resolve(CRM_MODULE)
  } catch {
    res.status(503).json({ code: "crm_unavailable", message: "Компании ещё не включены в базе" })
    return
  }
  try {
    const [companies, links] = await Promise.all([
      service.listCompanies({}, { order: { name: "ASC" }, take: 100 }),
      service.listPersonCompanies({}, { take: 500 }),
    ])
    const counts = new Map<string, number>()
    for (const link of links) {
      const id = text(link.company_id)
      if (!id) continue
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    res.json({
      companies: companies.map((row) => {
        const type = text(row.type) as CompanyType | null
        return {
          id: String(row.id),
          name: text(row.name) ?? "Без названия",
          type,
          type_label: type && type in COMPANY_TYPE_LABEL ? COMPANY_TYPE_LABEL[type] : null,
          people_count: counts.get(String(row.id)) ?? 0,
        }
      }),
    })
  } catch {
    res.status(503).json({ code: "crm_unavailable", message: "Компании ещё не включены в базе" })
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const gate = await requireDeskWrite(req, res, "crm.edit")
  if (!gate) return
  const body = (req.body ?? {}) as { name?: string; type?: string | null; internal_note?: string | null }
  const name = body.name?.trim() ?? ""
  if (!name) {
    res.status(400).json({ message: "Укажите название компании" })
    return
  }
  let service: {
    createCompanies: (data: object) => Promise<Record<string, unknown> | Array<Record<string, unknown>>>
  }
  try {
    service = req.scope.resolve(CRM_MODULE)
  } catch {
    res.status(503).json({ code: "crm_unavailable", message: "Компании ещё не включены в базе" })
    return
  }
  try {
    const created = await service.createCompanies({
      name: name.slice(0, 160),
      type: body.type && isCompanyType(body.type) ? body.type : null,
      internal_note: body.internal_note?.trim().slice(0, 500) || null,
    })
    const row = Array.isArray(created) ? created[0] : created
    res.json({ ok: true, id: row?.id ? String(row.id) : null })
  } catch {
    res.status(503).json({ code: "crm_unavailable", message: "Компания не сохранилась" })
  }
}
