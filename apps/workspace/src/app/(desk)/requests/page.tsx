import Link from "next/link"
import { ErrorBlock, PageHeader } from "@/components/page"
import { ageLabel, formatWhen } from "@/lib/format"
import { loadLeads, loadRequests } from "@/server/loaders"

const STATUS: Record<string, string> = {
  new: "Новая",
  contacted: "Связались",
  quote_sent: "Расчёт отправлен",
  paid: "Оплачено",
  in_production: "В производстве",
  completed: "Завершена",
}

export default async function RequestsPage() {
  const [requests, leads] = await Promise.all([loadRequests(), loadLeads()])
  if (!requests.ok) return <><PageHeader title="Заявки" /><ErrorBlock message={requests.message} /></>
  const leadById = new Map((leads.ok ? leads.data.leads : []).map((lead) => [lead.id, lead]))
  return (
    <>
      <PageHeader kicker="Заявки" title="Заявки" lead="По проекту, в тех же статусах, что и раньше" />
      {!leads.ok ? <ErrorBlock message={leads.message} /> : null}
      <div className="stack">
        {requests.data.bespoke_requests.length === 0 ? <p className="empty">Заявок пока нет</p> : null}
        {requests.data.bespoke_requests.map((request) => {
          const lead = leadById.get(request.lead_id)
          return (
            <Link key={request.id} href={`/requests/${request.id}`} className="row-card">
              <div>
                <h2>{lead?.name || "Без имени"}</h2>
                <span className="muted">{request.comment || "Без комментария"}</span>
              </div>
              <div className="pills">
                <span className="pill">{STATUS[request.status] ?? request.status}</span>
                <span className="pill">{lead?.source || "источник не указан"}</span>
              </div>
              <span className="muted">{ageLabel(request.created_at)} · {formatWhen(request.created_at)}</span>
            </Link>
          )
        })}
      </div>
    </>
  )
}
