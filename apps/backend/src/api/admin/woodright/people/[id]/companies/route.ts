import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { isCompanyType } from "../../../../../../lib/woodright-crm/constants"
import { recordCrmAudit } from "../../../../../../lib/woodright-crm/record"
import { requireDeskWrite } from "../../../../../../lib/woodright-workspace/require-desk-write"
import { CRM_MODULE } from "../../../../../../modules/crm"

type Body = {
  company_id?: string | null
  name?: string
  type?: string | null
  unlink?: boolean
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const gate = await requireDeskWrite(req, res, "crm.edit")
  if (!gate) return
  const leadId = req.params.id as string
  const body = (req.body ?? {}) as Body
  let service: {
    listCompanies: (filters: object) => Promise<Array<Record<string, unknown>>>
    createCompanies: (data: object) => Promise<Record<string, unknown> | Array<Record<string, unknown>>>
    listPersonCompanies: (filters: object) => Promise<Array<Record<string, unknown>>>
    createPersonCompanies: (data: object) => Promise<unknown>
    deletePersonCompanies: (ids: string[]) => Promise<unknown>
  }
  try {
    service = req.scope.resolve(CRM_MODULE)
  } catch {
    res.status(503).json({ code: "crm_unavailable", message: "Компании ещё не включены в базе" })
    return
  }
  try {
    let companyId = body.company_id?.trim() || ""
    if (!companyId && body.name?.trim()) {
      const type = body.type && isCompanyType(body.type) ? body.type : null
      const created = await service.createCompanies({ name: body.name.trim().slice(0, 160), type })
      const row = Array.isArray(created) ? created[0] : created
      companyId = row?.id ? String(row.id) : ""
    }
    if (!companyId) {
      res.status(400).json({ message: "Укажите компанию" })
      return
    }
    const existing = await service.listPersonCompanies({ lead_id: leadId, company_id: companyId })
    const current = existing?.[0]
    if (body.unlink) {
      if (current) await service.deletePersonCompanies([String(current.id)])
      await recordCrmAudit(req, {
        actorId: gate.actorId,
        actorEmail: gate.email,
        entityType: "person",
        entityId: leadId,
        action: "company_unlinked",
        after: { company_id: companyId },
      })
      res.json({ ok: true, company_id: companyId, linked: false })
      return
    }
    if (!current) await service.createPersonCompanies({ lead_id: leadId, company_id: companyId })
    await recordCrmAudit(req, {
      actorId: gate.actorId,
      actorEmail: gate.email,
      entityType: "person",
      entityId: leadId,
      action: "company_linked",
      after: { company_id: companyId },
    })
    res.json({ ok: true, company_id: companyId, linked: true })
  } catch {
    res.status(503).json({ code: "crm_unavailable", message: "Компания не сохранилась" })
  }
}
