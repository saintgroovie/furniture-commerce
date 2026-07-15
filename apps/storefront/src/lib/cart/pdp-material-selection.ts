"use client"

/**
 * Bridge between the PDP material execution dropdown and price / CTA blocks.
 *
 * Mirrors pdp-selection.ts: module singleton (one PDP mounted at a time),
 * `productKey` rejects a stale pick after client navigation. Unlike the
 * purchase gate there is no empty state — consumers fall back to the first
 * (default) tier option when no pick has been published yet.
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

/** Selected tier code for this product, or null → caller uses the default tier. */
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
