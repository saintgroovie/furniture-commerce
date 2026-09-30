import Link from "next/link"
import { ErrorBlock, PageHeader } from "@/components/page"
import { loadPeople } from "@/server/loaders"

export default async function PeoplePage() {
  const result = await loadPeople()
  return (
    <>
      <PageHeader kicker="Люди" title="Люди" lead="Один человек. Заявки и заказы остаются своими записями" />
      {!result.ok ? <ErrorBlock message={result.message} /> : null}
      {result.ok && !result.data.links_available ? (
        <p className="banner">Связь с покупателем Medusa появится после отдельной миграции. Список людей уже читается из заявок</p>
      ) : null}
      {result.ok ? (
        <div className="stack">
          {result.data.people.length === 0 ? <p className="empty">Пока никого нет</p> : null}
          {result.data.people.map((person) => (
            <Link key={person.id} href={`/people/${person.id}`} className="row-card">
              <div>
                <h2>{person.name || "Без имени"}</h2>
                <span className="muted">{person.email || person.phone || "Контакт не указан"}</span>
              </div>
              <span className="pill">{person.request_count} заявок</span>
              <span className="muted">{person.customer_id ? "Есть покупатель" : "Покупатель не связан"}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </>
  )
}
