import Link from "next/link"
import { AssigneeControl } from "@/components/assignee-control"
import { FollowUpForm } from "@/components/follow-up-form"
import { Avatar, ObjectRow } from "@/components/object-row"
import { EmptyState, ErrorBlock, ObjectHeader } from "@/components/page"
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

const SOURCE_LABEL: Record<string, string> = {
  site: "Сайт",
  website: "Сайт",
  bespoke: "Заявка с сайта",
  designer: "Дизайнер",
  call: "Звонок",
  phone: "Звонок",
  referral: "Рекомендация",
  other: "Другое",
}

function sourceLabel(value: string | null | undefined) {
  if (!value) return "не указан"
  return SOURCE_LABEL[value] ?? "указан"
}

function contactLabel(kind: string | null | undefined) {
  if (kind === "call") return "Звонок"
  if (kind === "meeting") return "Встреча"
  if (kind === "message") return "Сообщение"
  return "Контакт"
}

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
  if (!result.ok) return <><ObjectHeader back="Продажи" backHref="/clients?mode=people" title="Человек" /><ErrorBlock message={result.message} /></>
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
  const requests = result.data.requests as Array<{ id: string; status: string; comment?: string | null; created_at?: string | null }>
  const orders = result.data.orders as Array<{ id: string; display_id?: string | number | null; total?: number | string | null; payment_status?: string | null; created_at?: string | null }>
  const roles = result.data.roles ?? []
  const companies = result.data.companies ?? []
  const notes = result.data.notes ?? []
  const teamNotes = notes.filter((note) => !note.kind || note.kind === "note")
  const contacts = notes.filter((note) => Boolean(note.kind && note.kind !== "note"))
  const heldRoles = new Set(roles.map((role) => role.role))
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
        kind: item.source === "note" ? "Заметка" : item.source === "contact" ? "Контакт" : item.source === "follow_up" ? "Напоминание" : item.source === "order" ? "Заказ" : item.source === "request" ? "Заявка" : item.source === "company" ? "Компания" : "Событие",
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
        back="Продажи · Люди"
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
        <div className="alert-banner">
          <div>
            <strong>Нужно проверить покупателя</strong>
            <p className="meta">Несколько совпадений. Автоматически не объединяем</p>
          </div>
          <a className="btn btn-primary sm" href="#match">Проверить</a>
        </div>
      ) : null}
      <div className="workspace">
        <div className="stack-lg">
          <section className="section" id="work">
            <h2 className="section-title">Активная работа</h2>
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
          </section>
          <section className="section" id="history">
            <h2 className="section-title">История</h2>
            <Timeline items={timeline} empty="Подтверждённых событий пока нет" />
          </section>
          <section className="section" id="notes">
            <h2 className="section-title">Заметка команде</h2>
            {teamNotes.length === 0 ? <p className="meta">Внутренних заметок нет</p> : null}
            {teamNotes.map((note) => (
              <div key={note.id} className="internal-note">
                <p>{note.body}</p>
              </div>
            ))}
            {contacts.map((note) => (
              <p key={note.id} className="meta">{contactLabel(note.kind)} · {note.body}</p>
            ))}
            {person.comment ? <p className="meta">Из заявки: {person.comment}</p> : null}
            {result.data.crm_available ? (
              <>
                <PendingForm action={`/api/people/${person.id}/notes`} className="stack">
                  <label className="field">
                    <span>Зафиксировать контакт</span>
                    <select name="kind" defaultValue="call">
                      <option value="call">Звонок</option>
                      <option value="meeting">Встреча</option>
                      <option value="message">Сообщение</option>
                      <option value="other">Другое</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Чем закончилось</span>
                    <textarea name="text" rows={2} placeholder="Короткий результат" />
                  </label>
                  <button className="btn btn-secondary sm" type="submit">Зафиксировать контакт</button>
                </PendingForm>
                <PendingForm action={`/api/people/${person.id}/notes`} className="stack">
                  <input type="hidden" name="kind" value="note" />
                  <label className="field">
                    <span>Заметка команде</span>
                    <textarea name="text" rows={2} placeholder="Что важно помнить. Это не письмо клиенту" />
                  </label>
                  <button className="btn btn-ghost sm" type="submit">Сохранить заметку</button>
                </PendingForm>
              </>
            ) : null}
          </section>
        </div>
        <aside className="inspector">
          <div className="inspector-block">
            <h2 className="section-title">Контакты</h2>
            <p>{person.phone || "Телефон не указан"}</p>
            <p>{person.email || "Почта не указана"}</p>
            <p className="meta">Источник: {sourceLabel(person.source)}</p>
          </div>
          <div className="inspector-block" id="follow-up">
            <h2 className="section-title">Дальше</h2>
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
          </div>
          <div className="inspector-block">
            <h2 className="section-title">Роли</h2>
            <div className="chips">
              {roles.map((role) => <span key={role.role} className="chip">{role.label || role.role}</span>)}
              {roles.length === 0 ? <span className="meta">Роль не указана</span> : null}
            </div>
            {result.data.crm_available ? (
              <PendingForm action={`/api/people/${person.id}/roles`}>
                <div className="chips">
                  {ROLE_OPTIONS.filter(([value]) => !heldRoles.has(value)).map(([value, label]) => (
                    <button key={value} className="chip" type="submit" name="role" value={value}>+ {label}</button>
                  ))}
                </div>
              </PendingForm>
            ) : null}
          </div>
          <div className="inspector-block">
            <h2 className="section-title">Компания</h2>
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
          </div>
          <div className="inspector-block" id="match">
            <h2 className="section-title">Покупатель</h2>
            <PersonMatch personId={person.id} view={matchView} />
          </div>
          <div className="inspector-block">
            <h2 className="section-title">Ответственный</h2>
            {result.data.links_available ? (
              <AssigneeControl action={`/api/people/${person.id}/assignee`} assigneeId={assigneeId} staff={staff} selfEmail={session.email} />
            ) : (
              <p className="meta">Назначение появится после миграции связи</p>
            )}
          </div>
        </aside>
      </div>
    </>
  )
}
