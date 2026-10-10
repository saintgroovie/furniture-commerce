import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { decideInbox, THREAD_LIST_LIMIT, threadListFilters, threadRecency, type MailView } from "../../../../../lib/woodright-mail/inbox-state"
import { mailConnectorEnabled } from "../../../../../lib/woodright-workspace/mail-boundary"
import { requireDeskWrite } from "../../../../../lib/woodright-workspace/require-desk-write"
import { COMMUNICATION_MODULE } from "../../../../../modules/communication"

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

const VIEWS = new Set<MailView>(["needs_reply", "mine", "unassigned", "waiting", "closed"])

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const gate = await requireDeskWrite(req, res, "mail.view")
  if (!gate) return
  const requested = text(req.query?.view)
  const view: MailView = requested && VIEWS.has(requested as MailView) ? (requested as MailView) : "needs_reply"
  try {
    const service = req.scope.resolve(COMMUNICATION_MODULE) as {
      listMailConnections: (filters: object, config?: object) => Promise<Array<Record<string, unknown>>>
      listCommThreads: (filters: object, config?: object) => Promise<Array<Record<string, unknown>>>
    }
    const connections = await service.listMailConnections({}, { take: 1 })
    const connectionStatus = text(connections?.[0]?.status)
    const decision = decideInbox({
      connectionStatus: connectionStatus === "configured" || connectionStatus === "disabled" || connectionStatus === "error" ? connectionStatus : null,
      permitted: true,
      liveConnector: mailConnectorEnabled(),
    })
    if (!decision.visible) {
      res.status(409).json({ message: "Почта не подключена" })
      return
    }
    const filters = threadListFilters(view, gate.actorId)
    const batches = await Promise.all(
      filters.map((filter) => service.listCommThreads(filter, { take: THREAD_LIST_LIMIT, order: { last_message_at: "DESC" } }))
    )
    const seen = new Set<string>()
    const rows = batches
      .flat()
      .filter((row) => {
        const id = String(row.id)
        if (seen.has(id)) return false
        seen.add(id)
        return true
      })
      .sort((a, b) => threadRecency(b.last_message_at).localeCompare(threadRecency(a.last_message_at)))
    const truncated = batches.some((batch) => batch.length >= THREAD_LIST_LIMIT) || rows.length > THREAD_LIST_LIMIT
    const threads = rows.slice(0, THREAD_LIST_LIMIT).map((row) => ({
      id: String(row.id),
      subject: text(row.subject),
      status: text(row.status) ?? "open",
      waiting_on: text(row.waiting_on) ?? "us",
      assignee_id: text(row.assignee_id),
      lead_id: text(row.lead_id),
      company_id: text(row.company_id),
      request_id: text(row.request_id),
      order_id: text(row.order_id),
      mailbox: text(row.mailbox),
      last_message_at: row.last_message_at instanceof Date ? row.last_message_at.toISOString() : text(row.last_message_at),
    }))
    res.json({ threads, truncated })
  } catch {
    res.status(503).json({ message: "Почта временно недоступна" })
  }
}
