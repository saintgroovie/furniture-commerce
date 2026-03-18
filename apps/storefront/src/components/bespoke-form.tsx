"use client"

import { useState, useRef } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { createLead } from "@/lib/api/leads"
import { createBespokeRequest } from "@/lib/api/bespoke-requests"

export function BespokeForm() {
  const searchParams = useSearchParams()
  const productId = searchParams.get("product_id") ?? undefined
  const roomSetId = searchParams.get("room_set_id") ?? undefined

  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error_validation" | "error_server">("idle")
  const [errorMessage, setErrorMessage] = useState<string>("")
  const submittingRef = useRef(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (submittingRef.current) return
    const form = e.currentTarget
    const email = (form.elements.namedItem("email") as HTMLInputElement)?.value?.trim() ?? ""
    const name = (form.elements.namedItem("name") as HTMLInputElement)?.value?.trim() ?? ""
    const phone = (form.elements.namedItem("phone") as HTMLInputElement)?.value?.trim() ?? ""
    const comment = (form.elements.namedItem("comment") as HTMLTextAreaElement)?.value?.trim() ?? ""

    if (!email) {
      setStatus("error_validation")
      setErrorMessage("Укажите email.")
      return
    }
    submittingRef.current = true
    setStatus("submitting")
    setErrorMessage("")
    try {
      const leadRes = await createLead({
        source: roomSetId ? "room_adapt" : "bespoke",
        name: name || null,
        email: email || null,
        phone: phone || null,
        comment: comment || null,
      })
      const leadId = (leadRes.lead as { id?: string })?.id
      if (!leadId) throw new Error("No lead id")
      await createBespokeRequest({
        lead_id: leadId,
        product_id: productId ?? null,
        room_set_id: roomSetId ?? null,
        comment: comment || null,
      })
      setStatus("success")
    } catch (e) {
      setStatus("error_server")
      setErrorMessage(e instanceof Error ? e.message : "Ошибка отправки. Попробуйте позже.")
    } finally {
      submittingRef.current = false
    }
  }

  if (status === "success") {
    return (
      <div data-state="success" className="status-message">
        <h2>Заявка отправлена</h2>
        <p>Менеджер свяжется с вами.</p>
        <div className="nav-links nav-links-center">
          <Link href="/bespoke">На заказ</Link>
          <Link href="/catalog">В каталог</Link>
          <Link href="/">На главную</Link>
        </div>
      </div>
    )
  }

  const dataState =
    status === "submitting" ? "submitting" :
    status === "error_validation" ? "error_validation" :
    status === "error_server" ? "error_server" :
    "idle"

  return (
    <form
      onSubmit={handleSubmit}
      data-state={dataState}
      className="form-stack"
    >
      {productId && <input type="hidden" name="product_id" value={productId} />}
      {roomSetId && <input type="hidden" name="room_set_id" value={roomSetId} />}

      <div className="form-field">
        <label htmlFor="bespoke-name">Имя</label>
        <input id="bespoke-name" name="name" type="text" />
      </div>
      <div className="form-field">
        <label htmlFor="bespoke-email">Email *</label>
        <input id="bespoke-email" name="email" type="email" required />
      </div>
      <div className="form-field">
        <label htmlFor="bespoke-phone">Телефон</label>
        <input id="bespoke-phone" name="phone" type="tel" />
      </div>
      <div className="form-field">
        <label htmlFor="bespoke-comment">Комментарий</label>
        <textarea id="bespoke-comment" name="comment" rows={3} />
      </div>

      <button type="submit" disabled={status === "submitting"} className="btn btn-primary">
        {status === "submitting" ? "Отправка заявки…" : "Отправить заявку"}
      </button>

      {(status === "error_validation" || status === "error_server") && (
        <p className="feedback-error" role="alert">{errorMessage}</p>
      )}
    </form>
  )
}
