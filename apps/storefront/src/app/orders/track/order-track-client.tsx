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
  orderTrackSessionKey,
  parseOrderTrackFragmentToken,
} from "@/lib/order-track-token-handoff"

type LoadState = "loading" | "ready" | "missing" | "error"

function clearSensitiveUrlParts(): void {
  if (typeof window === "undefined") return
  const url = new URL(window.location.href)
  let changed = false
  if (url.searchParams.has("token")) {
    url.searchParams.delete("token")
    changed = true
  }
  if (url.hash) {
    url.hash = ""
    changed = true
  }
  if (changed) {
    window.history.replaceState({}, "", `${url.pathname}${url.search}`)
  }
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
        token = parseOrderTrackFragmentToken(window.location.hash) ?? ""
        if (!token && orderId) {
          token = sessionStorage.getItem(orderTrackSessionKey(orderId)) ?? ""
        }
        if (token && orderId) {
          sessionStorage.setItem(orderTrackSessionKey(orderId), token)
        }
        clearSensitiveUrlParts()
      } catch {
        token = ""
      }
    }

    if (!orderId || !token) {
      setState("missing")
      return
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
        // Never echo raw token / auth material from failed responses.
        setError(flatCopy(copy.loadError))
        setState("error")
        void e
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
