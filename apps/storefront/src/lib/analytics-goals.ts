"use client"

import { CART_UPDATED_EVENT, type CartUpdatedDetail } from "./cart/cart-events"

export const LEAD_SUBMITTED_EVENT = "wr:lead-submitted"

type LeadSubmitted = {
  source: "bespoke" | "checkout"
  /** Local deduplication key only; never sent to Metrika. */
  successKey: string
}

type GoalTarget = EventTarget & {
  ym?: (id: number, method: string, ...args: unknown[]) => void
}

/** Call only after the complete request/order API operation succeeds. */
export function emitLeadSubmitted(detail: LeadSubmitted): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(LEAD_SUBMITTED_EVENT, { detail }))
}

/** Mounted only while consent is granted. No queue or replay after consent. */
export function bindMetrikaGoals(target: GoalTarget, counterId: string): () => void {
  const id = Number(counterId)
  if (!Number.isSafeInteger(id) || id <= 0) return () => {}
  const seenLeads = new Set<string>()

  function reach(goal: "add_to_cart" | "lead_submitted", params?: { source: LeadSubmitted["source"] }) {
    try {
      target.ym?.(id, "reachGoal", goal, ...(params ? [params] : []))
    } catch {
      // Tracking must never break a cart or request operation.
    }
  }

  function onCart(event: Event) {
    const detail = (event as CustomEvent<CartUpdatedDetail>).detail
    // Cart refresh, removal, quantity edits and checkout clearing carry no
    // positive delta. PDP/set additions emit this once after API success.
    if (Number.isFinite(detail?.delta) && Number(detail.delta) > 0) {
      reach("add_to_cart")
    }
  }

  function onLead(event: Event) {
    const detail = (event as CustomEvent<LeadSubmitted>).detail
    if (!detail || (detail.source !== "bespoke" && detail.source !== "checkout")) return
    if (typeof detail.successKey !== "string" || !detail.successKey) return
    const key = `${detail.source}:${detail.successKey}`
    if (seenLeads.has(key)) return
    seenLeads.add(key)
    // No name, phone, email, comment, order ID or lead ID is transmitted.
    reach("lead_submitted", { source: detail.source })
  }

  target.addEventListener(CART_UPDATED_EVENT, onCart)
  target.addEventListener(LEAD_SUBMITTED_EVENT, onLead)
  return () => {
    target.removeEventListener(CART_UPDATED_EVENT, onCart)
    target.removeEventListener(LEAD_SUBMITTED_EVENT, onLead)
  }
}
