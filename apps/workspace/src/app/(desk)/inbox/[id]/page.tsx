import { redirect } from "next/navigation"
import { MailReply } from "@/components/mail-reply"
import { PendingForm } from "@/components/pending-form"
import { ErrorBlock, ObjectHeader } from "@/components/page"
import { exactEmailCandidates, personBanner } from "@/lib/mail-presentation"
import { loadMailStatus, loadMailThread, loadPeople, loadPerson } from "@/server/loaders"

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const status = await loadMailStatus()
  if (!status.ok || !status.data.visible) redirect("/today")
  const { id } = await params
  const result = await loadMailThread(id)
  if (!result.ok) {
    return (
      <>
        <ObjectHeader back="Входящие" backHref="/inbox" title="Переписка" />
        <ErrorBlock message={result.message} />
      </>
    )
  }
  const thread = result.data.thread
  const sender = result.data.messages.find((message) => message.direction === "inbound")?.sender ?? null
  const people = thread.lead_id ? null : await loadPeople()
  const candidateIds = people?.ok ? exactEmailCandidates(people.data.people, sender) : []
  const banner = personBanner({ leadId: thread.lead_id, candidateIds })
  const person = thread.lead_id ? await loadPerson(thread.lead_id) : null
  const company = person?.ok && person.data.companies.length === 1 ? person.data.companies[0] : null
  const named = people?.ok ? people.data.people.filter((item) => candidateIds.includes(item.id)) : []
  return (
    <>
      <ObjectHeader back="Входящие" backHref="/inbox" title={thread.subject || "Без темы"} meta={thread.mailbox || undefined} />
      <div className="workspace">
        <div className="stack-lg">
          <section className="section">
            <h2 className="section-title">Переписка</h2>
            {result.data.messages.length === 0 ? <p className="meta">В индексе пока нет писем</p> : null}
            <div className="list">
              {result.data.messages.map((message) => (
                <div key={message.id} className="object-row">
                  <div className="object-row-main">
                    <div className="object-row-title">{message.sender || "Без отправителя"}</div>
                    <p className="meta">{message.content_state === "metadata_only" ? "Текст письма подгружается по запросу и не хранится здесь" : message.direction}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="section">
            <MailReply threadId={thread.id} />
          </section>
          <section className="section">
            <h2 className="section-title">Заметка команде</h2>
            {thread.lead_id ? (
              <PendingForm action={`/api/people/${thread.lead_id}/notes`} className="stack">
                <input type="hidden" name="kind" value="note" />
                <input type="hidden" name="back" value={`/inbox/${thread.id}`} />
                <label className="field">
                  <span>Заметка</span>
                  <textarea name="text" required rows={3} />
                </label>
                <button className="btn btn-secondary" type="submit">Сохранить заметку</button>
                <p className="meta">Это запись в карточке человека. Клиент её не получит</p>
              </PendingForm>
            ) : (
              <p className="meta">Сначала свяжите человека. Заметка не отправляется письмом</p>
            )}
          </section>
        </div>
        <aside className="inspector">
          <div className="inspector-block">
            <h2 className="section-title">Человек</h2>
            {banner === "linked" && thread.lead_id ? <a href={`/people/${thread.lead_id}`}>Открыть человека</a> : null}
            {banner === "suggested" && named[0] ? (
              <form className="stack" action={`/api/mail/threads/${thread.id}/link`} method="post">
                <p>Похожий адрес уже есть. Связь не ставится сама</p>
                <input type="hidden" name="lead_id" value={named[0].id} />
                <button className="btn btn-secondary sm" type="submit">Связать с {named[0].name || named[0].email}</button>
              </form>
            ) : null}
            {banner === "unresolved" ? (
              <div className="stack">
                <p>Не связан с клиентом</p>
                <a className="btn btn-secondary sm" href="/clients?mode=people">Найти человека</a>
                <a className="btn btn-secondary sm" href="/clients?mode=people&create=1#new">Создать человека</a>
                <p className="meta">Можно оставить без связи</p>
              </div>
            ) : null}
            {banner === "needs_review" ? (
              <div className="stack">
                <p className="banner waiting">Нужно проверить человека</p>
                {named.map((item) => (
                  <form key={item.id} action={`/api/mail/threads/${thread.id}/link`} method="post">
                    <input type="hidden" name="lead_id" value={item.id} />
                    <button className="btn btn-secondary sm" type="submit">{item.name || item.email}</button>
                  </form>
                ))}
              </div>
            ) : null}
          </div>
          {company ? (
            <div className="inspector-block">
              <h2 className="section-title">Компания</h2>
              <a href={`/companies/${company.id}`}>{company.name}</a>
              <p className="meta">Контекст человека. Переписка к компании сама не привязывается</p>
            </div>
          ) : null}
          <div className="inspector-block">
            <h2 className="section-title">Ответственный</h2>
            <p>{thread.assignee_id ? "Назначен" : "Без ответственного"}</p>
            {thread.lead_id ? <a href={`/people/${thread.lead_id}`}>Следующий шаг в карточке</a> : null}
          </div>
          {thread.request_id ? (
            <div className="inspector-block">
              <h2 className="section-title">Обращение</h2>
              <a href={`/requests/${thread.request_id}`}>Открыть обращение</a>
            </div>
          ) : (
            <div className="inspector-block">
              <h2 className="section-title">Обращение</h2>
              <a href="/clients?mode=requests&create=1#new">Создать обращение</a>
            </div>
          )}
          {thread.order_id ? (
            <div className="inspector-block">
              <h2 className="section-title">Заказ</h2>
              <a href={`/orders/${thread.order_id}`}>Открыть заказ</a>
            </div>
          ) : null}
        </aside>
      </div>
    </>
  )
}
