"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import { WoodrightWordmark } from "@/components/woodright-wordmark"
import { useKidsSection } from "@/lib/use-kids-section"

/**
 * Footer shell: kids sage wash via data-section (same flag as the header),
 * and Woodright Kids wordmark linking to /kids when the section is active.
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
  const isKids = useKidsSection()

  return (
    <footer
      className="site-footer"
      data-section={isKids ? "kids" : "main"}
    >
      <div className="container footer-inner">
        <div className="footer-columns">
          <div className="footer-column footer-brand">
            <div className="footer-brand-copy">
              <Link
                href={isKids ? "/kids" : "/"}
                className="footer-column-title footer-brand-logo"
                aria-label={
                  isKids ? "Woodright Kids - на главную детской" : "Woodright - на главную"
                }
              >
                <span className="footer-brand-mark">
                  <WoodrightWordmark className="footer-brand-wordmark" />
                  <span
                    className={`logo-kids-slot${isKids ? " is-visible" : ""}`}
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
