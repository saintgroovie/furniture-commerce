import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { decideInbox } from "../../../../../../lib/woodright-mail/inbox-state"
import { mailConnectorEnabled } from "../../../../../../lib/woodright-workspace/mail-boundary"
import { requireDeskWrite } from "../../../../../../lib/woodright-workspace/require-desk-write"
import { COMMUNICATION_MODULE } from "../../../../../../modules/communication"

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const gate = await requireDeskWrite(req, res, "mail.view")
  if (!gate) return
  const id = req.params.id as string
  try {
    const service = req.scope.resolve(COMMUNICATION_MODULE) as {
      listMailConnections: (filters: object, config?: object) => Promise<Array<Record<string, unknown>>>
      listCommThreads: (filters: object, config?: object) => Promise<Array<Record<string, unknown>>>
      listCommMessages: (filters: object, config?: object) => Promise<Array<Record<string, unknown>>>
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
    const threads = await service.listCommThreads({ id }, { take: 1 })
    const thread = threads[0]
    if (!thread) {
      res.status(404).json({ message: "Переписка не найдена" })
      return
    }
    const messages = (await service.listCommMessages({ thread_id: id }, { take: 50, order: { occurred_at: "DESC" } })).reverse()
    res.json({
      thread: {
        id: String(thread.id),
        subject: text(thread.subject),
        status: text(thread.status) ?? "open",
        waiting_on: text(thread.waiting_on) ?? "us",
        assignee_id: text(thread.assignee_id),
        lead_id: text(thread.lead_id),
        company_id: text(thread.company_id),
        request_id: text(thread.request_id),
        order_id: text(thread.order_id),
        mailbox: text(thread.mailbox),
      },
      messages: messages.map((row) => ({
        id: String(row.id),
        direction: text(row.direction),
        sender: text(row.sender),
        occurred_at: row.occurred_at instanceof Date ? row.occurred_at.toISOString() : text(row.occurred_at),
        content_state: text(row.content_state) ?? "metadata_only",
      })),
    })
  } catch {
    res.status(503).json({ message: "Почта временно недоступна" })
  }
}
