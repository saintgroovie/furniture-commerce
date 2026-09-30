import Link from "next/link"
import { ErrorBlock, PageHeader } from "@/components/page"
import { formatRub, formatWhen, fulfillmentLabel, paymentLabel } from "@/lib/format"
import { loadOrder } from "@/server/loaders"

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ saved?: string; error?: string; note?: string }>
}) {
  const { id } = await params
  const query = await searchParams
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
  const process = result.data.process
  const customer = order.customer
  const name = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ")
  const items = Array.isArray(order.items) ? order.items : []
  const version = Number(process?.version ?? 1)
  const nextStages = result.data.allowed_stages ?? process?.allowed_stages ?? []
  const assigneeId = result.data.assignment?.assignee_id ?? null
  const assignee = result.data.staff.find((person) => person.id === assigneeId)
  return (
    <>
      <PageHeader
        kicker="Заказ"
        title={`Заказ ${order.display_id ?? ""}`.trim()}
        lead={process?.label || "Этап изготовления ещё не начат"}
      />
      {query.saved === "1" ? <p className="toast" role="status">Сохранено</p> : null}
      {query.error ? <p className="toast warn" role="alert">{query.error}</p> : null}
      <div className="section-grid">
        <div>
          <section className="card">
            <h2>Оплата и отгрузка</h2>
            <p>{order.total ? formatRub(order.total) : "Сумма заказа ещё не проведена"}</p>
            <div className="pills">
              <span className="pill">Оплата: {paymentLabel(order.payment_status)}</span>
              <span className="pill">Отгрузка: {fulfillmentLabel(order.fulfillment_status)}</span>
            </div>
            <p className="muted">Это состояние заказа Medusa. Оно не является этапом изготовления</p>
            <p className="muted">{formatWhen(order.created_at)}</p>
          </section>
          <section className="card">
            <h2>Изготовление</h2>
            <p>{process?.label || "Этап ещё не открыт"}</p>
            <div className="stack">
              {nextStages.map((next) => (
                <form key={next.stage} action={`/api/orders/${id}/stage`} method="post">
                  <input type="hidden" name="to_stage" value={next.stage} />
                  <input type="hidden" name="expected_version" value={version} />
                  <button className="primary" type="submit">Перевести в «{next.label}»</button>
                </form>
              ))}
            </div>
            <details>
              <summary>Другой этап, с пояснением</summary>
              <form action={`/api/orders/${id}/stage`} method="post" className="stack">
                <input type="hidden" name="expected_version" value={version} />
                <input type="hidden" name="correction" value="1" />
                <label>
                  Этап
                  <select name="to_stage" defaultValue="on_hold">
                    <option value="needs_confirmation">Требует подтверждения</option>
                    <option value="specification_in_progress">Согласование комплектации</option>
                    <option value="awaiting_customer_approval">Ожидает согласования клиента</option>
                    <option value="confirmed">Подтверждён</option>
                    <option value="in_production">В производстве</option>
                    <option value="quality_control">Проверка качества</option>
                    <option value="ready_for_delivery">Готов к передаче</option>
                    <option value="on_hold">Приостановлен</option>
                  </select>
                </label>
                <label>
                  Почему
                  <textarea name="correction_reason" required minLength={10} rows={3} />
                </label>
                <button className="ghost" type="submit">Перевести и записать причину</button>
              </form>
            </details>
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
        <aside className="stack">
          <section className="card">
            <h2>Человек</h2>
            <p>{name || order.email || "Покупатель не связан"}</p>
            {order.email ? <p className="muted">{order.email}</p> : null}
            {customer?.phone ? <p className="muted">{customer.phone}</p> : null}
            <Link href="/people">К людям</Link>
          </section>
          <section className="card">
            <h2>Ответственный</h2>
            <p>{assignee?.email || (assigneeId ? "Сотрудник назначен" : "Не назначен")}</p>
            <form action={`/api/orders/${id}/assignee`} method="post" className="stack">
              <select name="assignee_id" defaultValue={assigneeId ?? ""}>
                <option value="">Снять назначение</option>
                {result.data.staff.map((person) => (
                  <option key={person.id} value={person.id}>{person.email || person.id}</option>
                ))}
              </select>
              <button className="primary" type="submit">Сохранить ответственного</button>
            </form>
          </section>
          <section className="card">
            <h2>Заметка</h2>
            {process ? (
              <form action={`/api/orders/${id}/note`} method="post" className="stack">
                <input type="hidden" name="expected_version" value={version} />
                <textarea name="internal_note" rows={4} defaultValue={query.note || process.internal_note || ""} />
                <button className="primary" type="submit">Сохранить заметку</button>
              </form>
            ) : (
              <p className="muted">Заметка появится после первого этапа</p>
            )}
          </section>
        </aside>
      </div>
    </>
  )
}
