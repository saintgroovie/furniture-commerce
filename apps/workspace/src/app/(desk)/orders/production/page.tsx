import Link from "next/link"
import { Card, EmptyState, ErrorBlock, ModeTabs, PageHeader } from "@/components/page"
import { StateBadge } from "@/components/status"
import { formatRub } from "@/lib/format"
import { nextOrderAction, paymentState, PRODUCTION_COLUMNS, productionColumnFor } from "@/lib/order-presentation"
import { ORDER_MODES } from "@/lib/nav"
import { loadOrdersAll } from "@/server/loaders"

/**
 * Production mode: the same orders as the list, grouped by manufacturing stage.
 * A card links to the one Order object - no separate production entity.
 * Days on stage are deferred: the list read model has no stage timestamp yet.
 */
export default async function ProductionPage() {
  const result = await loadOrdersAll("all")
  return (
    <>
      <PageHeader kicker="Заказы" title="Производство" lead="Те же заказы, сгруппированы по этапу изготовления" right={<ModeTabs items={ORDER_MODES} active="production" />} />
      {!result.ok ? <ErrorBlock message={result.message} /> : null}
      {result.ok && result.data.truncated ? (
        <div className="banner attention">Показаны первые {result.data.orders.length} заказов. Остальные ищите через поиск или список</div>
      ) : null}
      {result.ok ? (
        <div className="board" aria-label="Доска производства">
          {PRODUCTION_COLUMNS.map((column) => {
            const cards = result.data.orders.filter((order) => productionColumnFor(order.manufacturing_stage) === column.id)
            return (
              <section key={column.id} className="board-col" aria-label={column.title}>
                <header className="board-col-head">
                  <span className="section-title">{column.title}</span>
                  <span className="meta">{cards.length}</span>
                </header>
                {cards.length === 0 ? <p className="meta">Пусто</p> : null}
                {cards.map((order) => (
                  <Link key={order.id} href={`/orders/${order.id}`} className={`board-card${order.action_needed ? " needs-action" : ""}`}>
                    <span className="object-row-title">
                      {order.display_id ? `#${order.display_id}` : order.id} · {order.person_name || order.email || "Без имени"}
                    </span>
                    <span className="object-row-meta">{formatRub(order.total)} · {order.manufacturing_label || nextOrderAction(order.manufacturing_stage)}</span>
                    <StateBadge state={paymentState(order.payment_status)} />
                  </Link>
                ))}
              </section>
            )
          })}
        </div>
      ) : null}
      {result.ok && result.data.orders.length === 0 ? (
        <Card>
          <EmptyState title="Заказов нет" />
        </Card>
      ) : null}
    </>
  )
}
