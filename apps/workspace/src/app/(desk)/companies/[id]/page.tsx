import Link from "next/link"
import { FollowUpForm } from "@/components/follow-up-form"
import { PendingForm } from "@/components/pending-form"
import { Avatar, ObjectRow } from "@/components/object-row"
import { Card, EmptyState, ErrorBlock, ObjectHeader } from "@/components/page"
import { ResultToast } from "@/components/result-toast"
import { StateBadge } from "@/components/status"
import { Timeline } from "@/components/timeline"
import { requestState } from "@/lib/person-presentation"
import { loadCompany } from "@/server/loaders"

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ saved?: string; error?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const result = await loadCompany(id)
  if (!result.ok) return <><ObjectHeader back="Клиенты · Компании" backHref="/clients?mode=companies" title="Компания" /><ErrorBlock message={result.message} /></>
  const company = result.data.company
  const people = result.data.people
  const requests = result.data.requests.filter((request) => request.status !== "completed")
  return (
    <>
      <ObjectHeader
        back="Клиенты · Компании"
        backHref="/clients?mode=companies"
        title={company.name}
        meta={[company.type_label, `${people.length} человек`].filter(Boolean).join(" · ")}
      />
      <ResultToast saved={query.saved} error={query.error} savedLabel="Сохранено" />
      <div className="two-col">
        <div className="stack-lg">
          <Card title="Люди">
            {people.length === 0 ? <EmptyState title="Пока никого нет" /> : null}
            <div className="list">
              {people.map((person) => (
                <ObjectRow
                  key={person.id}
                  href={`/people/${person.id}`}
                  leading={<Avatar name={person.name} />}
                  title={person.name || "Без имени"}
                  meta={person.email || person.phone || "контакт не указан"}
                />
              ))}
            </div>
          </Card>
          <Card title="Заявки">
            {requests.length === 0 ? <EmptyState title="Активных заявок нет" /> : null}
            <div className="list">
              {requests.map((request) => (
                <ObjectRow
                  key={request.id}
                  href={`/requests/${request.id}`}
                  title={request.comment || "Заявка"}
                  meta="Открыть заявку"
                  end={<StateBadge state={requestState(request.status)} />}
                />
              ))}
            </div>
            {result.data.order_ids.length > 0 ? (
              <p className="meta">Связанные заказы: {result.data.order_ids.length}. Сами заказы остаются в разделе Заказы</p>
            ) : null}
          </Card>
          <Card title="История">
            <Timeline
              items={result.data.activity.map((item) => ({ id: item.id, at: item.at, kind: "Событие", text: item.text }))}
              empty="Событий пока нет"
            />
          </Card>
        </div>
        <aside className="stack-lg context">
          {company.internal_note ? (
            <Card title="Заметка">
              <p>{company.internal_note}</p>
            </Card>
          ) : null}
          <Card title="Напомнить">
            {result.data.follow_ups.filter((item) => item.status === "open").map((item) => (
              <div key={item.id} className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <div>{item.summary || "Напоминание"}</div>
                  <span className="meta">{item.due_at ? new Date(item.due_at).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" }) : ""}</span>
                </div>
                <PendingForm action={`/api/follow-ups/${item.id}`}>
                  <input type="hidden" name="back" value={`/companies/${company.id}`} />
                  <input type="hidden" name="status" value="done" />
                  <button className="btn btn-ghost sm" type="submit">Готово</button>
                </PendingForm>
              </div>
            ))}
            <FollowUpForm action="/api/follow-ups" back={`/companies/${company.id}`} entityType="company" entityId={company.id} />
          </Card>
          <p className="meta">
            <Link href="/clients?mode=people">К людям</Link>
          </p>
        </aside>
      </div>
    </>
  )
}
