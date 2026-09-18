import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Container, Text } from "@medusajs/ui"
import { useCallback, useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { DeskFrame } from "../../../components/woodright/DeskNav"
import { adminJson } from "../../../lib/admin-fetch"
import { DESK_STAGE_LABEL } from "../../../../lib/woodright-admin/seller-desk"

const COLUMNS = [
  "new",
  "needs_confirmation",
  "specification_in_progress",
  "awaiting_customer_approval",
  "confirmed",
  "in_production",
  "quality_control",
  "ready_for_delivery",
  "on_hold",
  "canceled",
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
  const [searchParams] = useSearchParams()
  const focus = searchParams.get("focus")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<ListResponse["order_processes"]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await adminJson<ListResponse>("/admin/woodright/order-processes")
      setRows(res.order_processes ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Container className="p-0">
      <DeskFrame
        title="Производство"
        lead="Заказы по этапам изготовления"
        active="production"
      >
        {loading ? (
          <div className="px-6 py-4">
            <Text size="small" className="text-ui-fg-subtle">
              Загрузка…
            </Text>
          </div>
        ) : null}
        {error ? (
          <div className="px-6 py-4">
            <Text size="small" className="text-ui-fg-error">
              {error}
            </Text>
          </div>
        ) : null}
        <div className="overflow-x-auto px-6 py-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 min-w-[720px]">
            {COLUMNS.map((col) => (
              <div key={col} className="rounded-md border border-ui-border-base p-2">
                <Text size="small" className="text-ui-fg-subtle mb-2">
                  {DESK_STAGE_LABEL[col] ?? col}
                </Text>
                {rows
                  .filter((r) => r.current_stage === col)
                  .map((r) => (
                    <Link
                      key={r.id}
                      to={`/orders/${r.order_id}`}
                      className={`block rounded-md border px-2 py-2 mb-2 text-sm ${
                        focus === r.order_id
                          ? "border-ui-border-strong"
                          : "border-ui-border-base"
                      }`}
                    >
                      <span className="font-medium">{r.order_id}</span>
                      {r.customer_message ? (
                        <span className="block text-ui-fg-subtle">{r.customer_message}</span>
                      ) : null}
                    </Link>
                  ))}
              </div>
            ))}
          </div>
        </div>
      </DeskFrame>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Производство",
})

export default ProductionPage
