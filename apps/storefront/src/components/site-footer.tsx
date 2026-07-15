"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { WoodrightWordmark } from "@/components/woodright-wordmark"
import { useKidsSection } from "@/lib/use-kids-section"

function isKidsPath(pathname: string): boolean {
  return pathname === "/kids" || pathname.startsWith("/kids/")
}

/**
 * Footer shell: kids sage wash via data-section (same flag as the header),
 * and Woodright Kids wordmark linking to /kids when the section is active.
 *
 * Brand link href / aria-label follow the same pathname-first hydration rule
 * as HeaderLogo so Kids PDP chrome cannot mismatch SSR markup.
 */
export function SiteFooter({
  brandBody,
  nav,
  bottom,
}: {
  brandBody: ReactNode
  nav: ReactNode
  bottom: ReactNode
}) {
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
    <footer
      className="site-footer"
      data-section={isKidsVisual ? "kids" : "main"}
    >
      <div className="container footer-inner">
        <div className="footer-columns">
          <div className="footer-column footer-brand">
            <div className="footer-brand-copy">
              <Link
                href={isKidsNav ? "/kids" : "/"}
                className="footer-column-title footer-brand-logo"
                aria-label={
                  isKidsNav
                    ? "Woodright Kids - на главную детской"
                    : "Woodright - на главную"
                }
              >
                <span className="footer-brand-mark">
                  <WoodrightWordmark className="footer-brand-wordmark" />
                  <span
                    className={`logo-kids-slot${isKidsVisual ? " is-visible" : ""}`}
                    aria-hidden="true"
                  >
                    <span className="logo-kids-badge">Kids</span>
                  </span>
                </span>
              </Link>
              {brandBody}
            </div>
          </div>
          {nav}
        </div>
        {bottom}
      </div>
    </footer>
  )
}
