"use client"

import type { ReactNode } from "react"
import { KidsSectionProvider, useKidsSection } from "@/lib/use-kids-section"

function SiteHeaderInner({ children }: { children: ReactNode }) {
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

/**
 * Header shell that owns the adult ↔ kids edge-wash tint via data-section.
 * Tint is driven by the URL (and optimistic link clicks), not by `.kids-theme`
 * in the page body — that class only mounts after the kids RSC segment lands.
 */
export function SiteHeader({ children }: { children: ReactNode }) {
  return (
    <KidsSectionProvider>
      <SiteHeaderInner>{children}</SiteHeaderInner>
    </KidsSectionProvider>
  )
}
