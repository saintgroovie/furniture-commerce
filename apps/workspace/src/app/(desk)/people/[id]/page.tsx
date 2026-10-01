import Link from "next/link"
import { AssigneeControl, findSelf } from "@/components/assignee-control"
import { Avatar, ObjectRow } from "@/components/object-row"
import { Card, EmptyState, ErrorBlock, ObjectHeader } from "@/components/page"
import { PersonMatch } from "@/components/person-actions"
import { ResultToast } from "@/components/result-toast"
import { StateBadge, Status } from "@/components/status"
import { Timeline, type TimelineEntry } from "@/components/timeline"
import { formatRub } from "@/lib/format"
import { paymentState } from "@/lib/order-presentation"
import { nextRequestAction, personMatchState, personMatchView, personRole, requestState } from "@/lib/person-presentation"
import { loadPerson } from "@/server/loaders"
import { requireSession } from "@/server/session"

export default async function PersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ saved?: string; error?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const [result, session] = await Promise.all([loadPerson(id), requireSession()])
  if (!result.ok) return <><ObjectHeader back="Клиенты" backHref="/clients" title="Человек" /><ErrorBlock message={result.message} /></>
  const person = result.data.person
  const link = result.data.link
  const matchView = personMatchView({
    linksAvailable: result.data.links_available,
    linkedCustomerId: link?.customer_id ?? null,
    suggestion: result.data.suggestion,
  })
  const matchState = personMatchState(matchView)
  const staff = result.data.staff as Array<{ id: string; email: string | null }>
  const assigneeId = link?.assignee_id ?? null
  const assignee = staff.find((member) => member.id === assigneeId) ?? null
  const self = findSelf(staff, session.email)
  const requests = result.data.requests as Array<{ id: string; status: string; comment?: string | null; created_at?: string | null }>
  const orders = result.data.orders as Array<{ id: string; display_id?: string | number | null; total?: number | string | null; payment_status?: string | null; created_at?: string | null }>
  const activeRequest = requests.find((request) => request.status !== "completed") ?? null
  const legacySaved = query.saved === "0" ? "Связь не сохранилась" : null

  const timeline: TimelineEntry[] = [
    ...requests.map((request) => ({
      id: `req:${request.id}`,
      at: request.created_at ?? null,
      kind: "Заявка",
      text: `Заявка с сайта: ${request.comment || "без комментария"}`,
      detail: requestState(request.status).label,
    })),
    ...orders.map((order) => ({
      id: `ord:${order.id}`,
      at: order.created_at ?? null,
      kind: "Заказ",
      text: `Заказ ${order.display_id ?? ""} · ${formatRub(order.total)}`,
      detail: paymentState(order.payment_status).label,
    })),
    ...(person.comment
      ? [{ id: "comment", at: person.created_at ?? requests[0]?.created_at ?? null, kind: "Комментарий из заявки", text: person.comment, internal: true }]
      : []),
  ].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))

  return (
    <>
      <ObjectHeader
        back="Клиенты · Люди"
        backHref="/clients?mode=people"
        title={<><Avatar name={person.name} />{person.name || "Без имени"}</>}
        meta={[personRole({ customer_id: link?.customer_id, request_count: requests.length }), person.phone, person.email, person.source ? `источник: ${person.source}` : null].filter(Boolean).join(" · ")}
        states={
          <>
            <StateBadge size="lg" state={matchState} />
            <Status tone="neutral" size="lg">Ответственный: {assignee?.email || (assigneeId ? "назначен" : "не назначен")}</Status>
            {activeRequest ? <StateBadge size="lg" state={requestState(activeRequest.status)} /> : null}
          </>
        }
        next={matchView.kind === "ambiguous" ? "подтвердить, какой покупатель магазина - этот человек" : activeRequest ? nextRequestAction(activeRequest.status) : "действий не требуется"}
        primary={activeRequest ? <Link className="btn btn-primary" href={`/requests/${activeRequest.id}`}>Открыть заявку</Link> : null}
        secondary={
          <>
            {person.phone ? <a className="btn btn-ghost" href={`tel:${person.phone.replace(/[^\d+]/g, "")}`}>Позвонить</a> : null}
            {person.email ? <a className="btn btn-ghost" href={`mailto:${person.email}`}>Написать</a> : null}
          </>
        }
      />
      <ResultToast saved={query.saved === "1" ? "1" : undefined} error={query.error || legacySaved || undefined} savedLabel="Сохранено" />
      {matchView.kind === "ambiguous" ? (
        <Card title="Нужно проверить связь" trailing={<span className="meta">Автоматически не объединяем</span>}>
          <PersonMatch personId={person.id} view={matchView} />
        </Card>
      ) : null}
      <div className="two-col">
        <div className="stack-lg">
          <Card title="Сейчас">
            {requests.length === 0 && orders.length === 0 ? <EmptyState title="Активной работы нет" /> : null}
            <div className="list">
              {requests.map((request) => (
                <ObjectRow
                  key={request.id}
                  href={`/requests/${request.id}`}
                  title={`Заявка · ${request.comment || "без комментария"}`}
                  meta="Открыть заявку"
                  end={<StateBadge state={requestState(request.status)} />}
                />
              ))}
              {orders.map((order) => (
                <ObjectRow
                  key={order.id}
                  href={`/orders/${order.id}`}
                  title={`Заказ ${order.display_id ?? ""} · ${formatRub(order.total)}`}
                  meta="Открыть заказ"
                  end={<StateBadge state={paymentState(order.payment_status)} />}
                />
              ))}
            </div>
            {link?.customer_id ? null : <p className="meta">Заказы покупателя появятся после подтверждённой связи</p>}
          </Card>
          <Card title="История">
            <Timeline items={timeline} empty="Подтверждённых событий пока нет" />
          </Card>
        </div>
        <aside className="stack-lg context">
          <Card title="Связь с покупателем">
            {matchView.kind === "ambiguous" ? <p className="meta">Кандидаты показаны выше</p> : <PersonMatch personId={person.id} view={matchView} />}
          </Card>
          <Card title="Ответственный">
            {result.data.links_available ? (
              <AssigneeControl action={`/api/people/${person.id}/assignee`} assigneeId={assigneeId} staff={staff} selfEmail={self ? session.email : session.email} />
            ) : (
              <p className="meta">Назначение появится после миграции связи</p>
            )}
          </Card>
        </aside>
      </div>
    </>
  )
}
