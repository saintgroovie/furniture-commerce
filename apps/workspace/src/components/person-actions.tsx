"use client"

import { useId, useRef } from "react"
import { PendingForm } from "@/components/pending-form"
import { Status } from "@/components/status"
import type { PersonMatchView } from "@/lib/person-presentation"

/**
 * Customer link. Safety semantics kept from Phase B: one confirmable candidate
 * may be offered behind a confirmation, several candidates need an explicit
 * «Это он», nothing links automatically, unlink is a consequential action.
 */
export function PersonMatch({ personId, view }: { personId: string; view: PersonMatchView }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const unlinkRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const unlinkTitleId = useId()

  if (view.kind === "unavailable") {
    return <p className="meta">Назначить и связать можно после миграции связи. Сейчас это только просмотр</p>
  }
  if (view.kind === "linked") {
    return (
      <div className="stack">
        <Status tone="positive" size="lg">Покупатель связан явно</Status>
        <p className="meta">{view.customer_id}</p>
        <button className="btn btn-danger sm" type="button" onClick={() => unlinkRef.current?.showModal()}>
          Убрать связь
        </button>
        <dialog ref={unlinkRef} className="modal" aria-labelledby={unlinkTitleId}>
          <div className="stack">
            <h2 className="section-title" id={unlinkTitleId}>Убрать связь с покупателем?</h2>
            <p className="meta">Заказы покупателя перестанут показываться у этого человека. Данные покупателя не удаляются</p>
            <PendingForm action={`/api/people/${personId}/link`} className="row">
              <input type="hidden" name="unlink" value="1" />
              <button className="btn btn-danger" type="submit">Убрать связь</button>
              <button className="btn btn-secondary" type="button" onClick={() => unlinkRef.current?.close()}>Отмена</button>
            </PendingForm>
          </div>
        </dialog>
      </div>
    )
  }
  if (view.kind === "incomplete") {
    return <Status tone="waiting" size="lg">Проверка совпадений неполная. Связь вручную не предлагается</Status>
  }
  if (view.kind === "ambiguous") {
    return (
      <div className="stack">
        <Status tone="critical" size="lg">Нужно проверить связь</Status>
        <p className="meta">Найдено покупателей: {view.candidates.length}. Автоматически не объединяем. Выберите нужного или оставьте без связи</p>
        {view.candidates.map((candidate) => (
          <div key={candidate.id} className="row" style={{ padding: 10, border: "1px solid var(--stroke)", borderRadius: 8 }}>
            <div className="object-row-main">
              <span className="object-row-title">{candidate.email || "почта не указана"}</span>
              <span className="object-row-meta">{candidate.phone || "телефон не указан"} · {candidate.id}</span>
            </div>
            <PendingForm action={`/api/people/${personId}/link`}>
              <input type="hidden" name="customer_id" value={candidate.id} />
              <button className="btn btn-secondary sm" type="submit">Это он</button>
            </PendingForm>
          </div>
        ))}
      </div>
    )
  }
  if (view.kind === "candidate") {
    return (
      <div className="stack">
        <Status tone="attention" size="lg">Есть одно совпадение</Status>
        <p className="meta">{view.candidate.email || view.candidate.phone || view.candidate.id}</p>
        <button className="btn btn-primary" type="button" onClick={() => dialogRef.current?.showModal()}>
          Связать с покупателем
        </button>
        <dialog ref={dialogRef} className="modal" aria-labelledby={titleId}>
          <div className="stack">
            <h2 className="section-title" id={titleId}>Связать человека с покупателем</h2>
            <p className="meta">Связь сохранится явно. Автоматического слияния нет</p>
            <PendingForm action={`/api/people/${personId}/link`} className="row">
              <input type="hidden" name="customer_id" value={view.candidate.id} />
              <button className="btn btn-primary" type="submit">Сохранить связь</button>
              <button className="btn btn-secondary" type="button" onClick={() => dialogRef.current?.close()}>Отмена</button>
            </PendingForm>
          </div>
        </dialog>
      </div>
    )
  }
  return <Status tone="neutral" size="lg">Покупатель не связан. Совпадений в магазине нет</Status>
}
