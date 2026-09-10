"use client"

import type { ReactNode } from "react"
import { useChromeVisual } from "@/lib/use-site-section"

/**
 * Header shell that owns main ↔ kids ↔ bespoke edge-wash via data-section.
 * Tint is driven by the URL (and optimistic link clicks), not by theme
 * classes in the page body — those only mount after the RSC segment lands.
 */
export function SiteHeader({ children }: { children: ReactNode }) {
  const { section, snap } = useChromeVisual()

  return (
    <header
      className={`site-header${snap ? " is-kids-snap" : ""}`}
      data-section={section}
    >
      {children}
    </header>
  )
}
