"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { WoodrightWordmark } from "@/components/woodright-wordmark"
import { useKidsSection } from "@/lib/use-kids-section"

function isKidsPath(pathname: string): boolean {
  return pathname === "/kids" || pathname.startsWith("/kids/")
}

/**
 * Wordmark + «KIDS» pill. The pill stays in the DOM so adult ↔ kids is a
 * CSS tween (not a mount jump). .logo is translateX(-50%)-centered, so as
 * the slot width opens the pair re-centers and the wordmark glides left.
 *
 * Inline SVG (same geometry as the old 273×35 PNG box) so ink stays crisp
 * at any DPR; kids-slot width is fixed in rem and does not depend on
 * raster intrinsic size. Kids chrome links to /kids (not the adult home).
 *
 * Link href / aria-label use pathname on the first paint (SSR + hydration),
 * then may follow product-page kids chrome after mount — avoids aria-label
 * mismatches when KidsProductSection opts in under `/product/*`.
 */
export function HeaderLogo() {
  const pathname = usePathname() ?? ""
  const pathKids = isKidsPath(pathname)
  const chromeKids = useKidsSection()
  const [navChromeReady, setNavChromeReady] = useState(false)

  useEffect(() => {
    setNavChromeReady(true)
  }, [])

  const isKidsVisual = pathKids || chromeKids
  const isKidsNav = pathKids || (navChromeReady && chromeKids)

  return (
    <Link
      href={isKidsNav ? "/kids" : "/"}
      className="logo"
      aria-label={
        isKidsNav
          ? "Woodright Kids - на главную детской"
          : "Woodright - на главную"
      }
    >
      <WoodrightWordmark className="logo-image" />
      <span
        className={`logo-kids-slot${isKidsVisual ? " is-visible" : ""}`}
        aria-hidden="true"
      >
        <span className="logo-kids-badge">Kids</span>
      </span>
    </Link>
  )
}
