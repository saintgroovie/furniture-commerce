"use client"

import { useState, type FormEvent, type ReactNode } from "react"

/**
 * Plain HTML form to a desk API route. The page reloads with the server result,
 * so there is no optimistic state: the form only tells «Сохраняем…» while the
 * request is in flight and ignores a second submit.
 *
 * Note: controls are NOT disabled here on purpose - a disabled fieldset drops
 * its fields from the submitted form data (hidden `expected_version` included).
 * Double-submit protection is the `pending` guard + CSS on `data-pending`.
 */
export function PendingForm({
  action,
  method = "post",
  className,
  children,
  encType,
  hidden,
}: {
  action: string
  method?: "post"
  className?: string
  children: ReactNode
  encType?: string
  hidden?: boolean
}) {
  const [pending, setPending] = useState(false)
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (pending) {
      event.preventDefault()
      return
    }
    setPending(true)
  }
  return (
    <form action={action} method={method} className={className} encType={encType} hidden={hidden} onSubmit={onSubmit} data-pending={pending ? "1" : undefined}>
      {children}
      {pending ? <p className="meta" role="status">Сохраняем…</p> : null}
    </form>
  )
}
