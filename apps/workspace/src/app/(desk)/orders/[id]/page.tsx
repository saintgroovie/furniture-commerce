import Link from "next/link"
import { ErrorBlock, PageHeader } from "@/components/page"
import { formatRub, formatWhen, fulfillmentLabel, paymentLabel } from "@/lib/format"
import { loadOrder } from "@/server/loaders"

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await loadOrder(id)
  if (!result.ok) {
    return (
      <>
        <PageHeader title="Заказ" />
        <ErrorBlock message={result.message} />
      </>
    )
  }
  const order = result.data.order
  const customer = order.customer
  const name = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ")
  const items = Array.isArray(order.items) ? order.items : []
  return (
    <>
      <PageHeader
        kicker="Заказ"
        title={`Заказ ${order.display_id ?? ""}`.trim()}
        lead={result.data.process?.label || "Этап изготовления ещё не начат"}
      />
      <div className="section-grid">
        <div>
          <section className="card">
            <h2>Сейчас</h2>
            <p>{formatRub(order.total)}</p>
            <div className="pills">
              <span className="pill">Оплата: {paymentLabel(order.payment_status)}</span>
              <span className="pill">Отгрузка: {fulfillmentLabel(order.fulfillment_status)}</span>
              <span className="pill">Изготовление: {result.data.process?.label || "нет этапа"}</span>
            </div>
            <p className="muted">{formatWhen(order.created_at)}</p>
          </section>
          <section className="card">
            <h2>Состав</h2>
            {items.length === 0 ? <p className="empty">Состав не пришёл</p> : null}
            <ul>
              {items.map((item) => (
                <li key={String(item.id)}>
                  {String(item.title ?? "Позиция")} · {String(item.quantity ?? 1)} · {formatRub(item.unit_price as number | string | null)}
                </li>
              ))}
            </ul>
          </section>
          <section className="card">
            <h2>История</h2>
            {result.data.activity.length === 0 ? <p className="empty">Подтверждённых событий пока нет</p> : null}
            <ul>
              {result.data.activity.map((item) => (
                <li key={item.id}>
                  <strong>{item.label}</strong>
                  <span className="muted"> {formatWhen(item.at)}</span>
                  {item.detail ? <div>{item.detail}</div> : null}
                </li>
              ))}
            </ul>
          </section>
        </div>
        <aside>
          <section className="card">
            <h2>Человек</h2>
            <p>{name || order.email || "Покупатель не связан"}</p>
            {order.email ? <p className="muted">{order.email}</p> : null}
            {customer?.phone ? <p className="muted">{customer.phone}</p> : null}
            <Link href="/people">К людям</Link>
          </section>
          <section className="card">
            <h2>Заметка</h2>
            <p>{result.data.process?.internal_note || "Заметки нет"}</p>
          </section>
        </aside>
      </div>
    </>
  )
}
