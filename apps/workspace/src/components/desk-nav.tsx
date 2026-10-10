"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { activeNavId, NAV, type NavItem } from "@/lib/nav"

function sectionId(pathname: string | null, items: readonly NavItem[]): NavItem["id"] | null {
  if (!pathname) return null
  for (const item of items) {
    if (item.matches.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(`${prefix}?`))) {
      return item.id
    }
  }
  return null
}

export const OPEN_SEARCH_EVENT = "wr-desk:open-search"

export function DeskNav({ todayCount, items = NAV }: { todayCount?: number | null; items?: readonly NavItem[] }) {
  const active = sectionId(usePathname(), items)
  return (
    <nav className="nav" aria-label="Разделы">
      {items.map((item) => (
        <Link key={item.id} href={item.href} aria-current={item.id === active ? "page" : undefined} title={item.label}>
          <span className="nav-glyph" aria-hidden="true">{item.glyph}</span>
          <span className="nav-label">{item.label}</span>
          {item.id === "today" && todayCount ? <span className="nav-count">{todayCount}</span> : null}
        </Link>
      ))}
    </nav>
  )
}

/** 390: four sections + search. «Витрина» stays reachable through search and deep links. */
export function MobileNav() {
  const active = activeNavId(usePathname())
  return (
    <nav className="mobile-nav" aria-label="Разделы">
      {NAV.filter((item) => item.mobile).map((item) => (
        <Link key={item.id} href={item.href} aria-current={item.id === active ? "page" : undefined}>
          <span className="nav-glyph" aria-hidden="true">{item.glyph}</span>
          {item.label}
        </Link>
      ))}
      <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))}>
        <svg className="nav-glyph" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5 14 14" strokeLinecap="round" />
        </svg>
        Поиск
      </button>
    </nav>
  )
}
