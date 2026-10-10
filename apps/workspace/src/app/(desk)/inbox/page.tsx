import { redirect } from "next/navigation"
import { EmptyState, ErrorBlock, PageHeader } from "@/components/page"
import { MAIL_VIEWS } from "@/lib/mail-presentation"
import { loadMailQueue, loadMailStatus } from "@/server/loaders"

/**
 * Hidden until the backend reports a configured, permitted mailbox.
 * Not linked from navigation while that report is false.
 */
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const status = await loadMailStatus()
  if (!status.ok || !status.data.visible) redirect("/today")
  const params = await searchParams
  const view = MAIL_VIEWS.find((item) => item.id === params.view)?.id ?? "needs_reply"
  const queue = await loadMailQueue(view)
  return (
    <>
      <PageHeader kicker="Почта" title="Входящие" lead="Только то, что ждёт реакции. Папки ящика остаются в почте" />
      <nav className="filters" aria-label="Переписка">
        {MAIL_VIEWS.map((item) => (
          <a key={item.id} href={item.id === "needs_reply" ? "/inbox" : `/inbox?view=${item.id}`} aria-current={view === item.id ? "page" : undefined}>
            {item.label}
          </a>
        ))}
      </nav>
      {!queue.ok ? <ErrorBlock message={queue.message} /> : null}
      {queue.ok && queue.data.threads.length === 0 ? <EmptyState title="Таких писем нет" /> : null}
      {queue.ok ? (
        <div className="list">
          {queue.data.threads.map((thread) => (
            <a key={thread.id} className="object-row" href={`/inbox/${thread.id}`}>
              <span className="object-row-main">
                <span className="object-row-title">{thread.subject || "Без темы"}</span>
                <span className="object-row-meta">{thread.waiting_on === "client" ? "Ждём клиента" : thread.status === "closed" ? "Закрыто" : "Требует ответа"}</span>
              </span>
            </a>
          ))}
        </div>
      ) : null}
    </>
  )
}
