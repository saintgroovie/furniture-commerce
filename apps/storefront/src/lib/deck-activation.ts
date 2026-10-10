/**
 * Progressive enhancement for the partners deck overlay.
 * A plain primary click may open the dialog. Any gesture the browser
 * already uses for navigation must keep the real href.
 */

export type DeckActivationInput = {
  defaultPrevented: boolean
  button: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  /** Anchor target attribute. Null when the control is not an anchor. */
  target: string | null
}

export function isPlainDeckActivation(input: DeckActivationInput): boolean {
  if (input.defaultPrevented) return false
  if (input.button !== 0) return false
  if (input.metaKey || input.ctrlKey || input.shiftKey || input.altKey) return false
  const target = (input.target ?? "").trim()
  if (target && target !== "_self") return false
  return true
}

export type DeckHistoryState = {
  pxDeck: true
  slug: string
  index: number
}

export function deckHistoryState(slug: string, index: number): DeckHistoryState {
  return { pxDeck: true, slug, index: Math.max(0, Math.floor(index)) }
}

/** Restore an overlay from a history entry. Null means the overlay is closed. */
export function readDeckHistory(state: unknown): { slug: string; index: number } | null {
  if (!state || typeof state !== "object") return null
  const record = state as Record<string, unknown>
  if (record.pxDeck !== true) return null
  if (typeof record.slug !== "string" || record.slug.length === 0) return null
  const index =
    typeof record.index === "number" && Number.isFinite(record.index)
      ? Math.max(0, Math.floor(record.index))
      : 0
  return { slug: record.slug, index }
}
