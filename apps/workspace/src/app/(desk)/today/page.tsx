import Link from "next/link"
import { EventIcon, todayIcon } from "@/components/event-icon"
import { EmptyState, ErrorBlock, PageHeader } from "@/components/page"
import { StateBadge } from "@/components/status"
import { mailRowsToInbox, todayMailThreads } from "@/lib/mail-presentation"
import { ATTENTION_LINKS, groupInbox, queueState, type InboxItem } from "@/lib/today-presentation"
import { loadMailQueue, loadMailStatus, loadToday } from "@/server/loaders"

/**
 * Action inbox, not a dashboard. Every row: what happened (title + reason),
 * which object, and one action that leads straight into the object's state.
 */
export default async function TodayPage() {
  const [result, mailStatus] = await Promise.all([loadToday(), loadMailStatus()])
  const mailVisible = mailStatus.ok && mailStatus.data.visible
  const mail = mailVisible ? await loadMailQueue() : null
  const inbox: InboxItem[] = result.ok
    ? [...result.data.inbox, ...mailRowsToInbox(todayMailThreads(mailVisible, mail?.ok ? mail.data.threads : []))]
    : []
  const groups = result.ok ? groupInbox(inbox) : []
  const total = inbox.length
  const overdue = inbox.filter((item) => item.overdue).length
  return (
    <>
      <PageHeader
        kicker="Сегодня"
        title="Что сделать"
        lead={result.ok ? (total === 0 ? "Очередь пустая" : `${overdue} срочных · ${total - overdue} обычных`) : undefined}
      />
      {!result.ok ? <ErrorBlock message={result.message} /> : null}
      {result.ok ? (
        <>
          {result.data.follow_ups_truncated ? <p className="meta">Показаны 50 ближайших напоминаний</p> : null}
          <div className="attention-links" aria-label="Срезы">
            {ATTENTION_LINKS.filter((link) => (result.data.attention[link.key] ?? 0) > 0).map((link) => (
              <Link key={link.key} href={link.href}>
                <b>{result.data.attention[link.key]}</b>
                {link.label}
              </Link>
            ))}
          </div>
          {groups.length === 0 ? (
            <EmptyState title="На сегодня ничего срочного" hint="Новые заявки и проблемы каталога появятся здесь" href="/clients?mode=requests" linkLabel="Открыть заявки" />
          ) : null}
          {groups.map((group) => (
            <section key={group.id} className="queue-group">
              <div className="queue-group-title">
                <h2 className="section-title">{group.title}</h2>
                <span className="meta">{group.items.length}</span>
              </div>
              <div className="list">
                {group.items.map((item) => {
                  const state = queueState(item)
                  return (
                    <div key={item.id} className="queue-item">
                      <span className="timeline-mark" aria-hidden="true"><EventIcon name={todayIcon(item.kind)} /></span>
                      <div className="object-row-main">
                        <Link href={item.href} className="object-row-title" style={{ textDecoration: "none" }}>
                          {item.title}
                        </Link>
                        <span className="object-row-meta">{item.hint}</span>
                      </div>
                      <div className="object-row-end">
                        <StateBadge state={state} />
                        <Link className="btn btn-secondary sm row-open" href={item.href}>
                          {item.action}
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </>
      ) : null}
    </>
  )
}
