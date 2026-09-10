"use client"

import Link from "next/link"
import { BespokeBadge } from "@/components/bespoke-badge"
import { WoodrightWordmark } from "@/components/woodright-wordmark"
import { useChromeVisual, useSiteSection } from "@/lib/use-site-section"

/**
 * Wordmark + «KIDS» pill + BESPOKE capsule. Pills stay in the DOM so
 * section changes are CSS tweens (not mount jumps). .logo is
 * translateX(-50%)-centered, so as a slot width opens the pair re-centers.
 *
 * Kids chrome links to /kids; Bespoke chrome links to /bespoke.
 * Visual open state comes from `useChromeVisual` so kids catalog → PDP
 * can snap-closed and replay the enter glide.
 */
export function HeaderLogo() {
  const section = useSiteSection()
  const { kids: visualKids, snap } = useChromeVisual()

  const href = section === "kids" ? "/kids" : section === "bespoke" ? "/bespoke" : "/"
  const ariaLabel =
    section === "kids"
      ? "Woodright Kids - на главную детской"
      : section === "bespoke"
        ? "Woodright Bespoke"
        : "Woodright - на главную"

  return (
    <Link href={href} className="logo" aria-label={ariaLabel}>
      <WoodrightWordmark className="logo-image" />
      <span
        className={`logo-kids-slot${visualKids ? " is-visible" : ""}${snap ? " is-snap" : ""}`}
        aria-hidden="true"
      >
        <span className="logo-kids-badge">Kids</span>
      </span>
      <span className="logo-bespoke-slot" aria-hidden="true">
        <BespokeBadge />
      </span>
    </Link>
  )
}
