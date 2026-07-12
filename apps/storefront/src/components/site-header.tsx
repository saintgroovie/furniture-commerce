"use client"

import type { ReactNode } from "react"
import { useKidsSection } from "@/lib/use-kids-section"

/**
 * Header shell that owns the adult ↔ kids edge-wash tint via data-section.
 * Tint is driven by the URL (and optimistic link clicks), not by `.kids-theme`
 * in the page body — that class only mounts after the kids RSC segment lands.
 * KidsSectionProvider lives up in the root layout so the route loader can
 * read the same flag and tint in the same tick as the header.
 */
export function SiteHeader({ children }: { children: ReactNode }) {
  const isKids = useKidsSection()

  return (
    <header
      className="site-header"
      data-section={isKids ? "kids" : "main"}
    >
      {children}
    </header>
  )
}
