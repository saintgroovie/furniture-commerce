"use client"

import { useState, type FormEvent } from "react"
import { applySendResult } from "@/lib/mail-presentation"

/**
 * Customer reply. A team note is a different form and a different request.
 * The draft stays on the page when the server does not confirm a send.
 */
export function MailReply({ threadId }: { threadId: string }) {
  const [text, setText] = useState("")
  const [phase, setPhase] = useState<"idle" | "sending" | "failed">("idle")
  const view = phase === "idle" ? null : applySendResult(text, phase)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPhase("sending")
    try {
      const response = await fetch(`/api/mail/threads/${threadId}/reply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      })
      if (!response.ok) {
        setPhase("failed")
        return
      }
      setText("")
      setPhase("idle")
    } catch {
      setPhase("failed")
    }
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <h2 className="section-title">Ответить клиенту</h2>
      <p className="meta">Письмо уйдёт только после подтверждения сервера</p>
      <label className="field">
        <span>Текст</span>
        <textarea name="text" value={text} onChange={(event) => setText(event.target.value)} rows={5} required />
      </label>
      <button className="btn btn-primary" type="submit" disabled={phase === "sending"}>
        {view?.label ?? "Ответить клиенту"}
      </button>
      {phase === "failed" ? <p className="banner critical" role="alert">Письмо не отправлено.</p> : null}
    </form>
  )
}
