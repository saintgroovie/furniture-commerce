"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import { BespokeBadge } from "@/components/bespoke-badge"
import { WoodrightWordmark } from "@/components/woodright-wordmark"
import { useChromeVisual, useSiteSection } from "@/lib/use-site-section"

/**
 * Footer shell: kids sage / bespoke teal wash via data-section (same flag
 * as the header). Wordmark links to /kids or /bespoke when that section
 * is active. Visual chrome follows `useChromeVisual` so kids → PDP
 * replays enter.
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
  const section = useSiteSection()
  const { section: visual, kids: visualKids, snap } = useChromeVisual()
  const href = section === "kids" ? "/kids" : section === "bespoke" ? "/bespoke" : "/"
  const ariaLabel =
    section === "kids"
      ? "Woodright Kids - на главную детской"
      : section === "bespoke"
        ? "Woodright Bespoke"
        : "Woodright - на главную"

  return (
    <footer
      className={`site-footer${snap ? " is-kids-snap" : ""}`}
      data-section={visual}
    >
      <div className="footer-inner">
        <div className="footer-columns">
          <div className="footer-column footer-brand">
            <div className="footer-brand-copy">
              <Link
                href={href}
                className="footer-column-title footer-brand-logo"
                aria-label={ariaLabel}
              >
                <span className="footer-brand-mark">
                  <span className="footer-brand-lockup">
                    <WoodrightWordmark className="footer-brand-wordmark" />
                    <span
                      className={`logo-kids-slot${visualKids ? " is-visible" : ""}${snap ? " is-snap" : ""}`}
                      aria-hidden="true"
                    >
                      <span className="logo-kids-badge">Kids</span>
                    </span>
                    {/* BESPOKE capsule sits right of the wordmark, same row as KIDS. */}
                    <span className="logo-bespoke-slot" aria-hidden="true">
                      <BespokeBadge />
                    </span>
                  </span>
                </span>
              </Link>
              {brandBody}
              {visual === "bespoke" ? (
                <span className="footer-row footer-bespoke-line">
                  Woodright Bespoke - мебель по проекту
                </span>
              ) : null}
            </div>
          </div>
          {nav}
        </div>
        {bottom}
      </div>
    </footer>
  )
}
