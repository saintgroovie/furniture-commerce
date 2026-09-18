"use client"

/**
 * Door-handing / handle side on PDP — not a Medusa variant.
 * ProductCta reads the pick into line-item execution_specs.
 *
 * No default: the buyer must choose left or right.
 */

import { useSyncExternalStore } from "react"

export type HingeSideValue = "left" | "right"

export type PdpHingeSideSelection = {
  productKey: string
  value: HingeSideValue
}

let current: PdpHingeSideSelection | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

export function publishPdpHingeSideSelection(selection: PdpHingeSideSelection): void {
  current = selection
  emit()
}

export function clearPdpHingeSideSelection(): void {
  current = null
  emit()
}

export function readPdpHingeSideSelection(): PdpHingeSideSelection | null {
  return current
}

export function hingeSideForProduct(
  selection: PdpHingeSideSelection | null,
  productKey: string
): HingeSideValue | null {
  if (!selection || selection.productKey !== productKey) return null
  return selection.value
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): PdpHingeSideSelection | null {
  return current
}

function getServerSnapshot(): PdpHingeSideSelection | null {
  return null
}

export function usePdpHingeSideSelection(): PdpHingeSideSelection | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
