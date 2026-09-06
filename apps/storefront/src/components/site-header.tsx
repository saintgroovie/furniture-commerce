"use client"

import type { ReactNode } from "react"
import { useKidsChromeVisual } from "@/lib/use-kids-section"

/**
 * Header shell that owns the adult ↔ kids edge-wash tint via data-section.
 * Tint is driven by the URL (and optimistic link clicks), not by `.kids-theme`
 * in the page body — that class only mounts after the kids RSC segment lands.
 * KidsSectionProvider lives up in the root layout so the route loader can
 * read the same flag and tint in the same tick as the header.
 *
 * Visual section uses `useKidsChromeVisual` so kids → PDP replays the sage
 * wash enter in lockstep with the KIDS pill.
 */
export function SiteHeader({ children }: { children: ReactNode }) {
  const { kids, snap } = useKidsChromeVisual()

  return (
    <header
      className={`site-header${snap ? " is-kids-snap" : ""}`}
      data-section={kids ? "kids" : "main"}
    >
      {children}
    </header>
  )
}
