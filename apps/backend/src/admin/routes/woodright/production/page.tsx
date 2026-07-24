import { defineRouteConfig } from "@medusajs/admin-sdk"
import { useCallback, useEffect, useState, type CSSProperties } from "react"
import { adminJson } from "../../lib/admin-fetch"

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

const FILTERS = [
  "",
  "new",
  "needs_confirmation",
  "awaiting_customer_approval",
  "in_production",
  "quality_control",
  "ready_for_delivery",
  "on_hold",
] as const

type ListResponse = {
  order_processes: Array<{
    id: string
    order_id: string
    current_stage: string
    version: number
    estimated_completion_date?: string | null
    customer_message?: string | null
  }>
  count: number
}

const ProductionPage = () => {
  const [stage, setStage] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<ListResponse["order_processes"]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = stage ? `?stage=${encodeURIComponent(stage)}` : ""
      const res = await adminJson<ListResponse>(
        `/admin/woodright/order-processes${qs}`
      )
      setRows(res.order_processes ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить")
    } finally {
      setLoading(false)
    }
  }, [stage])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Производство</h1>
      <p style={{ color: "#667085", marginBottom: 16 }}>
        Заказы Woodright по этапам изготовления
      </p>

      <label style={{ display: "inline-block", marginBottom: 16 }}>
        Этап{" "}
        <select
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          style={{ marginLeft: 8, padding: "4px 8px" }}
        >
          <option value="">Все</option>
          {FILTERS.filter(Boolean).map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s] ?? s}
            </option>
          ))}
        </select>
      </label>

      {loading && <p>Загрузка…</p>}
      {error && <p style={{ color: "#b42318" }}>{error}</p>}

      {!loading && !error && (
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Заказ</th>
              <th style={th}>Этап</th>
              <th style={th}>Версия</th>
              <th style={th}>Оценка</th>
              <th style={th}>Сообщение клиенту</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} style={td}>
                  Пока нет процессов
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td style={td}>
                    <a href={`/orders/${r.order_id}`}>{r.order_id}</a>
                  </td>
                  <td style={td}>
                    {STAGE_LABELS[r.current_stage] ?? r.current_stage}
                  </td>
                  <td style={td}>{r.version}</td>
                  <td style={td}>
                    {r.estimated_completion_date
                      ? String(r.estimated_completion_date).slice(0, 10)
                      : "нет"}
                  </td>
                  <td style={td}>{r.customer_message ?? ""}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}

const table: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
}
const th: CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid #e5e5e5",
  padding: "8px 6px",
}
const td: CSSProperties = {
  borderBottom: "1px solid #f0f0f0",
  padding: "8px 6px",
  verticalAlign: "top",
}

export const config = defineRouteConfig({
  label: "Производство",
})

export default ProductionPage
