"use client"

import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
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
}

const KidsSectionContext = createContext<KidsSectionContextValue>({
  from: false,
  target: false,
  setProductKids: () => {},
})

type PendingNav = { target: boolean; from: boolean }

/**
 * Owns the adult ↔ kids flag for sticky chrome (header edge wash, footer
 * wash, KIDS pill). Pathname is the baseline; in-app clicks flip early;
 * kids PDPs under `/product/*` opt in via `useKidsProductSection`.
 */
export function KidsSectionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const pathKids = isKidsPath(pathname)
  const [pending, setPending] = useState<PendingNav | null>(null)
  const [productKids, setProductKids] = useState(false)

  /* Reset after the navigation commits. This effect runs after the commit
     that may show the route loader — the loader captures `from` in its
     mount state before this fires. */
  useEffect(() => {
    setPending(null)
  }, [pathname])

  /* Leave PDP opt-in when leaving /product/* so adult routes don't stick.
     On /product/* also re-read the SSR `data-kids-product` marker so a
     hard refresh opts chrome in before KidsProductSection's effect. */
  useLayoutEffect(() => {
    if (!isProductPath(pathname)) {
      setProductKids(false)
      return
    }
    if (document.querySelector("[data-kids-product]")) {
      setProductKids(true)
    }
  }, [pathname])

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
    }

    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [productKids])

  const settledKids = pathKids || productKids
  const target = pending ? pending.target : settledKids
  const from = pending ? pending.from : settledKids

  const value = useMemo(
    () => ({ from, target, setProductKids }),
    [from, target]
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
 * Kids PDP chrome: opt the shared header/footer into the kids section while
 * this product page is mounted (layout effect avoids a one-frame adult flash).
 */
export function useKidsProductSection(isKidsProduct: boolean): void {
  const { setProductKids } = useContext(KidsSectionContext)
  useLayoutEffect(() => {
    setProductKids(isKidsProduct)
    return () => setProductKids(false)
  }, [isKidsProduct, setProductKids])
}
