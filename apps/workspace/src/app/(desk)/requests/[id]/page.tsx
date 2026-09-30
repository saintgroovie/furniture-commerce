import Link from "next/link"
import { ErrorBlock, PageHeader } from "@/components/page"
import { requestStatusLabel } from "@/lib/format"
import { loadLeads, loadRequests } from "@/server/loaders"

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [requests, leads] = await Promise.all([loadRequests(), loadLeads()])
  if (!requests.ok) return <><PageHeader title="Заявка" /><ErrorBlock message={requests.message} /></>
  const request = requests.data.bespoke_requests.find((row) => row.id === id)
  if (!request) return <><PageHeader title="Заявка" /><p className="empty">Заявка не найдена</p></>
  const lead = leads.ok ? leads.data.leads.find((row) => row.id === request.lead_id) : undefined
  return (
    <>
      <PageHeader kicker="Заявка" title={lead?.name || "Без имени"} lead={request.comment || "Без комментария"} />
      <section className="card">
        <p>Статус: {requestStatusLabel(request.status)}</p>
        <p className="muted">Источник: {lead?.source || "не указан"}</p>
        {lead ? <Link href={`/people/${lead.id}`}>Открыть человека</Link> : null}
        <p className="muted">Связанный заказ появится, когда человек будет связан с покупателем</p>
      </section>
    </>
  )
}
