"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useSyncExternalStore } from "react"
import { bespokeSectionNav } from "@/lib/woodright-copy"

type Tab = (typeof bespokeSectionNav.tabs)[number]

function splitHref(href: string): { path: string; hash: string } {
  const i = href.indexOf("#")
  return i === -1 ? { path: href, hash: "" } : { path: href.slice(0, i), hash: href.slice(i) }
}

/**
 * Active tab: an anchor tab (`/bespoke#projects`) only while the URL hash
 * matches; otherwise the tab whose path is the current page (or its parent,
 * except the hub itself). -1 = no tab (e.g. /bespoke/request).
 */
function activeIndex(tabs: readonly Tab[], pathname: string, hash: string): number {
  const anchor = tabs.findIndex((t) => {
    const h = splitHref(t.href)
    return h.hash !== "" && h.path === pathname && h.hash === hash
  })
  if (anchor !== -1) return anchor
  return tabs.findIndex((t) => {
    const h = splitHref(t.href)
    if (h.hash !== "") return false
    if (h.path === pathname) return true
    return h.path !== "/bespoke" && pathname.startsWith(`${h.path}/`)
  })
}

/* window.location.hash as an external store: no setState-in-effect, SSR = "".
   next/link commits a same-page hash via pushState inside a transition (no
   hashchange event), so after any click the hash is re-read a few times. */
const RECHECK_MS = [0, 80, 250, 600]

function subscribeHash(onChange: () => void) {
  let timers: number[] = []
  const onClick = () => {
    timers.forEach((t) => window.clearTimeout(t))
    timers = RECHECK_MS.map((ms) => window.setTimeout(onChange, ms))
  }
  window.addEventListener("hashchange", onChange)
  window.addEventListener("popstate", onChange)
  document.addEventListener("click", onClick)
  return () => {
    timers.forEach((t) => window.clearTimeout(t))
    window.removeEventListener("hashchange", onChange)
    window.removeEventListener("popstate", onChange)
    document.removeEventListener("click", onClick)
  }
}
const readHash = () => window.location.hash
const readServerHash = () => ""

/**
 * Sticky «По проекту» sub-navigation under the site header on `/bespoke/*`.
 * Gold indicator glides between tabs (left/width from the active tab's box,
 * same pattern as .filter-tabs). Anchors carry aria-current="location".
 */
export function BespokeSubnav() {
  const pathname = usePathname() ?? "/bespoke"
  const hash = useSyncExternalStore(subscribeHash, readHash, readServerHash)
  const tabsRef = useRef<HTMLDivElement>(null)
  const indRef = useRef<HTMLSpanElement>(null)

  const active = activeIndex(bespokeSectionNav.tabs, pathname, hash)

  /* Sticky offset + anchor scroll-margin follow the real header height
     (54+46 desktop, 64+44 phone rows, safe-area) via --wr-header-h on <html>;
     CSS keeps static fallbacks for the no-JS first paint. */
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".site-header")
    if (!header) return
    const root = document.documentElement
    const apply = () => {
      root.style.setProperty("--wr-header-h", `${Math.round(header.getBoundingClientRect().height)}px`)
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(header)
    return () => {
      ro.disconnect()
      root.style.removeProperty("--wr-header-h")
    }
  }, [])

  /* Indicator geometry is written straight to the DOM (measure → style),
     so a resize never round-trips through React state. */
  useEffect(() => {
    const root = tabsRef.current
    const ind = indRef.current
    if (!root || !ind) return
    const measure = () => {
      const el = active >= 0 ? root.children[active] : null
      if (!(el instanceof HTMLElement)) {
        ind.classList.remove("is-ready")
        return
      }
      const r = root.getBoundingClientRect()
      const b = el.getBoundingClientRect()
      ind.style.left = `${b.left - r.left + root.scrollLeft}px`
      ind.style.width = `${b.width}px`
      ind.classList.add("is-ready")
      /* Phone: .bespoke-subnav-inner scrolls horizontally under a 40px fade
         mask - keep the active tab fully in view (horizontal only, never
         moves the page). */
      const scroller = root.parentElement
      if (scroller && scroller.scrollWidth > scroller.clientWidth) {
        const s = scroller.getBoundingClientRect()
        const overflowRight = b.right - (s.right - 40)
        const overflowLeft = s.left - b.left
        const behavior: ScrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth"
        if (overflowRight > 0) scroller.scrollBy({ left: overflowRight, behavior })
        else if (overflowLeft > 0) scroller.scrollBy({ left: -overflowLeft, behavior })
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(root)
    return () => ro.disconnect()
  }, [active])

  return (
    <nav className="bespoke-subnav" aria-label={bespokeSectionNav.ariaLabel}>
      <div className="bespoke-subnav-inner">
        <span className="bespoke-subnav-mark">{bespokeSectionNav.mark}</span>
        <div className="bespoke-subnav-tabs" ref={tabsRef}>
          {bespokeSectionNav.tabs.map((tab, i) => {
            const isActive = i === active
            const isAnchor = tab.href.includes("#")
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={isActive ? (isAnchor ? "location" : "page") : undefined}
              >
                {tab.label}
              </Link>
            )
          })}
          <span className="bespoke-subnav-ind" ref={indRef} aria-hidden="true" />
        </div>
        <Link href={bespokeSectionNav.cta.href} className="bespoke-subnav-cta">
          {bespokeSectionNav.cta.label}
        </Link>
      </div>
    </nav>
  )
}
