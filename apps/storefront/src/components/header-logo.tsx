"use client"

import Link from "next/link"
import { WoodrightWordmark } from "@/components/woodright-wordmark"
import { useKidsChromeVisual, useKidsSection } from "@/lib/use-kids-section"

/**
 * Wordmark + «Детская» pill (UI chrome). The pill stays in the DOM so adult ↔
 * kids is a CSS tween (not a mount jump). .logo is translateX(-50%)-centered,
 * so as the slot width opens the pair re-centers and the wordmark glides left.
 *
 * Inline SVG (same geometry as the old 273×35 PNG box) so ink stays crisp
 * at any DPR; kids-slot width is fixed in rem and does not depend on
 * raster intrinsic size. Kids chrome links to /kids (not the adult home).
 *
 * Visual open state comes from `useKidsChromeVisual` so kids catalog → PDP
 * can snap-closed and replay the enter glide.
 *
 * Proper names (Greenwich, Cloud, Woodright Kids in product copy) stay Latin.
 */
export function HeaderLogo() {
  const sectionKids = useKidsSection()
  const { kids: visualKids, snap } = useKidsChromeVisual()

  return (
    <Link
      href={sectionKids ? "/kids" : "/"}
      className="logo"
      aria-label={
        sectionKids ? "Woodright Kids - на главную детской" : "Woodright - на главную"
      }
    >
      <WoodrightWordmark className="logo-image" />
      <span
        className={`logo-kids-slot${visualKids ? " is-visible" : ""}${snap ? " is-snap" : ""}`}
        aria-hidden="true"
      >
        <span className="logo-kids-badge">Детская</span>
      </span>
    </Link>
  )
}
