"use client"

/**
 * Bridge between the PDP material execution dropdown and price / CTA blocks.
 *
 * Mirrors pdp-selection.ts: module singleton (one PDP mounted at a time),
 * `productKey` rejects a stale pick after client navigation. There is no
 * default tier — price / CTA consumers treat null from materialCodeForProduct
 * as an incomplete pick until the buyer selects an option.
 */

import { useSyncExternalStore } from "react"

export type PdpMaterialSelection = {
  productKey: string
  code: string
}

let current: PdpMaterialSelection | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

export function publishPdpMaterialSelection(selection: PdpMaterialSelection): void {
  current = selection
  emit()
}

export function clearPdpMaterialSelection(): void {
  current = null
  emit()
}

export function readPdpMaterialSelection(): PdpMaterialSelection | null {
  return current
}

/** Selected tier code for this product, or null when unset. */
export function materialCodeForProduct(
  selection: PdpMaterialSelection | null,
  productKey: string
): string | null {
  if (!selection || selection.productKey !== productKey) return null
  return selection.code
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): PdpMaterialSelection | null {
  return current
}

function getServerSnapshot(): PdpMaterialSelection | null {
  return null
}

export function usePdpMaterialSelection(): PdpMaterialSelection | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
