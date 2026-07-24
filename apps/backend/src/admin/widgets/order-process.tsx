import { defineWidgetConfig } from "@medusajs/admin-sdk"
import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
} from "react"
import { adminJson } from "../lib/admin-fetch"

const STAGE_LABELS: Record<string, string> = {
  new: "Новый заказ",
  needs_confirmation: "Требует подтверждения",
  specification_in_progress: "Согласование комплектации",
  awaiting_customer_approval: "Ожидает согласования клиента",
  confirmed: "Подтверждён",
  in_production: "В производстве",
  quality_control: "Проверка качества",
  ready_for_delivery: "Готов к передаче",
  on_hold: "Приостановлен",
  canceled: "Отменён",
}

type ProcessDetail = {
  order_process: {
    id: string
    order_id: string
    current_stage: string
    previous_stage?: string | null
    version: number
    estimated_completion_date?: string | null
    customer_message?: string | null
    internal_note?: string | null
    stage_label?: string
  }
  payment?: { code: string; label: string }
  delivery?: { code: string; label: string }
  allowed_transitions?: string[]
  events?: Array<{
    id: string
    next_stage?: string
    previous_stage?: string | null
    customer_message?: string | null
    internal_note?: string | null
    created_at?: string
    event_type?: string
  }>
}

const OrderProcessWidget = ({ data }: { data?: { id?: string } }) => {
  const orderId = data?.id ?? ""
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<ProcessDetail | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [toStage, setToStage] = useState("")
  const [customerMessage, setCustomerMessage] = useState("")
  const [internalNote, setInternalNote] = useState("")
  const [estimate, setEstimate] = useState("")
  const [notify, setNotify] = useState(true)
  const [correction, setCorrection] = useState(false)
  const [correctionReason, setCorrectionReason] = useState("")
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!orderId) return
    setLoading(true)
    setError(null)
    try {
      const res = await adminJson<ProcessDetail>(
        `/admin/woodright/order-processes/${orderId}`
      )
      setDetail(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить")
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    void load()
  }, [load])

  const openDialog = () => {
    const allowed = detail?.allowed_transitions ?? []
    setToStage(allowed[0] ?? "")
    setCustomerMessage(detail?.order_process.customer_message ?? "")
    setInternalNote(detail?.order_process.internal_note ?? "")
    setEstimate(
      detail?.order_process.estimated_completion_date
        ? String(detail.order_process.estimated_completion_date).slice(0, 10)
        : ""
    )
    setNotify(true)
    setCorrection(false)
    setCorrectionReason("")
    setDialogOpen(true)
  }

  const submitTransition = async () => {
    if (!detail || !toStage) return
    if (toStage === "on_hold" || toStage === "canceled" || correction) {
      const ok = window.confirm(
        correction
          ? "Подтвердите корректирующий переход. Это действие будет записано в журнал."
          : `Подтвердите опасное действие: «${STAGE_LABELS[toStage] ?? toStage}»`
      )
      if (!ok) return
    }
    if (correction && correctionReason.trim().length < 10) {
      setError("Для корректировки укажите причину (не меньше 10 символов)")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await adminJson(
        `/admin/woodright/order-processes/${orderId}/transitions`,
        {
          method: "POST",
          body: JSON.stringify({
            to_stage: toStage,
            expected_version: detail.order_process.version,
            customer_message: customerMessage || null,
            internal_note: internalNote || null,
            estimated_completion_date: estimate
              ? new Date(estimate).toISOString()
              : null,
            notify_customer: notify,
            correction,
            correction_reason: correction ? correctionReason : null,
            idempotency_key: `admin-ui-${orderId}-${detail.order_process.version}-${toStage}-${Date.now()}`,
          }),
        }
      )
      setDialogOpen(false)
      await load()
    } catch (e) {
      const err = e as Error & { status?: number; code?: string }
      if (err.status === 409 || err.code === "STALE_PROCESS_VERSION") {
        setError(
          "Статус уже изменён другим сотрудником - обновите страницу"
        )
      } else {
        setError(err.message || "Не удалось изменить этап")
      }
    } finally {
      setSaving(false)
    }
  }

  if (!orderId) {
    return (
      <div style={box}>
        <h2 style={title}>Статус изготовления Woodright</h2>
        <p style={muted}>Нет id заказа</p>
      </div>
    )
  }

  const process = detail?.order_process
  const allowed = detail?.allowed_transitions ?? []

  return (
    <div style={box}>
      <h2 style={title}>Статус изготовления Woodright</h2>
      {loading && <p style={muted}>Загрузка…</p>}
      {!loading && process && (
        <>
          <p style={{ margin: "0 0 6px", fontWeight: 600 }}>
            {process.stage_label ||
              STAGE_LABELS[process.current_stage] ||
              process.current_stage}
          </p>
          <p style={muted}>Версия: {process.version}</p>
          <p style={row}>
            Оплата: {detail?.payment?.label ?? "нет данных"}
          </p>
          <p style={row}>
            Доставка: {detail?.delivery?.label ?? "нет данных"}
          </p>
          {process.estimated_completion_date && (
            <p style={row}>
              Оценка готовности:{" "}
              {String(process.estimated_completion_date).slice(0, 10)}
            </p>
          )}
          {process.customer_message && (
            <p style={row}>Сообщение клиенту: {process.customer_message}</p>
          )}
          {process.internal_note && (
            <p style={row}>Внутренняя заметка: {process.internal_note}</p>
          )}

          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>История</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
              {(detail?.events ?? []).slice(0, 8).map((e) => (
                <li key={e.id}>
                  {e.created_at
                    ? String(e.created_at).slice(0, 16).replace("T", " ")
                    : ""}{" "}
                  → {STAGE_LABELS[e.next_stage ?? ""] ?? e.next_stage}
                  {e.customer_message ? ` - ${e.customer_message}` : ""}
                </li>
              ))}
            </ul>
          </div>

          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              onClick={openDialog}
              disabled={allowed.length === 0}
            >
              Изменить этап
            </button>
          </div>
        </>
      )}

      {error && <p style={{ color: "#b42318", marginTop: 8 }}>{error}</p>}

      {dialogOpen && (
        <div style={dialogOverlay}>
          <div style={dialogBox}>
            <h3 style={{ marginTop: 0 }}>Изменить этап</h3>
            <label style={label}>
              Новый этап
              <select
                value={toStage}
                onChange={(e) => setToStage(e.target.value)}
                style={input}
              >
                {allowed.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABELS[s] ?? s}
                  </option>
                ))}
              </select>
            </label>
            <label style={label}>
              Оценка готовности
              <input
                type="date"
                value={estimate}
                onChange={(e) => setEstimate(e.target.value)}
                style={input}
              />
            </label>
            <label style={label}>
              Сообщение клиенту
              <textarea
                value={customerMessage}
                onChange={(e) => setCustomerMessage(e.target.value)}
                style={{ ...input, minHeight: 56 }}
              />
            </label>
            <label style={label}>
              Внутренняя заметка
              <textarea
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
                style={{ ...input, minHeight: 56 }}
              />
            </label>
            <label style={{ display: "block", marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={notify}
                onChange={(e) => setNotify(e.target.checked)}
              />{" "}
              Уведомить клиента
            </label>
            <label style={{ display: "block", marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={correction}
                onChange={(e) => setCorrection(e.target.checked)}
              />{" "}
              Корректировка (с причиной)
            </label>
            {correction && (
              <label style={label}>
                Причина корректировки
                <textarea
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  style={{ ...input, minHeight: 56 }}
                />
              </label>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                type="button"
                onClick={() => void submitTransition()}
                disabled={saving || !toStage}
              >
                {saving ? "Сохраняем…" : "Применить"}
              </button>
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const box: CSSProperties = {
  border: "1px solid #e5e5e5",
  borderRadius: 8,
  padding: 16,
  background: "#fff",
  marginTop: 16,
}
const title: CSSProperties = { margin: "0 0 12px", fontSize: 16 }
const muted: CSSProperties = { color: "#667085", fontSize: 13 }
const row: CSSProperties = { margin: "4px 0", fontSize: 13 }
const label: CSSProperties = {
  display: "block",
  marginBottom: 10,
  fontSize: 13,
}
const input: CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 4,
  padding: "6px 8px",
  boxSizing: "border-box",
}
const dialogOverlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 50,
}
const dialogBox: CSSProperties = {
  background: "#fff",
  borderRadius: 8,
  padding: 20,
  width: "min(480px, 92vw)",
  maxHeight: "90vh",
  overflow: "auto",
}

export const config = defineWidgetConfig({
  zone: "order.details.after",
})

export default OrderProcessWidget
