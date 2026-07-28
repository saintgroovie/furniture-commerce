import {
  buildStageNotificationCopy,
  dispatchFakeNotification,
} from "./fake-notifications"
import { STAGE_BUYER_LABEL, type OrderProcessStage } from "./stages"
import {
  applyProcessTransitionPure,
  type ProcessEventRecord,
  type ProcessRecord,
  type TransitionCommand,
} from "./transition"
import type { OrderProcessServiceLike } from "./ensure-process"
import { asProcessRecord } from "./ensure-process"

type SqlClient = {
  raw: (sql: string, bindings?: unknown[]) => Promise<{ rows?: unknown[] }>
  transaction?: <T>(fn: (trx: SqlClient) => Promise<T>) => Promise<T>
}

function notificationsEnabled(): boolean {
  const v = (process.env.WOODRIGHT_NOTIFICATIONS ?? "fake").toLowerCase()
  return v !== "off" && v !== "0" && v !== "false"
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Persist a validated transition with SQL CAS when knex/pg is provided.
 * Without sqlClient, refuses write (fail-closed concurrency) except pure replay.
 */
export async function applyAndPersistProcessTransition(
  service: OrderProcessServiceLike,
  processRow: ProcessRecord,
  cmd: TransitionCommand,
  opts?: { sql?: SqlClient }
): Promise<
  | {
      ok: true
      process: ProcessRecord
      event?: ProcessEventRecord
      replay?: boolean
    }
  | { ok: false; code: string; message: string; http: 400 | 409 | 500 }
> {
  const existingEvents = await service.listWoodrightOrderProcessEvents({
    process_id: processRow.id,
  })
  const keys = new Set<string>()
  for (const e of existingEvents ?? []) {
    const k = e.idempotency_key
    if (typeof k === "string" && k.trim()) keys.add(k.trim())
  }

  const pure = applyProcessTransitionPure(
    processRow,
    keys,
    cmd,
    {
      event_id: newId("wrope"),
      delivery_ids: [newId("wrnd"), newId("wrnd")],
    }
  )

  if (!pure.ok) {
    return pure
  }

  if (pure.replay) {
    return { ok: true, process: processRow, replay: true }
  }

  const sql = opts?.sql
  if (!sql?.raw) {
    return {
      ok: false,
      code: "CAS_SQL_REQUIRED",
      message:
        "Переход этапа требует SQL CAS (database connection). Обновите backend.",
      http: 500,
    }
  }

  const run = async (client: SqlClient) => {
    const cas = await client.raw(
      `
      update "woodright_order_process"
      set
        "current_stage" = ?,
        "previous_stage" = ?,
        "version" = "version" + 1,
        "estimated_completion_date" = ?,
        "customer_message" = ?,
        "internal_note" = ?,
        "paused_reason" = ?,
        "updated_at" = now()
      where "id" = ?
        and "version" = ?
        and "deleted_at" is null
      returning *
      `,
      [
        pure.process.current_stage,
        pure.process.previous_stage,
        pure.process.estimated_completion_date
          ? new Date(pure.process.estimated_completion_date)
          : null,
        pure.process.customer_message,
        pure.process.internal_note,
        pure.process.paused_reason,
        pure.process.id,
        processRow.version,
      ]
    )
    const row = (cas.rows?.[0] ?? null) as Record<string, unknown> | null
    if (!row) {
      return {
        ok: false as const,
        code: "STALE_PROCESS_VERSION",
        message: "Статус уже изменён другим сотрудником - обновите страницу",
        http: 409 as const,
      }
    }

    await client.raw(
      `
      insert into "woodright_order_process_event" (
        "id", "process_id", "order_id", "previous_stage", "next_stage",
        "event_type", "actor_type", "actor_id", "actor_display",
        "customer_visible", "customer_message", "internal_note",
        "notification_requested", "notification_result", "source",
        "idempotency_key", "correlation_id", "created_at", "updated_at"
      ) values (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, null, ?,
        ?, ?, now(), now()
      )
      `,
      [
        pure.event.id,
        pure.event.process_id,
        pure.event.order_id,
        pure.event.previous_stage,
        pure.event.next_stage,
        pure.event.event_type,
        pure.event.actor_type,
        pure.event.actor_id,
        pure.event.actor_display,
        pure.event.customer_visible,
        pure.event.customer_message,
        pure.event.internal_note,
        pure.event.notification_requested,
        pure.event.source,
        pure.event.idempotency_key,
        `v:${pure.process.version}`,
      ]
    )

    const notifyOn = Boolean(cmd.notify_customer) && notificationsEnabled()
    for (const d of pure.deliveries) {
      const status = notifyOn ? "pending" : "skipped"
      await client.raw(
        `
        insert into "woodright_notification_delivery" (
          "id", "event_id", "channel", "recipient_key", "status",
          "attempt_count", "last_error", "created_at", "updated_at"
        ) values (?, ?, ?, ?, ?, 0, null, now(), now())
        on conflict ("event_id", "channel", "recipient_key") where deleted_at is null do nothing
        `,
        [d.id, pure.event.id, d.channel, d.recipient_key, status]
      )

      if (notifyOn) {
        const stage = pure.process.current_stage as OrderProcessStage
        const copy = buildStageNotificationCopy({
          stage_label: STAGE_BUYER_LABEL[stage] ?? stage,
          customer_message: pure.event.customer_message,
        })
        const result = dispatchFakeNotification({
          event_id: pure.event.id,
          channel: d.channel,
          recipient_key: d.recipient_key,
          subject: copy.subject,
          body: copy.body,
        })
        await client.raw(
          `
          update "woodright_notification_delivery"
          set "status" = ?, "attempt_count" = 1, "updated_at" = now()
          where "id" = ?
          `,
          [result === "deduped" ? "deduped" : "sent", d.id]
        )
      }
    }

    return {
      ok: true as const,
      process: asProcessRecord(row),
      event: pure.event,
      replay: false as const,
    }
  }

  try {
    if (typeof sql.transaction === "function") {
      return await sql.transaction((trx) => run(trx))
    }
    return await run(sql)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/unique|duplicate/i.test(msg)) {
      return {
        ok: false,
        code: "IDEMPOTENCY_CONFLICT",
        message: "Повторный запрос с другим телом или гонка записи",
        http: 409,
      }
    }
    return {
      ok: false,
      code: "TRANSITION_PERSIST_FAILED",
      message: "Не удалось сохранить переход этапа",
      http: 500,
    }
  }
}
