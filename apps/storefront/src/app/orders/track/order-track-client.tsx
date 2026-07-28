"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import {
  fetchOrderProcess,
  type BuyerProcessResponse,
} from "@/lib/woodright-order/api"
import { orderTrackCopy as copy } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"
import { flatCopy } from "@/lib/format-ru-copy"
import {
  ORDER_TRACK_HANDOFF_COOKIE,
  decodeOrderTrackHandoff,
  orderTrackSessionKey,
} from "@/lib/order-track-token-handoff"

type LoadState = "loading" | "ready" | "missing" | "error"

function readHandoffCookieForOrder(orderId: string): string {
  if (typeof document === "undefined" || !orderId) return ""
  const parts = document.cookie.split("; ")
  for (const part of parts) {
    const eq = part.indexOf("=")
    if (eq < 0) continue
    const name = part.slice(0, eq)
    if (name !== ORDER_TRACK_HANDOFF_COOKIE) continue
    const raw = part.slice(eq + 1)
    const parsed = decodeOrderTrackHandoff(raw)
    if (!parsed) return ""
    if (parsed.orderId !== orderId) return ""
    return parsed.token
  }
  return ""
}

function clearHandoffCookie(): void {
  if (typeof document === "undefined") return
  document.cookie = `${ORDER_TRACK_HANDOFF_COOKIE}=; Path=/orders/track; Max-Age=0; SameSite=Lax`
}

export function OrderTrackClient() {
  const params = useSearchParams()
  const orderId = (params.get("order_id") ?? "").trim()

  const [state, setState] = useState<LoadState>("loading")
  const [data, setData] = useState<BuyerProcessResponse | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    let token = ""
    if (typeof window !== "undefined") {
      try {
        token = readHandoffCookieForOrder(orderId)
        if (token) clearHandoffCookie()
        if (!token && orderId) {
          token = sessionStorage.getItem(orderTrackSessionKey(orderId)) ?? ""
        }
      } catch {
        token = ""
      }
    }

    if (!orderId || !token) {
      setState("missing")
      return
    }

    try {
      if (typeof window !== "undefined") {
        sessionStorage.setItem(orderTrackSessionKey(orderId), token)
        // Defense in depth if a token ever remains in the address bar.
        const url = new URL(window.location.href)
        if (url.searchParams.has("token")) {
          url.searchParams.delete("token")
          window.history.replaceState({}, "", url.toString())
        }
      }
    } catch {
      // ignore storage / history failures
    }

    let cancelled = false
    setState("loading")
    fetchOrderProcess({ orderId, token })
      .then((res) => {
        if (cancelled) return
        setData(res)
        setState("ready")
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : flatCopy(copy.loadError))
        setState("error")
      })
    return () => {
      cancelled = true
    }
  }, [orderId])

  if (state === "missing") {
    return <p className="info-text">{copy.missingParams}</p>
  }

  if (state === "loading") {
    return <p className="info-text">{copy.loading}</p>
  }

  if (state === "error") {
    return (
      <div>
        <CopyLines className="feedback-error" lines={copy.loadError} />
        {error && <p className="info-text" style={{ marginTop: "0.5rem" }}>{error}</p>}
      </div>
    )
  }

  const status = data?.customer_status
  const timeline = data?.timeline ?? []
  const events = data?.events ?? []

  return (
    <div className="order-track">
      {data?.display_id != null && (
        <p className="page-caption">
          Заказ № {String(data.display_id)}
        </p>
      )}

      <section className="order-track-block" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.125rem", marginBottom: "0.5rem" }}>
          {copy.consolidatedHeading}
        </h2>
        <p style={{ fontWeight: 600, margin: 0 }}>{status?.label}</p>
        {status?.description && (
          <p className="info-text" style={{ marginTop: "0.35rem" }}>
            {status.description}
          </p>
        )}
        {status?.next_expected_action && (
          <p className="info-text" style={{ marginTop: "0.5rem" }}>
            {copy.nextActionLabel}: {status.next_expected_action}
          </p>
        )}
      </section>

      <div
        className="order-track-grid"
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          marginBottom: "1.5rem",
        }}
      >
        <section>
          <h3 style={{ fontSize: "0.95rem", marginBottom: "0.35rem" }}>
            {copy.paymentHeading}
          </h3>
          <p style={{ margin: 0 }}>{data?.payment?.label ?? "нет данных"}</p>
        </section>
        <section>
          <h3 style={{ fontSize: "0.95rem", marginBottom: "0.35rem" }}>
            {copy.productionHeading}
          </h3>
          <p style={{ margin: 0 }}>{data?.production?.label ?? "нет данных"}</p>
          {data?.production?.customer_message && (
            <p className="info-text" style={{ marginTop: "0.35rem" }}>
              {data.production.customer_message}
            </p>
          )}
        </section>
        <section>
          <h3 style={{ fontSize: "0.95rem", marginBottom: "0.35rem" }}>
            {copy.deliveryHeading}
          </h3>
          <p style={{ margin: 0 }}>{data?.delivery?.label ?? "нет данных"}</p>
        </section>
      </div>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.125rem", marginBottom: "0.5rem" }}>
          {copy.timelineHeading}
        </h2>
        <ol style={{ margin: 0, paddingLeft: "1.25rem" }}>
          {timeline.map((step) => (
            <li
              key={step.key}
              style={{
                marginBottom: "0.35rem",
                opacity: step.state === "upcoming" ? 0.55 : 1,
                fontWeight: step.state === "current" ? 600 : 400,
              }}
            >
              {step.label}
              {step.state === "current" ? " · сейчас" : ""}
              {step.state === "done" ? " · готово" : ""}
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 style={{ fontSize: "1.125rem", marginBottom: "0.5rem" }}>
          {copy.eventsHeading}
        </h2>
        {events.length === 0 ? (
          <p className="info-text">{copy.noEvents}</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
            {events.map((e) => (
              <li key={e.id} style={{ marginBottom: "0.35rem" }}>
                {e.at ? String(e.at).slice(0, 16).replace("T", " ") : ""}{" "}
                {e.message || e.label || ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
