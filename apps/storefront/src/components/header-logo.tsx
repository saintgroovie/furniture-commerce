"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

/**
 * Wordmark + «KIDS» pill. The pill is always in the DOM so the switch
 * between the main site and the kids section is a CSS transition (a calm
 * slide-out reveal), not a mount/unmount jump — and since .logo is
 * horizontally centered via translateX(-50%), the wordmark itself glides
 * left to re-center as the badge unfolds, which is the whole effect.
 */
export function HeaderLogo() {
  const pathname = usePathname()
  const isKids = pathname === "/kids" || pathname.startsWith("/kids/")

  return (
    <Link
      href="/"
      className="logo"
      aria-label={isKids ? "Woodright Kids — на главную" : "Woodright — на главную"}
    >
      <img
        src="/brand/woodright-logo-transparent.png"
        srcSet="/brand/woodright-logo-transparent.png 1x, /brand/woodright-logo-transparent@3x.png 3x"
        alt="Woodright"
        className="logo-image"
        width={273}
        height={35}
      />
      {/* Slot clips; the pill slides within it. Two layers so the pill can
          physically «выезжать» from behind the wordmark's edge instead of
          just growing in place. */}
      <span
        className={`logo-kids-slot${isKids ? " is-visible" : ""}`}
        aria-hidden="true"
      >
        <span className="logo-kids-badge">Kids</span>
      </span>
    </Link>
  )
}
