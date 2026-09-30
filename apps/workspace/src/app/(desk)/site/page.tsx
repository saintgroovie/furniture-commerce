import { ErrorBlock, PageHeader } from "@/components/page"
import { loadContacts } from "@/server/loaders"

export default async function SitePage() {
  const result = await loadContacts()
  return (
    <>
      <PageHeader kicker="Сайт" title="Контакты" lead="Черновик телефонов и мессенджеров. На витрину сам не выходит" />
      {!result.ok ? <ErrorBlock message={result.message} /> : null}
      {result.ok ? (
        <section className="card">
          <p>{result.data.live ? "Уже на витрине" : "Ещё не на витрине"}</p>
          <p className="muted">{result.data.message || (result.data.configured ? "Черновик сохранён" : "Черновик пуст")}</p>
          {result.data.contacts ? (
            <ul>
              <li>Бесплатный звонок: {result.data.contacts.free_call.display}</li>
              <li>Написать или позвонить: {result.data.contacts.write_or_call.display}</li>
            </ul>
          ) : (
            <p className="empty">Полей пока нет</p>
          )}
        </section>
      ) : null}
    </>
  )
}
