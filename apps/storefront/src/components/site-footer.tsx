import type { ReactNode } from "react"
import { FooterBrandLogo } from "@/components/footer-brand-logo"
import { SiteFooterChrome } from "@/components/site-footer-chrome"

/**
 * Footer shell (server): kids chrome is a thin client island.
 * Brand/nav/bottom stay server-rendered so RootLayout slots are not
 * re-parented through a client component list boundary.
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
  return (
    <SiteFooterChrome>
      <div className="container footer-inner">
        <div className="footer-columns">
          <div className="footer-column footer-brand">
            <div className="footer-brand-copy">
              <FooterBrandLogo />
              {brandBody}
            </div>
          </div>
          {nav}
        </div>
        {bottom}
      </div>
    </SiteFooterChrome>
  )
}
