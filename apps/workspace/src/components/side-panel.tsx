"use client"

import { useId, useRef, type ReactNode } from "react"

/**
 * Contextual side panel for short actions (stage, assignee, link, note).
 * Native <dialog>.showModal(): focus is trapped, Esc closes, focus returns to
 * the trigger on close. Full product editing never lives here.
 */
export function SidePanel({
  trigger,
  triggerClassName = "btn btn-primary",
  title,
  children,
}: {
  trigger: ReactNode
  triggerClassName?: string
  title: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => ref.current?.showModal()}>
        {trigger}
      </button>
      <dialog
        ref={ref}
        className="panel"
        aria-labelledby={titleId}
        onMouseDown={(event) => {
          if (event.target === ref.current) ref.current?.close()
        }}
      >
        <div className="panel-head">
          <h2 className="section-title" id={titleId}>
            {title}
          </h2>
          <button type="button" className="btn btn-ghost sm" onClick={() => ref.current?.close()}>
            Закрыть
          </button>
        </div>
        <div className="panel-body">{children}</div>
      </dialog>
    </>
  )
}
