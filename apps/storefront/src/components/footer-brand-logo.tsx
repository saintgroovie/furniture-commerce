"use client"

import Link from "next/link"
import { WoodrightWordmark } from "@/components/woodright-wordmark"
import { useKidsChromeVisual, useKidsSection } from "@/lib/use-kids-section"

/** Kids-aware footer wordmark (client island only). */
export function FooterBrandLogo() {
  const sectionKids = useKidsSection()
  const { kids: visualKids, snap } = useKidsChromeVisual()

  return (
    <Link
      href={sectionKids ? "/kids" : "/"}
      className="footer-column-title footer-brand-logo"
      aria-label={
        sectionKids
          ? "Woodright Kids - на главную детской"
          : "Woodright - на главную"
      }
    >
      <span className="footer-brand-mark">
        <WoodrightWordmark className="footer-brand-wordmark" />
        <span
          className={`logo-kids-slot${visualKids ? " is-visible" : ""}${snap ? " is-snap" : ""}`}
          aria-hidden="true"
        >
          <span className="logo-kids-badge">Kids</span>
        </span>
      </span>
    </Link>
  )
}
