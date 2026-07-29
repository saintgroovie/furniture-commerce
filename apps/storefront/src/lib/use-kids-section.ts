"use client"

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react"
import { usePathname } from "next/navigation"

function isKidsPath(pathname: string): boolean {
  return pathname === "/kids" || pathname.startsWith("/kids/")
}

function isProductPath(pathname: string): boolean {
  return pathname === "/product" || pathname.startsWith("/product/")
}

/**
 * Must match `.system-state-loading` in globals.css:
 * `animation: loading-appear 0.35s ease 0.15s forwards`.
 * Kids chrome enter replay starts when this delay elapses on the route loader
 * (not on the catalog click).
 */
export const LOADING_APPEAR_DELAY_MS = 150

type KidsSectionState = {
  /**
   * The section the user is visually coming from. Captured at link-click
   * time from window.location (the URL is still the old one at that
   * moment) — by the time the route loader mounts, usePathname() already
   * returns the destination, so the pathname alone can't tell "from".
   */
  from: boolean
  /** Where the user is heading: pathname + optimistic link click + PDP. */
  target: boolean
}

type KidsSectionContextValue = KidsSectionState & {
  /** PDP (and similar) mounts set this so chrome stays kids off `/kids/*`. */
  setProductKids: (next: boolean) => void
  /**
   * Drop the kids→`/product/*` navigation bridge once the PDP has settled
   * (kids or adult). Safe to call from the product page layout effect.
   */
  settleProductNav: () => void
  /**
   * Visual kids chrome (edge wash + KIDS pill). May briefly snap closed to
   * replay the enter tween on kids catalog → PDP.
   */
  chromeKids: boolean
  /** When true, CSS disables width/wash transitions for one frame (snap). */
  chromeSnap: boolean
  /**
   * Route `loading.tsx` calls this after `LOADING_APPEAR_DELAY_MS` so the
   * KIDS enter glide starts with the loader fade-in (not on card click).
   */
  notifyLoadingAppear: () => void
}

const KidsSectionContext = createContext<KidsSectionContextValue>({
  from: false,
  target: false,
  setProductKids: () => {},
  settleProductNav: () => {},
  chromeKids: false,
  chromeSnap: false,
  notifyLoadingAppear: () => {},
})

type PendingNav = { target: boolean; from: boolean }

type KidsEnterState = { armed: boolean; nonce: number }

function kidsEnterReducer(
  state: KidsEnterState,
  action: "arm" | "disarm" | "play"
): KidsEnterState {
  switch (action) {
    case "arm":
      return state.armed ? state : { ...state, armed: true }
    case "disarm":
      return state.armed ? { ...state, armed: false } : state
    case "play":
      if (!state.armed) return state
      return { armed: false, nonce: state.nonce + 1 }
    default:
      return state
  }
}

/**
 * Owns the adult ↔ kids flag for sticky chrome (header edge wash, footer
 * wash, KIDS pill). Pathname is the baseline; in-app clicks flip early;
 * kids PDPs under `/product/*` opt in via `useKidsProductSection`.
 *
 * Kids catalog → `/product/*` keeps the optimistic kids bridge until the
 * PDP settles (loader stays green). KIDS enter replay is armed on click
 * but starts when the route loader appears (or when the PDP settles, if
 * navigation was faster than the loader delay).
 */
