"use client"

import Link from "next/link"
import { WoodrightWordmark } from "@/components/woodright-wordmark"
import { useKidsSection } from "@/lib/use-kids-section"

/**
 * Wordmark + «KIDS» pill. The pill stays in the DOM so adult ↔ kids is a
 * CSS tween (not a mount jump). .logo is translateX(-50%)-centered, so as
 * the slot width opens the pair re-centers and the wordmark glides left.
 */
export function HeaderLogo() {
  const isKids = useKidsSection()

  return (
    <Link
      href="/"
      className="logo"
      aria-label={isKids ? "Woodright Kids - на главную" : "Woodright - на главную"}
    >
      <WoodrightWordmark className="logo-image" />
      <span
        className={`logo-kids-slot${isKids ? " is-visible" : ""}`}
        aria-hidden="true"
      >
        <span className="logo-kids-badge">Kids</span>
      </span>
    </Link>
  )
}
