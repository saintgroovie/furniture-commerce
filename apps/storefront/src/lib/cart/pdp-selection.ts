"use client"

/**
 * Bridge between PDP gallery execution controls and buy-panel price / CTA.
 *
 * Execution (color / wood / upholstery / headboard) is not a Medusa variant —
 * products keep a single `variants[0]`. The gallery publishes the buyer-facing
 * selection here; ProductCta reads it on add-to-cart into line-item metadata.
 *
 * Module singleton is enough: one PDP is mounted at a time; the gallery clears
 * on unmount. `productKey` prevents a completed gate from a previous PDP from
 * flashing price/CTA during client navigation.
 */

import { useSyncExternalStore } from "react"

export type PdpExecutionSpec = { label: string; value: string }

export type PdpPurchaseGate = {
  /** Stable product identity (handle or id) that owns this gate. */
  productKey: string | null
  /** True when the PDP shows at least one required buyer execution group. */
  requiresSelection: boolean
  /** Every required group has an explicit buyer pick. */
  complete: boolean
  /**
   * When complete, whether the picked combination resolves to an existing
   * execution (matrix / media). False → show “unavailable” and keep CTA off.
   */
  combinationAvailable: boolean
  /** Labels of required groups still without a pick (buyer-facing). */
  missingLabels: string[]
  /** Confirmed specs only — never implicit first-value defaults. */
  specs: PdpExecutionSpec[]
  /** Hero matching the confirmed selection, when available. */
  imageSrc?: string
}

export type PdpExecutionSelection = {
  imageSrc?: string
  specs: PdpExecutionSpec[]
  gate: PdpPurchaseGate
}

const EMPTY_GATE: PdpPurchaseGate = {
  productKey: null,
  requiresSelection: false,
  complete: true,
  combinationAvailable: true,
  missingLabels: [],
  specs: [],
}

let current: PdpExecutionSelection | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

export function publishPdpExecutionSelection(selection: PdpExecutionSelection): void {
  current = selection
  emit()
}

export function clearPdpExecutionSelection(): void {
  current = null
  emit()
}

export function readPdpExecutionSelection(): PdpExecutionSelection | null {
  return current
}

export function readPdpPurchaseGate(): PdpPurchaseGate {
  return current?.gate ?? EMPTY_GATE
}

/** Gate is only trusted when it belongs to the currently rendered product. */
export function gateMatchesProduct(
  gate: PdpPurchaseGate,
  productKey: string | null | undefined
): boolean {
  if (!productKey) return !gate.productKey
  return gate.productKey === productKey
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): PdpExecutionSelection | null {
  return current
}

function getServerSnapshot(): PdpExecutionSelection | null {
  return null
}

/** React subscription for price / CTA panels that live outside the gallery tree. */
export function usePdpExecutionSelection(): PdpExecutionSelection | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function usePdpPurchaseGate(): PdpPurchaseGate {
  const selection = usePdpExecutionSelection()
  return selection?.gate ?? EMPTY_GATE
}

/** Hint copy for the reserved price slot before a full valid pick. */
export function pdpPriceHintForGate(gate: PdpPurchaseGate): string {
  if (!gate.requiresSelection) return ""
  if (gate.complete && !gate.combinationAvailable) {
    return "Такое сочетание недоступно"
  }
  const missing = gate.missingLabels
  if (missing.length === 0) {
    return "Выберите параметры, чтобы увидеть цену"
  }
  const asObject = (label: string): string => {
    const map: Record<string, string> = {
      Цвет: "цвет",
      Дерево: "дерево",
      Обивка: "обивку",
      Изголовье: "изголовье",
      Отделка: "отделку",
    }
    return map[label] ?? label.toLowerCase()
  }
  if (missing.length === 1) {
    return `Выберите ${asObject(missing[0])}, чтобы увидеть цену`
  }
  if (missing.length === 2) {
    return `Выберите ${asObject(missing[0])} и ${asObject(missing[1])}, чтобы увидеть цену`
  }
  return "Выберите параметры, чтобы увидеть цену"
}
