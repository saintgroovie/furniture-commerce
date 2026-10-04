import { EmptyState, ErrorBlock, ModeTabs, PageHeader } from "@/components/page"
import { PendingForm } from "@/components/pending-form"
import { ResultToast } from "@/components/result-toast"
import { Avatar, ObjectRow } from "@/components/object-row"
import { StateBadge, Status } from "@/components/status"
import { ageLabel } from "@/lib/format"
import { personRole, requestState } from "@/lib/person-presentation"
import { loadCompanies, loadLeads, loadPeople, loadRequests } from "@/server/loaders"

const MODES = [
  { id: "requests", label: "Обращения", href: "/clients?mode=requests" },
  { id: "people", label: "Люди", href: "/clients?mode=people" },
  { id: "companies", label: "Компании", href: "/clients?mode=companies" },
]

const TITLES = {
  people: ["Люди", "Покупатели, дизайнеры и их заявки в одном месте"],
  requests: ["Обращения", "Новые и текущие обращения. Заявка остаётся своей записью, человек - своей"],
  companies: ["Компании", "Студии и бюро. Человек остаётся человеком, компания - компанией"],
} as const

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ mode?: string; filter?: string; error?: string; saved?: string; create?: string; name?: string; email?: string; phone?: string; matches?: string }> }) {
  const params = await searchParams
  const mode = params.mode === "people" ? "people" : params.mode === "companies" ? "companies" : "requests"
  const [title, lead] = TITLES[mode]
  return (
    <>
      <PageHeader
        kicker="Продажи"
        title={title}
        lead={lead}
        right={<ModeTabs items={MODES} active={mode} />}
      />
      <ResultToast saved={params.saved} error={params.error} savedLabel="Сохранено" />
      {mode === "people" ? <PeopleList filter={params.filter} creating={params.create === "1" || Boolean(params.error)} draft={params} /> : mode === "requests" ? <RequestsList filter={params.filter} creating={params.create === "1"} /> : <CompaniesList creating={params.create === "1"} />}
    </>
  )
}

async function PeopleList({ filter, creating, draft }: { filter?: string; creating?: boolean; draft?: { name?: string; email?: string; phone?: string; matches?: string } }) {
  const result = await loadPeople()
  if (!result.ok) return <ErrorBlock message={result.message} />
  const people = result.data.people.filter((person) => {
    if (filter === "unlinked") return !person.customer_id
    if (filter === "unassigned") return !person.assignee_id
    return true
  })
  return (
    <>
      <nav className="filters" aria-label="Фильтр людей">
        {[
          ["all", "Все"],
          ["unlinked", "Покупатель не связан"],
          ["unassigned", "Без ответственного"],
        ].map(([id, label]) => (
          <a key={id} href={id === "all" ? "/clients?mode=people" : `/clients?mode=people&filter=${id}`} aria-current={(filter ?? "all") === id ? "page" : undefined}>
            {label}
          </a>
        ))}
      </nav>
      <details className="disclosure" id="new" open={creating}>
        <summary>Новый человек</summary>
        <PendingForm action="/api/people" className="stack">
          {(draft?.matches ?? "").split(",").filter((id) => /^[A-Za-z0-9]+$/.test(id)).map((id) => (
            <a key={id} href={`/people/${id}`}>Открыть существующего</a>
          ))}
          <label className="field"><span>Имя</span><input name="name" required placeholder="Имя и фамилия" defaultValue={draft?.name ?? ""} /></label>
          <div className="field-row">
            <label className="field"><span>Почта</span><input name="email" type="email" placeholder="необязательно" defaultValue={draft?.email ?? ""} /></label>
            <label className="field"><span>Телефон</span><input name="phone" placeholder="необязательно" defaultValue={draft?.phone ?? ""} /></label>
          </div>
          <label className="check">
            <input type="checkbox" name="confirm" value="1" />
            <span>Это другой человек, даже если почта или телефон уже есть</span>
          </label>
          <button className="btn btn-primary sm" type="submit">Создать человека</button>
          <p className="meta">Это человек в продажах, не покупатель магазина. Совпадения не объединяются сами</p>
        </PendingForm>
      </details>
      {!result.data.links_available ? (
        <div className="banner waiting">
          <Status tone="waiting" size="lg">Связь с покупателем пока только просмотр: миграция связи не применялась</Status>
        </div>
      ) : null}
      <div className="card">
        {people.length === 0 ? <EmptyState title="Пока никого нет" hint="Люди появляются из заявок с сайта" /> : null}
        {people.map((person) => (
          <ObjectRow
            key={person.id}
            href={`/people/${person.id}`}
            leading={<Avatar name={person.name} />}
            title={person.name || "Без имени"}
            meta={[personRole(person), person.email || person.phone || "контакт не указан", `${person.request_count} заявок`].join(" · ")}
            end={
              <StateBadge
                state={
                  person.customer_id
                    ? { tone: "positive", label: "Покупатель связан" }
                    : person.match_status === "needs_review"
                      ? { tone: "critical", label: "Нужно проверить связь" }
                      : { tone: "neutral", label: "Покупатель не связан" }
                }
              />
            }
          />
        ))}
      </div>
    </>
  )
}