export function KidsSectionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const pathKids = isKidsPath(pathname)
  const [pending, setPending] = useState<PendingNav | null>(null)
  const [productKids, setProductKidsState] = useState(false)
  /** Click arms kids→PDP enter; play clears arm and bumps nonce once. */
  const [kidsEnter, dispatchKidsEnter] = useReducer(kidsEnterReducer, {
    armed: false,
    nonce: 0,
  })
  const kidsEnterNonce = kidsEnter.nonce

  const playKidsEnterReplay = useCallback(() => {
    dispatchKidsEnter("play")
  }, [])


  const notifyLoadingAppear = useCallback(() => {
    playKidsEnterReplay()
  }, [playKidsEnterReplay])

  const settleProductNav = useCallback(() => {
    setPending((prev) => {
      if (prev?.target && isProductPath(pathname)) return null
      return prev
    })
    /* Near-instant navigations never show the loader long enough — play on
       PDP open so the enter glide is not skipped. */
    playKidsEnterReplay()
  }, [pathname, playKidsEnterReplay])

  const setProductKids = useCallback((next: boolean) => {
    setProductKidsState(next)
  }, [])

  /* Reset optimistic nav after the route commits — except kids→product. */
  const [pathForPending, setPathForPending] = useState(pathname)
  if (pathname !== pathForPending) {
    setPathForPending(pathname)
    setPending((prev) => {
      if (prev?.target && isProductPath(pathname)) return prev
      return null
    })
    if (!isProductPath(pathname)) {
      setProductKidsState(false)
      dispatchKidsEnter("disarm")
    } else if (typeof document !== "undefined" && document.querySelector("[data-kids-product]")) {
      setProductKidsState(true)
      setPending(null)
    }
  }

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const el = e.target
      if (!(el instanceof Element)) return
      const a = el.closest("a[href]")
      if (!(a instanceof HTMLAnchorElement)) return
      if (a.target && a.target !== "_self") return
      const href = a.getAttribute("href")
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return
      }
      let path: string
      try {
        const url = new URL(href, window.location.origin)
        if (url.origin !== window.location.origin) return
        path = url.pathname
      } catch {
        return
      }
      const fromKids =
        isKidsPath(window.location.pathname) ||
        (isProductPath(window.location.pathname) && productKids)
      /* Kids catalog → /product/*: keep kids chrome until the PDP marker
         confirms (or clears) after the route commits. */
      const targetKids =
        isKidsPath(path) || (fromKids && isProductPath(path))
      setPending({
        target: targetKids,
        from: fromKids,
      })
      /* Arm only — the enter glide waits for loader appear (or PDP settle). */
      if (fromKids && targetKids && isProductPath(path)) {
        dispatchKidsEnter("arm")
      }
    }

    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [productKids])

  const settledKids = pathKids || productKids
  const target = pending ? pending.target : settledKids
  const from = pending ? pending.from : settledKids

  /* Enter replay override: null means follow `target`. */
  const [chromeOverride, setChromeOverride] = useState<{
    kids: boolean
    snap: boolean
  } | null>(null)
  const [enterNonceSeen, setEnterNonceSeen] = useState(0)
  if (kidsEnterNonce !== enterNonceSeen) {
    setEnterNonceSeen(kidsEnterNonce)
    if (kidsEnterNonce) {
      if (
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        // Follow target without override (reduced motion skips snap replay).
        setChromeOverride(null)
      } else {
        setChromeOverride({ kids: false, snap: true })
      }
    }
  }

  useLayoutEffect(() => {
    if (!kidsEnterNonce) return
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      document.documentElement.classList.remove("is-kids-chrome-snap")
      return
    }
    let cancelled = false
    let outer = 0
    let inner = 0
    document.documentElement.classList.add("is-kids-chrome-snap")
    outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => {
        if (cancelled) return
        document.documentElement.classList.remove("is-kids-chrome-snap")
        setChromeOverride(null)
      })
    })
    return () => {
      cancelled = true
      window.cancelAnimationFrame(outer)
      window.cancelAnimationFrame(inner)
      document.documentElement.classList.remove("is-kids-chrome-snap")
    }
  }, [kidsEnterNonce])

  const chromeKids = chromeOverride ? chromeOverride.kids : target
  const chromeSnap = chromeOverride ? chromeOverride.snap : false

  const value = useMemo(
    () => ({
      from,
      target,
      setProductKids,
      settleProductNav,
      chromeKids,
      chromeSnap,
      notifyLoadingAppear,
    }),
    [
      from,
      target,
      setProductKids,
      settleProductNav,
      chromeKids,
      chromeSnap,
      notifyLoadingAppear,
    ]
  )

  return createElement(KidsSectionContext.Provider, { value }, children)
}

export function useKidsSection(): boolean {
  return useContext(KidsSectionContext).target
}

/**
 * From + target section — for UI that wants to *play* the adult ↔ kids
 * recolor (mount in the color of the section being left, then tween to the
 * destination), e.g. the route loader.
 */
export function useKidsSectionTransition(): KidsSectionState {
  const { from, target } = useContext(KidsSectionContext)
  return { from, target }
}

/**
 * Visual kids chrome (edge wash + KIDS pill). Owned by the provider so
 * header / logo / footer stay in lockstep, including kids→PDP enter replay.
 */
export function useKidsChromeVisual(): { kids: boolean; snap: boolean } {
  const { chromeKids, chromeSnap } = useContext(KidsSectionContext)
  return { kids: chromeKids, snap: chromeSnap }
}

/**
 * Route loader hook: after the CSS appear delay, start any armed kids→PDP
 * enter replay so KIDS slides out with the green loader, not on click.
 */
export function useKidsEnterOnLoadingAppear(): void {
  const { notifyLoadingAppear } = useContext(KidsSectionContext)
  useEffect(() => {
    const timer = window.setTimeout(notifyLoadingAppear, LOADING_APPEAR_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [notifyLoadingAppear])
}

/**
 * Kids PDP chrome: opt the shared header/footer into the kids section while
 * this product page is mounted (layout effect avoids a one-frame adult flash).
 * Also settles the kids→product nav bridge so pending does not stick forever
 * on an adult PDP opened from the kids catalog.
 */
export function useKidsProductSection(isKidsProduct: boolean): void {
  const { setProductKids, settleProductNav } = useContext(KidsSectionContext)
  useLayoutEffect(() => {
    setProductKids(isKidsProduct)
    settleProductNav()
    return () => setProductKids(false)
  }, [isKidsProduct, setProductKids, settleProductNav])
}
