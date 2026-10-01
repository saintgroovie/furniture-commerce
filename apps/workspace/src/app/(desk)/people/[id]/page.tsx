import Link from "next/link"
import { AssigneeControl, findSelf } from "@/components/assignee-control"
import { FollowUpForm } from "@/components/follow-up-form"
import { Avatar, ObjectRow } from "@/components/object-row"
import { Card, EmptyState, ErrorBlock, ObjectHeader } from "@/components/page"
import { PendingForm } from "@/components/pending-form"
import { PersonMatch } from "@/components/person-actions"
import { ResultToast } from "@/components/result-toast"
import { StateBadge, Status } from "@/components/status"
import { Timeline, type TimelineEntry } from "@/components/timeline"
import { formatRub } from "@/lib/format"
import { paymentState } from "@/lib/order-presentation"
import { nextRequestAction, personMatchState, personMatchView, personRole, requestState } from "@/lib/person-presentation"
import { loadCompanies, loadPerson } from "@/server/loaders"
import { requireSession } from "@/server/session"

const ROLE_OPTIONS = [
  ["buyer", "Покупатель"],
  ["designer", "Дизайнер"],
  ["architect", "Архитектор"],
  ["company_representative", "Представитель компании"],
  ["partner", "Партнёр"],
] as const

const COMPANY_TYPES = [
  ["design_studio", "Дизайн-студия"],
  ["architecture_bureau", "Архитектурное бюро"],
  ["partner", "Партнёр"],
  ["other", "Другое"],
] as const

