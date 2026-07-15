"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import { WoodrightWordmark } from "@/components/woodright-wordmark"
import { useKidsChromeVisual, useKidsSection } from "@/lib/use-kids-section"

/**
 * Footer shell: kids sage wash via data-section (same flag as the header),
 * and Woodright Kids wordmark linking to /kids when the section is active.
 * Visual chrome follows `useKidsChromeVisual` so kids → PDP replays enter.
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
  const sectionKids = useKidsSection()
  const { kids: visualKids, snap } = useKidsChromeVisual()

  return (
    <footer
      className={`site-footer${snap ? " is-kids-snap" : ""}`}
      data-section={visualKids ? "kids" : "main"}
    >
      <div className="container footer-inner">
        <div className="footer-columns">
          <div className="footer-column footer-brand">
            <div className="footer-brand-copy">
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
