import Link from "next/link"
import { AssigneeControl } from "@/components/assignee-control"
import { Avatar } from "@/components/object-row"
import { Card, EmptyState, ErrorBlock, ObjectHeader } from "@/components/page"
import { FollowUpForm } from "@/components/follow-up-form"
import { PendingForm } from "@/components/pending-form"
import { ResultToast } from "@/components/result-toast"
import { SidePanel } from "@/components/side-panel"
import { StateBadge, Status } from "@/components/status"
import { Timeline } from "@/components/timeline"
import { ageLabel } from "@/lib/format"
import { nextRequestAction, REQUEST_STAGES, requestState } from "@/lib/person-presentation"
import { loadCompanies, loadLeads, loadPeople, loadPerson, loadRequests } from "@/server/loaders"
import { requireSession } from "@/server/session"

export default async function RequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ saved?: string; error?: string; note?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const [requests, leads, session, companiesResult, peopleResult] = await Promise.all([
    loadRequests(),
    loadLeads(),
    requireSession(),
    loadCompanies(),
    loadPeople(),
  ])
  if (!requests.ok) return <><ObjectHeader back="Клиенты · Заявки" backHref="/clients?mode=requests" title="Заявка" /><ErrorBlock message={requests.message} /></>
  const request = requests.data.bespoke_requests.find((row) => row.id === id)
  if (!request) return <><ObjectHeader back="Клиенты · Заявки" backHref="/clients?mode=requests" title="Заявка" /><EmptyState title="Заявка не найдена" /></>
  const lead = leads.ok ? leads.data.leads.find((row) => row.id === request.lead_id) : undefined
  const person = lead ? await loadPerson(lead.id) : null
  const staff = person?.ok ? (person.data.staff as Array<{ id: string; email: string | null }>) : []
  const assigneeId = person?.ok ? person.data.link?.assignee_id ?? null : null
  const assignee = staff.find((member) => member.id === assigneeId) ?? null
  const state = requestState(request.status)
  const stageIndex = REQUEST_STAGES.findIndex((stage) => stage.id === request.status)
  const nextStage = stageIndex >= 0 ? REQUEST_STAGES[stageIndex + 1] ?? null : null
  const note = query.note ?? (request.internal_notes as string | null | undefined) ?? ""

  return (
    <>
      <ObjectHeader
        back="Клиенты · Заявки"
        backHref="/clients?mode=requests"
        title={`Заявка · ${lead?.name || "Без имени"}`}
        meta={[lead?.phone, lead?.email, lead?.source ? `источник: ${lead.source}` : null, `${ageLabel(request.created_at)} назад`].filter(Boolean).join(" · ")}
        states={
          <>
            <StateBadge size="lg" state={state} />
            <Status tone={assigneeId ? "neutral" : "attention"} size="lg">
              Ответственный: {assignee?.email || (assigneeId ? "назначен" : "не назначен")}
            </Status>
          </>
        }
        next={nextRequestAction(request.status)}
        primary={
          request.status === "completed" ? null : (
            <SidePanel trigger={request.status === "new" ? "Связаться" : "Записать результат"} title="Результат и этап">
              <p className="meta">{lead?.phone || "телефон не указан"} · {lead?.email || "почта не указана"}</p>
              <PendingForm action={`/api/requests/${request.id}`} className="stack">
                <label className="field">
                  <span>Заметка команде</span>
                  <textarea name="internal_notes" rows={4} defaultValue={note} placeholder="Дозвонились, договорились о…" />
                </label>
                <label className="field">
                  <span>Перевести на этап</span>
                  <select name="status" defaultValue={nextStage?.id ?? request.status}>
                    {REQUEST_STAGES.map((stage) => (
                      <option key={stage.id} value={stage.id}>{stage.label}</option>
                    ))}
                  </select>
                </label>
                <button className="btn btn-primary full" type="submit">Сохранить результат</button>
                <p className="meta">Сохраняется на сервере. Это заметка команде, не письмо клиенту</p>
              </PendingForm>
            </SidePanel>
          )
        }
        secondary={
          <>
            {lead ? <Link className="btn btn-ghost" href={`/people/${lead.id}`}>Открыть человека</Link> : null}
            {lead?.phone ? <a className="btn btn-ghost" href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`}>Позвонить</a> : null}
          </>
        }
      />
      <ResultToast saved={query.saved} error={query.error} />
      <div className="two-col">
        <div className="stack-lg">
          <Card title="Этап">
            <div className="mode-tabs" aria-label="Этапы заявки">
              {REQUEST_STAGES.map((stage) => (
                <span key={stage.id} className={stage.id === request.status ? "status lg neutral" : "meta"} style={{ padding: "4px 8px" }} aria-current={stage.id === request.status ? "step" : undefined}>
                  {stage.id === request.status ? "● " : ""}{stage.label}
                </span>
              ))}
            </div>
          </Card>
          <Card title="Что просит клиент">
            <p>{request.comment || "Комментария нет"}</p>
            {request.internal_notes ? (
              <div className="internal-note">
                <span className="meta">Заметка команде</span>
                <p>{String(request.internal_notes)}</p>
              </div>
            ) : null}
          </Card>
          <Card title="Напомнить">
            <FollowUpForm action="/api/follow-ups" back={`/requests/${request.id}`} entityType="request" entityId={request.id} />
          </Card>
          <Card title="История">
            <Timeline
              items={[
                { id: "created", at: request.created_at, kind: "Заявка", text: "Заявка создана с сайта", detail: lead?.source || null },
                ...(request.internal_notes ? [{ id: "note", at: (request as { updated_at?: string | null }).updated_at ?? request.created_at, kind: "Заметка команде", text: String(request.internal_notes), internal: true }] : []),
              ]}
              empty="Событий пока нет"
            />
          </Card>
        </div>
        <aside className="stack-lg context">
          <Card title="Человек">
            {lead ? (
              <Link href={`/people/${lead.id}`} className="row" style={{ textDecoration: "none" }}>
                <Avatar name={lead.name} />
                <div className="object-row-main">
                  <span className="object-row-title">{lead.name || "Без имени"} ›</span>
                  <span className="object-row-meta">{lead.email || lead.phone || "контакт не указан"}</span>
                </div>
              </Link>
            ) : (
              <p className="meta">Человек не найден</p>
            )}
          </Card>
          <Card title="Компания и второй человек">
            <PendingForm action={`/api/requests/${request.id}/relations`} className="stack">
              {companiesResult.ok ? (
                <label className="field">
                  <span>Компания</span>
                  <select name="company_id" defaultValue={(request as { company_id?: string | null }).company_id ?? ""}>
                    <option value="">Не связана</option>
                    {(() => {
                      const current = (request as { company_id?: string | null }).company_id
                      const rows = companiesResult.data.companies
                      const known = current && rows.some((company) => company.id === current)
                      return (
                        <>
                          {current && !known ? <option value={current}>Текущая связь</option> : null}
                          {rows.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                        </>
                      )
                    })()}
                  </select>
                </label>
              ) : (
                <p className="meta">Список компаний не загрузился. Текущая связь не меняется</p>
              )}
              {peopleResult.ok ? (
                <label className="field">
                  <span>Второй человек</span>
                  <select name="counterparty_lead_id" defaultValue={(request as { counterparty_lead_id?: string | null }).counterparty_lead_id ?? ""}>
                    <option value="">Не указан</option>
                    {(() => {
                      const current = (request as { counterparty_lead_id?: string | null }).counterparty_lead_id
                      const rows = peopleResult.data.people.filter((row) => row.id !== lead?.id)
                      const known = current && rows.some((row) => row.id === current)
                      return (
                        <>
                          {current && !known ? <option value={current}>Текущая связь</option> : null}
                          {rows.map((row) => <option key={row.id} value={row.id}>{row.name || "Без имени"}</option>)}
                        </>
                      )
                    })()}
                  </select>
                </label>
              ) : (
                <p className="meta">Список людей не загрузился. Текущая связь не меняется</p>
              )}
              {companiesResult.ok || peopleResult.ok ? <button className="btn btn-secondary sm" type="submit">Сохранить связь</button> : null}
            </PendingForm>
            <p className="meta">Дизайнер - роль человека, не отдельный покупатель. Заказы не копируются</p>
          </Card>
          <Card title="Ответственный">
            {lead && person?.ok && person.data.links_available ? (
              <AssigneeControl action={`/api/people/${lead.id}/assignee`} assigneeId={assigneeId} staff={staff} selfEmail={session.email} />
            ) : (
              <p className="meta">Назначение появится после миграции связи</p>
            )}
          </Card>
        </aside>
      </div>
    </>
  )
}
