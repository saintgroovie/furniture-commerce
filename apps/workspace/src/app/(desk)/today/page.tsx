import Link from "next/link"
import { ErrorBlock, PageHeader } from "@/components/page"
import { loadToday } from "@/server/loaders"

export default async function TodayPage() {
  const result = await loadToday()
  return (
    <>
      <PageHeader kicker="Сегодня" title="Что сделать" lead="Очередь дел, не сводка ради сводки" />
      {!result.ok ? <ErrorBlock message={result.message} /> : null}
      {result.ok ? (
        <>
          <div className="stats">
            <Link className="stat" href="/requests"><b>{result.data.attention.open_requests}</b><span>Новые заявки</span></Link>
            <Link className="stat" href="/catalog?filter=missing_price"><b>{result.data.attention.missing_price}</b><span>Нет цены</span></Link>
            <Link className="stat" href="/orders?filter=waiting"><b>{result.data.attention.waiting_customer}</b><span>Ждут клиента</span></Link>
            <Link className="stat" href="/media"><b>{result.data.attention.missing_media}</b><span>Нет кадра</span></Link>
          </div>
          <div className="stack">
            {result.data.inbox.length === 0 ? <p className="empty">Очередь пустая</p> : null}
            {result.data.inbox.map((item) => (
              <Link key={item.id} href={item.href} className="row-card">
                <div>
                  <h2>{item.title}</h2>
                  <span className="muted">{item.hint}</span>
                </div>
                <span className={item.overdue ? "pill warn" : "pill"}>{item.overdue ? "Просрочено" : "На сегодня"}</span>
                <span>{item.action}</span>
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </>
  )
}
