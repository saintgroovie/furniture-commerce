import Link from "next/link"
import { OrderAxesCells, OrderAxesInline } from "@/components/order-axes"
import { EmptyState, ErrorBlock, ModeTabs, PageHeader } from "@/components/page"
import { Status } from "@/components/status"
import { ageLabel, formatRub } from "@/lib/format"
import { nextOrderAction, orderAxes } from "@/lib/order-presentation"
import { ORDER_MODES } from "@/lib/nav"
import { loadOrders } from "@/server/loaders"

const FILTERS = [
  ["all", "Все"],
  ["action", "Требуют действия"],
  ["new", "Новые"],
  ["waiting", "Ждём клиента"],
  ["production", "В производстве"],
  ["ready", "Готовы"],
  ["fulfilled", "Выполнены"],
] as const

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const params = await searchParams
  const filter = FILTERS.some(([id]) => id === params.filter) ? (params.filter as string) : "all"
  const result = await loadOrders(filter)
  return (
    <>
      <PageHeader kicker="Заказы" title="Заказы" lead="Деньги, доставка и изготовление - три отдельные оси. Строка подсвечена, если нужно ваше действие" />
      <div className="toolbar">
        <nav className="filters" aria-label="Фильтр заказов">
          {FILTERS.map(([id, label]) => (
            <Link key={id} href={id === "all" ? "/orders" : `/orders?filter=${id}`} aria-current={filter === id ? "page" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        <ModeTabs items={ORDER_MODES} active="list" />
      </div>
      {!result.ok ? <ErrorBlock message={result.message} /> : null}
      {result.ok && result.data.orders.length === 0 ? (
        <EmptyState title="Заказов в этом срезе нет" href="/orders" linkLabel="Все заказы" />
      ) : null}
      {result.ok && result.data.orders.length > 0 ? (
        <>
          <div className="card table-wrap desktop-only">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Заказ</th>
                  <th scope="col">Покупатель</th>
                  <th scope="col">Сумма</th>
                  <th scope="col">Деньги</th>
                  <th scope="col">Доставка</th>
                  <th scope="col">Изготовление</th>
                  <th scope="col">Следующее действие</th>
                </tr>
              </thead>
              <tbody>
                {result.data.orders.map((order) => {
                  const axes = orderAxes(order)
                  return (
                    <tr key={order.id} className={order.action_needed ? "needs-action" : undefined}>
                      <td>
                        <Link href={`/orders/${order.id}`} className="object-row-title">
                          {order.display_id ? `#${order.display_id}` : order.id}
                        </Link>
                        <div className="meta">{ageLabel(order.created_at)} назад</div>
                      </td>
                      <td>
                        <div>{order.person_name || order.email || "Без имени"}</div>
                        {order.person_name && order.email ? <div className="meta">{order.email}</div> : null}
                      </td>
                      <td className="money">{formatRub(order.total)}</td>
                      <OrderAxesCells axes={axes} />
                      <td>
                        {order.action_needed ? <Status tone="attention">{nextOrderAction(order.manufacturing_stage)}</Status> : <span className="meta">{nextOrderAction(order.manufacturing_stage)}</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="card mobile-only list">
            {result.data.orders.map((order) => {
              const axes = orderAxes(order)
              return (
                <Link key={order.id} href={`/orders/${order.id}`} className="object-row" style={{ textDecoration: "none" }}>
                  <div className="object-row-main">
                    <span className="object-row-title">
                      {order.display_id ? `#${order.display_id}` : order.id} · {order.person_name || order.email || "Без имени"}
                    </span>
                    <span className="object-row-meta">{formatRub(order.total)} · {nextOrderAction(order.manufacturing_stage)}</span>
                    <OrderAxesInline axes={axes} />
                  </div>
                </Link>
              )
            })}
          </div>
          {result.data.has_more ? <p className="meta">Показаны первые {result.data.limit}. Для остальных используйте поиск</p> : null}
        </>
      ) : null}
    </>
  )
}
