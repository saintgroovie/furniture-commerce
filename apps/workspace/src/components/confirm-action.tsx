"use client"

import { useId, useRef, type ReactNode } from "react"
import { PendingForm } from "@/components/pending-form"

/**
 * Consequential write behind a native confirmation dialog (unpublish, remove
 * promo). The form is submitted only after the explicit confirm click.
 */
export function ConfirmAction({
  action,
  fields,
  trigger,
  triggerClassName = "btn btn-danger",
  title,
  text,
  confirmLabel,
  children,
}: {
  action: string
  fields: Record<string, string>
  trigger: ReactNode
  triggerClassName?: string
  title: string
  text: string
  confirmLabel: string
  children?: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => ref.current?.showModal()}>
        {trigger}
      </button>
      <dialog ref={ref} className="modal" aria-labelledby={titleId}>
        <div className="stack">
          <h2 className="section-title" id={titleId}>{title}</h2>
          <p className="meta">{text}</p>
          {children}
          <PendingForm action={action} className="row">
            {Object.entries(fields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <button className="btn btn-danger" type="submit">{confirmLabel}</button>
            <button className="btn btn-secondary" type="button" onClick={() => ref.current?.close()}>Отмена</button>
          </PendingForm>
        </div>
      </dialog>
    </>
  )
}
