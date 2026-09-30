import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { ORDER_PROCESS_MODULE } from "../../../../../../modules/order-process"
import { writeOrderAssignee } from "../../../../../../lib/woodright-workspace/order-assignment"
import { requireDeskWrite } from "../../../../../../lib/woodright-workspace/require-desk-write"

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const gate = await requireDeskWrite(req, res, "orders.process.write")
  if (!gate) return
  const orderId = req.params.order_id as string
  const body = (req.body ?? {}) as { assignee_id?: unknown }
  const assigneeId = body.assignee_id === null ? null : text(body.assignee_id)
  if (body.assignee_id !== null && assigneeId === null) {
    res.status(400).json({ message: "Укажите сотрудника или снимите назначение" })
    return
  }
  let assigneeEmail: string | null = null
  if (assigneeId) {
    try {
      const userModule = req.scope.resolve("user") as {
        retrieveUser: (id: string) => Promise<{ id?: string; email?: string | null }>
      }
      const user = await userModule.retrieveUser(assigneeId)
      if (!user?.id) {
        res.status(400).json({ message: "Такого сотрудника нет" })
        return
      }
      assigneeEmail = user.email ?? assigneeId
    } catch {
      res.status(400).json({ message: "Такого сотрудника нет" })
      return
    }
  }
  try {
    const orderModule = req.scope.resolve(Modules.ORDER) as {
      retrieveOrder: (id: string) => Promise<{ id?: string }>
    }
    const order = await orderModule.retrieveOrder(orderId)
    if (!order?.id) {
      res.status(404).json({ message: "Заказ не найден" })
      return
    }
  } catch {
    res.status(404).json({ message: "Заказ не найден" })
    return
  }
  const saved = await writeOrderAssignee(req, orderId, assigneeId, gate.actorId)
  if (saved !== "ok") {
    res.status(503).json({ message: "Назначение заказа ещё не включено в этой базе" })
    return
  }
  try {
    const service = req.scope.resolve(ORDER_PROCESS_MODULE) as {
      listWoodrightOrderProcesses: (filters: object) => Promise<Array<Record<string, unknown>>>
      createWoodrightOrderProcessEvents: (data: object) => Promise<unknown>
    }
    const process = (await service.listWoodrightOrderProcesses({ order_id: orderId }))?.[0]
    const stage = text(process?.current_stage)
    if (process && stage) {
      await service.createWoodrightOrderProcessEvents({
        process_id: process.id,
        order_id: orderId,
        previous_stage: stage,
        next_stage: stage,
        event_type: "assignee_changed",
        actor_type: "admin",
        actor_id: gate.actorId,
        actor_display: gate.email,
        customer_visible: false,
        internal_note: assigneeId ? `Назначен ${assigneeEmail ?? assigneeId}` : "Назначение снято",
        notification_requested: false,
        source: "workspace",
      })
    }
  } catch {
    // The assignment row is the fact. A missing process must not roll it back.
  }
  res.json({ ok: true, assignee_id: assigneeId })
}