async function CompaniesList({ creating }: { creating?: boolean }) {
  const result = await loadCompanies()
  if (!result.ok) return <ErrorBlock message={result.message} />
  return (
    <>
    <details className="disclosure" id="new" open={creating}>
      <summary>Новая компания</summary>
      <PendingForm action="/api/companies" className="stack">
        <label className="field"><span>Название</span><input name="name" required placeholder="Название студии или бюро" /></label>
        <label className="field">
          <span>Тип</span>
          <select name="type" defaultValue="">
            <option value="">Не указан</option>
            <option value="design_studio">Дизайн-студия</option>
            <option value="architecture_bureau">Архитектурное бюро</option>
            <option value="partner">Партнёр</option>
            <option value="other">Другое</option>
          </select>
        </label>
        <button className="btn btn-primary sm" type="submit">Создать компанию</button>
      </PendingForm>
    </details>
    <div className="card">
      {result.data.companies.length === 0 ? <EmptyState title="Компаний пока нет" hint="Создайте компанию и свяжите с ней человека" /> : null}
      {result.data.companies.map((company) => (
        <ObjectRow
          key={company.id}
          href={`/companies/${company.id}`}
          title={company.name}
          meta={[company.type_label, `${company.people_count} человек`].filter(Boolean).join(" · ")}
        />
      ))}
    </div>
    </>
  )
}

async function RequestsList({ filter, creating }: { filter?: string; creating?: boolean }) {
  const [requests, leads] = await Promise.all([loadRequests(), loadLeads()])
  if (!requests.ok) return <ErrorBlock message={requests.message} />
  const leadById = new Map((leads.ok ? leads.data.leads : []).map((lead) => [lead.id, lead]))
  const rows = requests.data.bespoke_requests.filter((request) => {
    if (filter === "new") return request.status === "new"
    if (filter === "open") return request.status === "new" || request.status === "contacted"
    if (filter === "waiting") return request.status === "quote_sent"
    if (filter === "overdue") {
      if (request.status !== "new" && request.status !== "contacted") return false
      if (!request.created_at) return false
      return Date.now() - new Date(request.created_at).getTime() > 2 * 60 * 60 * 1000
    }
    if (filter === "done") return request.status === "completed"
    return true
  })
  return (
    <>
      <nav className="filters" aria-label="Фильтр заявок">
        {[
          ["all", "Все"],
          ["new", "Новые"],
          ["open", "Требуют ответа"],
          ["waiting", "Ждём клиента"],
          ["overdue", "Просроченные"],
          ["done", "Завершённые"],
        ].map(([id, label]) => (
          <a key={id} href={id === "all" ? "/clients?mode=requests" : `/clients?mode=requests&filter=${id}`} aria-current={(filter ?? "all") === id ? "page" : undefined}>
            {label}
          </a>
        ))}
      </nav>
      <details className="disclosure" id="new" open={creating}>
        <summary>Новое обращение</summary>
        {leads.ok ? (
          <PendingForm action="/api/requests" className="stack">
            <label className="field">
              <span>Человек</span>
              <select name="lead_id" required defaultValue="">
                <option value="" disabled>Выберите человека</option>
                {leads.data.leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>{lead.name || lead.email || lead.phone || "Без имени"}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>О чём обращение</span>
              <textarea name="comment" rows={3} required placeholder="Что нужно и к какому сроку" />
            </label>
            <button className="btn btn-primary sm" type="submit">Создать обращение</button>
          </PendingForm>
        ) : (
          <p className="meta">Список людей не загрузился, обращение без человека не создаём</p>
        )}
      </details>
      {!leads.ok ? <ErrorBlock message={leads.message} /> : null}
      <div className="card">
        {rows.length === 0 ? <EmptyState title="Заявок в этом срезе нет" /> : null}
        {rows.map((request) => {
          const lead = leadById.get(request.lead_id)
          return (
            <ObjectRow
              key={request.id}
              href={`/requests/${request.id}`}
              leading={<Avatar name={lead?.name} />}
              title={`${lead?.name || "Без имени"} · ${request.comment || "без комментария"}`}
              meta={[lead?.source || "источник не указан", ageLabel(request.created_at)].join(" · ")}
              end={<StateBadge state={requestState(request.status)} />}
            />
          )
        })}
      </div>
    </>
  )
}
