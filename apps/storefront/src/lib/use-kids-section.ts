"use client"

import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { usePathname } from "next/navigation"

function isKidsPath(pathname: string): boolean {
  return pathname === "/kids" || pathname.startsWith("/kids/")
}

type KidsSectionState = {
  /**
   * The section the user is visually coming from. Captured at link-click
   * time from window.location (the URL is still the old one at that
   * moment) — by the time the route loader mounts, usePathname() already
   * returns the destination, so the pathname alone can't tell "from".
   */
  from: boolean
  /** Where the user is heading: pathname + optimistic link click. */
  target: boolean
}

const KidsSectionContext = createContext<KidsSectionState>({
  from: false,
  target: false,
})

type PendingNav = { target: boolean; from: boolean }

/**
 * Owns the adult ↔ kids flag for the sticky header (edge wash + KIDS pill).
 *
 * Pathname is the source of truth. In-app link clicks flip the flag in the
 * capture phase so the CSS tween starts on click — not after the kids RSC
 * segment (and `.kids-theme`) finally mounts in the page body.
 */
export function KidsSectionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const pathKids = isKidsPath(pathname)
  const [pending, setPending] = useState<PendingNav | null>(null)

  /* Reset after the navigation commits. This effect runs after the commit
     that may show the route loader — the loader captures `from` in its
     mount state before this fires. */
  useEffect(() => {
    setPending(null)
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
      setPending({
        target: isKidsPath(path),
        from: isKidsPath(window.location.pathname),
      })
    }

    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [])

  const target = pending ? pending.target : pathKids
  const from = pending ? pending.from : pathKids

  const value = useMemo(() => ({ from, target }), [from, target])

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
  return useContext(KidsSectionContext)
}
