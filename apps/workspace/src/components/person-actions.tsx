"use client"

import { useId, useRef } from "react"

export function PersonActions({
  personId,
  suggestion,
  linksAvailable,
  linkedCustomerId,
  notice,
}: {
  personId: string
  suggestion: {
    status: string
    customer_ids: string[]
    candidates?: Array<{ id: string; email: string | null; phone: string | null }>
    lookup_incomplete?: boolean
  }
  linksAvailable: boolean
  linkedCustomerId?: string | null
  notice: string | null
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const candidates = suggestion.candidates?.length
    ? suggestion.candidates
    : suggestion.customer_ids.map((id) => ({ id, email: null, phone: null }))
  if (!linksAvailable) {
    return (
      <>
        {notice ? <p className="toast" role="status">{notice}</p> : null}
        <p className="muted">Назначить и связать можно после миграции связи. Сейчас это только просмотр</p>
      </>
    )
  }
  if (linkedCustomerId) {
    return (
      <>
        {notice ? <p className="toast" role="status">{notice}</p> : null}
        <p>Покупатель связан явно</p>
        <form action={`/api/people/${personId}/link`} method="post">
          <input type="hidden" name="unlink" value="1" />
          <button className="ghost" type="submit">Убрать связь</button>
        </form>
      </>
    )
  }
  if (suggestion.lookup_incomplete) {
    return (
      <p className="pill warn">Проверка совпадений неполная. Связь вручную не предлагается</p>
    )
  }
  if (suggestion.status === "needs_review") {
    return (
      <>
        <p className="pill warn">Нужна проверка. Автоматической связи нет: совпадений {candidates.length}</p>
        <div className="stack">
          {candidates.map((candidate) => (
            <form key={candidate.id} action={`/api/people/${personId}/link`} method="post">
              <input type="hidden" name="customer_id" value={candidate.id} />
              <button className="primary" type="submit">
                Связать с {candidate.email || candidate.phone || "покупателем"}
              </button>
            </form>
          ))}
        </div>
      </>
    )
  }
  if (suggestion.status !== "candidate" || suggestion.customer_ids.length !== 1) {
    return <p className="muted">Не назначен</p>
  }
  return (
    <>
      {notice ? <p className="toast" role="status">{notice}</p> : null}
      <button className="primary" type="button" onClick={() => dialogRef.current?.showModal()}>
        Связать с покупателем
      </button>
      <dialog ref={dialogRef} className="modal" aria-labelledby={titleId}>
        <h2 id={titleId}>Связать человека</h2>
        <p>Связь с покупателем Medusa сохранится явно. Автоматического слияния нет</p>
        <form action={`/api/people/${personId}/link`} method="post">
          <input type="hidden" name="customer_id" value={suggestion.customer_ids[0]} />
          <div className="filters">
            <button className="primary" type="submit">Сохранить связь</button>
            <button className="ghost" type="button" onClick={() => dialogRef.current?.close()}>
              Отмена
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
