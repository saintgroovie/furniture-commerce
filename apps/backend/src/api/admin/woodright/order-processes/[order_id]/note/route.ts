import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { randomUUID } from "node:crypto"
import { ORDER_PROCESS_MODULE } from "../../../../../../modules/order-process"
import { requireDeskWrite } from "../../../../../../lib/woodright-workspace/require-desk-write"

type SqlClient = {
  raw: (sql: string, bindings?: unknown[]) => Promise<{ rows?: Array<Record<string, unknown>> }>
  transaction?: <T>(fn: (trx: SqlClient) => Promise<T>) => Promise<T>
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const gate = await requireDeskWrite(req, res, "orders.note.write")
  if (!gate) return
  const orderId = req.params.order_id as string
  const body = (req.body ?? {}) as { internal_note?: unknown; expected_version?: unknown }
  if (typeof body.internal_note !== "string") {
    res.status(400).json({ message: "Напишите текст заметки" })
    return
  }
  if (typeof body.expected_version !== "number" || !Number.isFinite(body.expected_version)) {
    res.status(400).json({ message: "Обновите страницу и повторите" })
    return
  }
  const note = body.internal_note.trim()
  const service = req.scope.resolve(ORDER_PROCESS_MODULE) as {
    listWoodrightOrderProcesses: (filters: object) => Promise<Array<Record<string, unknown>>>
  }
  const rows = await service.listWoodrightOrderProcesses({ order_id: orderId })
  const process = rows?.[0]
  if (!process) {
    res.status(404).json({ message: "Этап изготовления ещё не начат" })
    return
  }
  const stage = text(process.current_stage)
  if (!stage) {
    res.status(409).json({ message: "Этап изготовления ещё не начат" })
    return
  }
  const sql = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as SqlClient
  if (!sql.transaction) {
    res.status(500).json({ message: "Заметку сейчас нельзя сохранить. Повторите" })
    return
  }
  const saved = await sql.transaction(async (trx) => {
    const cas = await trx.raw(
      `update "woodright_order_process"
          set "internal_note" = ?,
              "version" = "version" + 1,
              "updated_at" = now()
        where "id" = ?
          and "version" = ?
          and "deleted_at" is null
        returning "version"`,
      [note || null, process.id, body.expected_version]
    )
    const version = cas.rows?.[0]?.version
    if (version == null) return null
    await trx.raw(
      `insert into "woodright_order_process_event" (
        "id", "process_id", "order_id", "previous_stage", "next_stage",
        "event_type", "actor_type", "actor_id", "actor_display",
        "customer_visible", "customer_message", "internal_note",
        "notification_requested", "notification_result", "source",
        "idempotency_key", "correlation_id", "created_at", "updated_at"
      ) values (
        ?, ?, ?, ?, ?,
        'note_updated', 'admin', ?, ?,
        false, null, ?,
        false, null, 'workspace',
        null, null, now(), now()
      )`,
      [`wrope_${randomUUID().replace(/-/g, "").slice(0, 24)}`, process.id, orderId, stage, stage, gate.actorId, gate.email, note || null]
    )
    return Number(version)
  })
  if (saved == null) {
    res.status(409).json({ message: "Заметку уже изменили. Обновите страницу" })
    return
  }
  res.json({ ok: true, internal_note: note || null, version: saved })
}
