import { Card, EmptyState, ErrorBlock, ModeTabs, PageHeader } from "@/components/page"
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

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ mode?: string; filter?: string }> }) {
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
      {mode === "people" ? <PeopleList filter={params.filter} /> : mode === "requests" ? <RequestsList filter={params.filter} /> : <CompaniesList />}
    </>
  )
}

async function PeopleList({ filter }: { filter?: string }) {
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

async function CompaniesList() {
  const result = await loadCompanies()
  if (!result.ok) return <ErrorBlock message={result.message} />
  return (
    <div className="card">
      {result.data.companies.length === 0 ? <EmptyState title="Компаний пока нет" hint="Они появляются, когда человека связывают со студией или бюро" /> : null}
      {result.data.companies.map((company) => (
        <ObjectRow
          key={company.id}
          href={`/companies/${company.id}`}
          title={company.name}
          meta={[company.type_label, `${company.people_count} человек`].filter(Boolean).join(" · ")}
        />
      ))}
    </div>
  )
}

async function RequestsList({ filter }: { filter?: string }) {
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
