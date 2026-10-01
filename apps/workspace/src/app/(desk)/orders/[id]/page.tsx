import Link from "next/link"
import { AssigneeControl } from "@/components/assignee-control"
import { Avatar } from "@/components/object-row"
import { Card, ErrorBlock, ObjectHeader } from "@/components/page"
import { PendingForm } from "@/components/pending-form"
import { ResultToast } from "@/components/result-toast"
import { SidePanel } from "@/components/side-panel"
import { StateBadge, Status } from "@/components/status"
import { Timeline } from "@/components/timeline"
import { formatRub, formatWhen } from "@/lib/format"
import { nextOrderAction, orderAxes, primaryStageAction, stageButtonLabel } from "@/lib/order-presentation"
import { loadOrder } from "@/server/loaders"
import { requireSession } from "@/server/session"

const STAGE_TRACK = ["new", "needs_confirmation", "specification_in_progress", "awaiting_customer_approval", "confirmed", "in_production", "quality_control", "ready_for_delivery"]

const ACTIVITY_KIND: Record<string, string> = {
  order_created: "Заказ",
  stage_changed: "Этап",
  note: "Заметка команде",
  note_changed: "Заметка команде",
  assignee: "Ответственный",
  assignee_changed: "Ответственный",
  payment: "Оплата",
  fulfillment: "Доставка",
}

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ saved?: string; error?: string; note?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const [result, session] = await Promise.all([loadOrder(id), requireSession()])
  if (!result.ok) return <><ObjectHeader back="Заказы" backHref="/orders" title="Заказ" /><ErrorBlock message={result.message} /></>
  const { order, process, assignment, staff, activity } = result.data
  const allowed = result.data.allowed_stages ?? process?.allowed_stages ?? []
  const primary = primaryStageAction(allowed)
  const others = allowed.filter((option) => option.stage !== primary?.stage)
  const axes = orderAxes({
    payment_status: order.payment_status,
    fulfillment_status: order.fulfillment_status,
    manufacturing_stage: process?.current_stage,
    manufacturing_label: process?.label,
  })
  const buyer = order.customer ? [order.customer.first_name, order.customer.last_name].filter(Boolean).join(" ") : ""
  const buyerName = buyer || order.email || "Покупатель"
  const assignee = staff.find((member) => member.id === assignment?.assignee_id) ?? null
  const noteValue = query.note ?? process?.internal_note ?? ""
  const trackIndex = STAGE_TRACK.indexOf(process?.current_stage ?? "")
  const version = process?.version ?? 0

  return (
    <>
      <ObjectHeader
        back="Заказы"
        backHref="/orders"
        title={`Заказ ${order.display_id ? `#${order.display_id}` : order.id}`}
        meta={[buyerName, order.email && buyer ? order.email : null, order.customer?.phone, `создан ${formatWhen(order.created_at)}`].filter(Boolean).join(" · ")}
        states={
          <>
            <span className="money-lg">{formatRub(order.total)}</span>
            <StateBadge size="lg" state={axes.money} />
            <StateBadge size="lg" state={axes.delivery} />
            <StateBadge size="lg" state={axes.manufacturing} />
          </>
        }
        next={nextOrderAction(process?.current_stage)}
        primary={
          primary && process ? (
            <PendingForm action={`/api/orders/${order.id}/stage`}>
              <input type="hidden" name="to_stage" value={primary.stage} />
              <input type="hidden" name="expected_version" value={version} />
              <button className="btn btn-primary" type="submit">{stageButtonLabel(primary)}</button>
            </PendingForm>
          ) : null
        }
        secondary={
          process ? (
            <SidePanel trigger="Другой этап…" triggerClassName="btn btn-secondary" title="Изменить этап изготовления">
              <p className="meta">Сейчас: {process.label}. Доступные переходы определяет сервер</p>
              {others.length === 0 && !primary ? <p className="meta">Переходов из этого этапа нет</p> : null}
              <div className="stack">
                {allowed.map((option) => (
                  <PendingForm key={option.stage} action={`/api/orders/${order.id}/stage`}>
                    <input type="hidden" name="to_stage" value={option.stage} />
                    <input type="hidden" name="expected_version" value={version} />
                    <button className="btn btn-secondary full" type="submit">{option.label}</button>
                  </PendingForm>
                ))}
              </div>
              <details>
                <summary className="meta">Исправить ошибочный этап</summary>
                <PendingForm action={`/api/orders/${order.id}/stage`} className="stack">
                  <input type="hidden" name="correction" value="1" />
                  <input type="hidden" name="expected_version" value={version} />
                  <label className="field">
                    <span>Этап</span>
                    <select name="to_stage" defaultValue={allowed[0]?.stage ?? ""}>
                      {allowed.map((option) => (
                        <option key={option.stage} value={option.stage}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Причина исправления</span>
                    <input name="correction_reason" required minLength={5} placeholder="Почему этап был поставлен неверно" />
                  </label>
                  <button className="btn btn-danger" type="submit">Исправить этап</button>
                </PendingForm>
              </details>
            </SidePanel>
          ) : null
        }
      />
      <ResultToast saved={query.saved} error={query.error} />
      <div className="two-col">
        <div className="stack-lg">
          <div className="three-col">
            <Card title="Деньги">
              <StateBadge size="lg" state={axes.money} />
              <p className="money">{formatRub(order.total)}</p>
              <p className="meta">Статус оплаты приходит из Medusa. Здесь он не меняется</p>
            </Card>
            <Card title="Доставка">
              <StateBadge size="lg" state={axes.delivery} />
              <p className="meta">Отгрузка и доставка ведутся в Medusa</p>
            </Card>
            <Card title="Изготовление">
              <StateBadge size="lg" state={axes.manufacturing} />
              {process ? (
                <ol className="stage-track" aria-label="Этапы изготовления">
                  {STAGE_TRACK.map((stage, index) => (
                    <li key={stage} className={index < trackIndex ? "done" : index === trackIndex ? "current" : ""} aria-current={index === trackIndex ? "step" : undefined} />
                  ))}
                </ol>
              ) : (
                <p className="meta">Процесс изготовления не создан</p>
              )}
              <p className="meta">Следующее действие: {nextOrderAction(process?.current_stage)}</p>
            </Card>
          </div>
          <Card title="Состав">
            <div className="list">
              {order.items.map((item) => (
                <div key={item.id} className="row" style={{ justifyContent: "space-between" }}>
                  <span>{item.title}{item.quantity != null ? ` × ${item.quantity}` : ""}</span>
                  <span className="money">{formatRub(item.unit_price)}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card title="История">
            <Timeline
              items={activity.map((event) => ({
                id: event.id,
                at: event.at,
                kind: ACTIVITY_KIND[event.kind] ?? event.kind,
                text: event.label,
                detail: event.detail,
                internal: event.kind === "note" || event.kind === "note_changed",
              }))}
              empty="Событий пока нет"
            />
          </Card>
        </div>
        <aside className="stack-lg context">
          <Card title="Человек">
            <div className="row">
              <Avatar name={buyerName} />
              <div className="object-row-main">
                <span className="object-row-title">{buyerName}</span>
                <span className="object-row-meta">{[buyer ? order.email : null, order.customer?.phone].filter(Boolean).join(" · ") || (buyer ? "почта не указана" : "имя не указано")}</span>
              </div>
            </div>
            {order.email ? <Link className="btn btn-ghost sm" href={`/clients?mode=people`}>Найти в Клиентах</Link> : null}
          </Card>
          <Card title="Ответственный">
            {process ? (
              <AssigneeControl action={`/api/orders/${order.id}/assignee`} assigneeId={assignment?.assignee_id ?? null} staff={staff} selfEmail={session.email} />
            ) : (
              <p className="meta">{assignee?.email || "Не назначен"}</p>
            )}
          </Card>
          <Card title="Заметка команде" trailing={<Status tone="neutral">не видна покупателю</Status>}>
            {process ? (
              <PendingForm action={`/api/orders/${order.id}/note`} className="stack">
                <input type="hidden" name="expected_version" value={version} />
                <label className="field">
                  <span className="sr-only">Заметка</span>
                  <textarea name="internal_note" rows={4} defaultValue={noteValue} placeholder="Что важно знать команде" />
                </label>
                <button className="btn btn-secondary sm" type="submit">Сохранить заметку</button>
              </PendingForm>
            ) : (
              <p className="meta">Заметка появится после создания процесса изготовления</p>
            )}
          </Card>
        </aside>
      </div>
    </>
  )
}
