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
    const comment = (form.elements.namedItem("comment") as HTMLInputElement)?.value?.trim() ?? ""

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
      <div data-state="success">
        <p>Заявка отправлена. Менеджер свяжется с вами.</p>
        <p>
          <Link href="/catalog">В каталог</Link>, <Link href="/rooms">в комнаты</Link>, <Link href="/">на главную</Link>.
        </p>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-state={status === "submitting" ? "submitting" : status === "error_validation" ? "error_validation" : status === "error_server" ? "error_server" : "idle"}
      style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "400px" }}
    >
      <label>Имя <input name="name" type="text" /></label>
      <label>Email * <input name="email" type="email" /></label>
      <label>Телефон <input name="phone" type="tel" /></label>
      <label>Комментарий <input name="comment" type="text" /></label>
      {productId && <input type="hidden" name="product_id" value={productId} />}
      {roomSetId && <input type="hidden" name="room_set_id" value={roomSetId} />}
      <button type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Отправка…" : "Отправить"}
      </button>
      {(status === "error_validation" || status === "error_server") && (
        <p style={{ color: "red" }} role="alert">{errorMessage}</p>
      )}
    </form>
  )
}