export default async function PersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ saved?: string; error?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const [result, session, companiesResult] = await Promise.all([loadPerson(id), requireSession(), loadCompanies()])
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
  const roles = result.data.roles ?? []
  const companies = result.data.companies ?? []
  const notes = result.data.notes ?? []
  const followUps = (result.data.follow_ups ?? []).filter((item) => item.status === "open")
  const activeRequests = requests.filter((request) => request.status !== "completed")
  const doneRequests = requests.filter((request) => request.status === "completed")
  const activeRequest = activeRequests[0] ?? null
  const roleLine = roles.length > 0 ? roles.map((role) => role.label || role.role).join(", ") : personRole({ customer_id: link?.customer_id, request_count: requests.length })
  const companyLine = companies.map((company) => company.name).join(", ")
  const nextFollow = followUps[0] ?? null
  const legacySaved = query.saved === "0" ? "Связь не сохранилась" : null
  const directory = companiesResult.ok ? companiesResult.data.companies : []
  const timeline: TimelineEntry[] = result.data.crm_available
    ? result.data.activity.map((item) => ({
        id: item.id,
        at: item.at,
        kind: item.source === "note" ? "Заметка" : item.source === "follow_up" ? "Напоминание" : item.source === "order" ? "Заказ" : item.source === "request" ? "Заявка" : item.source === "company" ? "Компания" : "Событие",
        text: item.text,
        internal: item.source === "note" || item.source === "audit",
      }))
    : [
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
        meta={[roleLine, companyLine, person.phone, person.email].filter(Boolean).join(" · ")}
        states={
          <>
            <StateBadge size="lg" state={matchState} />
            <Status tone="neutral" size="lg">Ответственный: {assignee?.email || (assigneeId ? "назначен" : "не назначен")}</Status>
            {activeRequest ? <StateBadge size="lg" state={requestState(activeRequest.status)} /> : null}
          </>
        }
        next={
          matchView.kind === "ambiguous"
            ? "подтвердить, какой покупатель магазина - этот человек"
            : nextFollow
              ? `Напоминание: ${nextFollow.summary}`
              : activeRequest
                ? nextRequestAction(activeRequest.status)
                : "действий не требуется"
        }
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
          <Card title="Дальше" id="follow-up">
            {result.data.follow_ups_truncated ? <p className="meta">Показаны не все напоминания</p> : null}
            {followUps.length === 0 ? <p className="meta">Открытых напоминаний нет</p> : null}
            {followUps.map((item) => (
              <div key={item.id} className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <div>{item.summary || "Напоминание"}</div>
                  <span className="meta">{item.due_at ? new Date(item.due_at).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" }) : "дата не указана"}</span>
                </div>
                <PendingForm action={`/api/follow-ups/${item.id}`}>
                  <input type="hidden" name="back" value={`/people/${person.id}`} />
                  <input type="hidden" name="status" value="done" />
                  <button className="btn btn-ghost sm" type="submit">Готово</button>
                </PendingForm>
              </div>
            ))}
            {result.data.crm_available ? (
              <FollowUpForm action="/api/follow-ups" back={`/people/${person.id}`} entityType="person" entityId={person.id} />
            ) : (
              <p className="meta">Напоминания появятся после миграции CRM</p>
            )}
          </Card>
          <Card title="Сейчас">
            {activeRequests.length === 0 && orders.length === 0 ? <EmptyState title="Активной работы нет" /> : null}
            <div className="list">
              {activeRequests.map((request) => (
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
            {doneRequests.length > 0 ? <p className="meta">Завершённых заявок: {doneRequests.length}</p> : null}
            {link?.customer_id ? null : <p className="meta">Заказы покупателя появятся после подтверждённой связи</p>}
          </Card>
          <Card title="Заметки" id="notes">
            {notes.length === 0 ? <p className="meta">Внутренних заметок нет</p> : null}
            {notes.map((note) => (
              <div key={note.id} className="internal-note">
                <p>{note.body}</p>
              </div>
            ))}
            {person.comment ? <p className="meta">Из заявки: {person.comment}</p> : null}
            {result.data.crm_available ? (
              <PendingForm action={`/api/people/${person.id}/notes`} className="stack">
                <label className="field">
                  <span>Заметка команде</span>
                  <textarea name="text" rows={3} placeholder="Что важно помнить" />
                </label>
                <button className="btn btn-secondary sm" type="submit">Сохранить заметку</button>
              </PendingForm>
            ) : null}
          </Card>
          <Card title="История">
            <Timeline items={timeline} empty="Подтверждённых событий пока нет" />
          </Card>
        </div>
        <aside className="stack-lg context">
          <Card title="Роли">
            {roles.length === 0 ? <p className="meta">Роль не указана</p> : null}
            <div className="row">
              {roles.map((role) => (
                <Status key={role.role} tone="neutral">{role.label || role.role}</Status>
              ))}
            </div>
            {result.data.crm_available ? (
              <PendingForm action={`/api/people/${person.id}/roles`} className="stack">
                <label className="field">
                  <span>Добавить роль</span>
                  <select name="role" defaultValue="buyer">
                    {ROLE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <button className="btn btn-secondary sm" type="submit">Добавить</button>
              </PendingForm>
            ) : null}
          </Card>
          <Card title="Компания">
            {companies.length === 0 ? <p className="meta">Компания не связана</p> : null}
            {companies.map((company) => (
              <Link key={company.id} href={`/companies/${company.id}`} className="object-row-title" style={{ display: "block" }}>
                {company.name}{company.type_label ? ` · ${company.type_label}` : ""}
              </Link>
            ))}
            {result.data.crm_available ? (
              <PendingForm action={`/api/people/${person.id}/company`} className="stack">
                {directory.length > 0 ? (
                  <label className="field">
                    <span>Уже есть</span>
                    <select name="company_id" defaultValue="">
                      <option value="">Новая компания</option>
                      {directory.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                    </select>
                  </label>
                ) : null}
                <label className="field">
                  <span>Название</span>
                  <input name="name" placeholder="Студия или бюро" />
                </label>
                <label className="field">
                  <span>Тип</span>
                  <select name="type" defaultValue="other">
                    {COMPANY_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <button className="btn btn-secondary sm" type="submit">Связать</button>
              </PendingForm>
            ) : (
              <p className="meta">Компании появятся после миграции CRM</p>
            )}
          </Card>
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
