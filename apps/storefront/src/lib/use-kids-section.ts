"use client"

import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { usePathname } from "next/navigation"

function isKidsPath(pathname: string): boolean {
  return pathname === "/kids" || pathname.startsWith("/kids/")
}

const KidsSectionContext = createContext(false)

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
  const [pendingKids, setPendingKids] = useState<boolean | null>(null)
  const isKids = pendingKids ?? pathKids

  useEffect(() => {
    setPendingKids(null)
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
      setPendingKids(isKidsPath(path))
    }

    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [])

  return createElement(KidsSectionContext.Provider, { value: isKids }, children)
}

export function useKidsSection(): boolean {
  return useContext(KidsSectionContext)
}
