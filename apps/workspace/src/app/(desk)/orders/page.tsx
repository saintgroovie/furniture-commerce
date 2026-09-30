import Link from "next/link"
import { ErrorBlock, PageHeader } from "@/components/page"
import { formatWhen, fulfillmentLabel, formatRub, paymentLabel } from "@/lib/format"
import { loadOrders } from "@/server/loaders"

const FILTERS = [
  ["all", "Все"],
  ["new", "Новые"],
  ["action", "Требуют действия"],
  ["waiting", "Ждём клиента"],
  ["production", "В производстве"],
  ["ready", "Готовы"],
  ["fulfilled", "Отгружены"],
] as const

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const params = await searchParams
  const filter = params.filter || "all"
  const result = await loadOrders(filter)
  return (
    <>
      <PageHeader kicker="Заказы" title="Заказы" lead="Оплата и отгрузка живут отдельно от этапа изготовления" />
      <div className="filters">
        {FILTERS.map(([id, label]) => (
          <Link key={id} href={id === "all" ? "/orders" : `/orders?filter=${id}`} aria-current={filter === id ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </div>
      {!result.ok ? <ErrorBlock message={result.message} /> : null}
      {result.ok && result.data.orders.length === 0 ? <p className="empty">В этом срезе заказов нет</p> : null}
      {result.ok ? (
        <div className="stack">
          {result.data.orders.map((order) => (
            <Link key={order.id} href={`/orders/${order.id}`} className="row-card">
              <div>
                <h2>Заказ {order.display_id ?? "без номера"}</h2>
                <span className="muted">{order.person_name || order.email || "Человек не связан"}</span>
              </div>
              <div className="pills">
                <span className="pill">{paymentLabel(order.payment_status)}</span>
                <span className="pill">{fulfillmentLabel(order.fulfillment_status)}</span>
                <span className={order.action_needed ? "pill warn" : "pill"}>
                  {order.manufacturing_label || "Этап ещё не начат"}
                </span>
              </div>
              <div>
                <div>{formatRub(order.total)}</div>
                <span className="muted">{formatWhen(order.created_at)}</span>
              </div>
            </Link>
          ))}
          {result.data.has_more ? <p className="muted">Показаны последние {result.data.limit}</p> : null}
        </div>
      ) : null}
      <p className="muted" style={{ marginTop: 16 }}>Доска изготовления - те же этапы, что и фильтр «В производстве»</p>
    </>
  )
}
