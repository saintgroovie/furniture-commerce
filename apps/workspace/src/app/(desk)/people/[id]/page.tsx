import Link from "next/link"
import { PersonActions } from "@/components/person-actions"
import { ErrorBlock, PageHeader } from "@/components/page"
import { requestStatusLabel } from "@/lib/format"
import { loadPerson } from "@/server/loaders"

export default async function PersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ saved?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const notice = query.saved === "1" ? "Связь сохранена" : query.saved === "0" ? "Связь не сохранилась" : null
  const result = await loadPerson(id)
  if (!result.ok) return <><PageHeader title="Человек" /><ErrorBlock message={result.message} /></>
  const person = result.data.person
  return (
    <>
      <PageHeader kicker="Человек" title={person.name || "Без имени"} lead={person.email || person.phone || "Контакт не указан"} />
      <div className="section-grid">
        <div>
          <section className="card">
            <h2>Заявки</h2>
            {result.data.requests.length === 0 ? <p className="empty">Заявок нет</p> : null}
            <ul>
              {result.data.requests.map((request) => (
                <li key={String(request.id)}>
                  <Link href={`/requests/${String(request.id)}`}>{requestStatusLabel(String(request.status))}</Link>
                  <span className="muted"> {String(request.comment ?? "")}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="card">
            <h2>Заказы</h2>
            {result.data.orders.length === 0 ? <p className="empty">Связанных заказов нет</p> : null}
            <ul>
              {result.data.orders.map((order) => (
                <li key={String(order.id)}>
                  <Link href={`/orders/${String(order.id)}`}>Заказ {String(order.display_id ?? "")}</Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <aside className="card">
          <h2>Связь</h2>
          <p>Источник: {person.source || "не указан"}</p>
          <p className="muted">{person.comment || "Комментария нет"}</p>
          <PersonActions
            personId={person.id}
            suggestion={result.data.suggestion}
            linksAvailable={result.data.links_available}
            linkedCustomerId={result.data.link?.customer_id ?? null}
            notice={notice}
          />
        </aside>
      </div>
    </>
  )
}
