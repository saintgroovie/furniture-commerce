/**
 * Shared buyer-facing modal dialog helpers (mobile nav, catalog filters).
 *
 * Inert strategy:
 * - Do not mark the whole `<header>` inert — MobileNav lives inside it.
 * - Do not mark whole `#main-content` inert for filter dialogs — the drawer
 *   is rendered inside main; pass product-area (or other siblings) as extras.
 * - Layers are ownership-scoped: enabling/disabling one dialog does not clear
 *   another dialog's inert targets (union recompute).
 */

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Matches storefront mobile chrome (nav + filter drawer) CSS breakpoint. */
export const BUYER_MOBILE_MQ = "(max-width: 768px)"

export const BUYER_DIALOG_LAYER = {
  mobileNav: "mobile-nav",
  catalogFilters: "catalog-filters",
} as const

export type BuyerDialogLayerId =
  (typeof BUYER_DIALOG_LAYER)[keyof typeof BUYER_DIALOG_LAYER]

/** Ask the other buyer dialog to close before this layer opens. */
export const BUYER_CLOSE_PEER_EVENT = "woodright:buyer-dialog-close-peer"

export type BuyerClosePeerDetail = { exceptLayer: BuyerDialogLayerId }

export function requestCloseBuyerDialogPeer(exceptLayer: BuyerDialogLayerId) {
  if (typeof document === "undefined") return
  document.dispatchEvent(
    new CustomEvent<BuyerClosePeerDetail>(BUYER_CLOSE_PEER_EVENT, {
      detail: { exceptLayer },
    })
  )
}

export function listFocusable(container: HTMLElement | null): HTMLElement[] {
  if (!container) return []
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1
  )
}

function setInert(el: Element, enabled: boolean) {
  if (enabled) el.setAttribute("inert", "")
  else el.removeAttribute("inert")
}

const activeLayers = new Map<string, Set<Element>>()
const appliedInert = new Set<Element>()

function chromeBaseTargets(): Element[] {
  return [
    document.querySelector("header .header-top"),
    document.querySelector("header .header-main"),
    document.querySelector("footer"),
  ].filter((el): el is Element => !!el)
}

function recomputeBuyerChromeInert() {
  const next = new Set<Element>()
  for (const targets of activeLayers.values()) {
    for (const el of targets) next.add(el)
  }
  for (const el of appliedInert) {
    if (!next.has(el)) setInert(el, false)
  }
  for (const el of next) {
    if (!appliedInert.has(el)) setInert(el, true)
  }
  appliedInert.clear()
  for (const el of next) appliedInert.add(el)
}

/**
 * Make buyer chrome inert while a modal layer is open.
 * Always targets header chrome sections + footer; callers pass extras
 * (e.g. `#main-content` for mobile nav, `.catalog-product-area` for filters).
 * Pass a stable `layerId` so concurrent dialogs do not clobber each other.
 */
export function setBuyerChromeInert(
  enabled: boolean,
  extras: Array<Element | null | undefined> = [],
  layerId: BuyerDialogLayerId | string = "default"
) {
  if (typeof document === "undefined") return

  if (enabled) {
    const targets = new Set<Element>(chromeBaseTargets())
    for (const el of extras) {
      if (el) targets.add(el)
    }
    activeLayers.set(layerId, targets)
  } else {
    activeLayers.delete(layerId)
  }
  recomputeBuyerChromeInert()
}

export type DialogKeydownOptions = {
  panel: HTMLElement | null
  /** Trigger may remain focusable outside the panel (toggle buttons). */
  trigger?: HTMLElement | null
  onEscape: () => void
}

/** Escape closes; Tab / Shift+Tab cycle inside panel (or allow trigger). */
export function handleDialogKeydown(
  e: KeyboardEvent,
  { panel, trigger, onEscape }: DialogKeydownOptions
) {
  if (e.key === "Escape") {
    e.preventDefault()
    onEscape()
    return
  }
  if (e.key !== "Tab" || !panel) return

  const items = listFocusable(panel)
  if (items.length === 0) return

  const first = items[0]!
  const last = items[items.length - 1]!
  const active = document.activeElement as HTMLElement | null

  if (e.shiftKey && (active === first || active === trigger)) {
    e.preventDefault()
    last.focus()
    return
  }
  if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
    return
  }
  if (!e.shiftKey && active === trigger) {
    e.preventDefault()
    first.focus()
    return
  }
  if (active && !panel.contains(active) && active !== trigger) {
    e.preventDefault()
    first.focus()
  }
}
