"use client"

import type { ReactNode } from "react"
import { useKidsChromeVisual } from "@/lib/use-kids-section"

/**
 * Client chrome for footer: kids sage wash via data-section.
 * Content stays in the server `SiteFooter` so RSC slots are not re-listed
 * across the client boundary (avoids React key warnings).
 */
export function SiteFooterChrome({ children }: { children: ReactNode }) {
  const { kids: visualKids, snap } = useKidsChromeVisual()

  return (
    <footer
      className={`site-footer${snap ? " is-kids-snap" : ""}`}
      data-section={visualKids ? "kids" : "main"}
    >
      {children}
    </footer>
  )
}
