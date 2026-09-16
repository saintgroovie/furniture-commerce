"use client"

/**
 * Mobile navigation — parity with desktop buyer routes.
 * Disclosure + dialog pattern: focus containment, Escape, focus restore,
 * background inert while open (WCAG 2.2 focus management).
 * Showroom + Contacts: plain /contacts links (no hover dropdown / no accordion).
 */
import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BUYER_CLOSE_PEER_EVENT,
  BUYER_DIALOG_LAYER,
  BUYER_MOBILE_MQ,
  handleDialogKeydown,
  listFocusable,
  requestCloseBuyerDialogPeer,
  setBuyerChromeInert,
  type BuyerClosePeerDetail,
} from "@/lib/buyer-dialog-a11y"
import { a11yCopy, nav as navCopy } from "@/lib/woodright-copy"
import { isPrimaryNavCurrent } from "@/lib/nav-current"
import { WoodrightWordmark } from "@/components/woodright-wordmark"

type NavLink = {
  href: string
  label: string
  className?: string
}

const PRIMARY: NavLink[] = [
  { href: "/catalog", label: navCopy.catalog },
  { href: "/rooms", label: navCopy.rooms },
  { href: "/kids", label: navCopy.kids, className: "mobile-nav-kids" },
  { href: "/bespoke", label: navCopy.bespoke },
]

const SECONDARY: NavLink[] = [
  { href: "/about", label: navCopy.about },
  { href: "/partners", label: navCopy.partners },
  { href: "/designers", label: navCopy.designers },
]

const PANEL_ID = "mobile-nav-panel"
const LAYER = BUYER_DIALOG_LAYER.mobileNav

function setMobileNavBackgroundInert(enabled: boolean) {
  /* Header chrome (top + main nav) + main + footer. The MobileNav trigger
     and dialog stay outside those sections so they remain operable. */
  setBuyerChromeInert(
    enabled,
    [document.getElementById("main-content")],
    LAYER
  )
}

export function MobileNav() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const [pathAtOpen, setPathAtOpen] = useState(pathname)
  const btnRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on route change (adjust state during render - React-recommended reset).
  if (pathname !== pathAtOpen) {
    setPathAtOpen(pathname)
    if (open) setOpen(false)
  }

  const close = useCallback((restoreFocus = true) => {
    setOpen(false)
    if (restoreFocus) {
      requestAnimationFrame(() => btnRef.current?.focus())
    }
  }, [])

  // Peer dialog (catalog filters) requested exclusive ownership.
  useEffect(() => {
    function onPeerClose(e: Event) {
      const detail = (e as CustomEvent<BuyerClosePeerDetail>).detail
      if (detail?.exceptLayer === LAYER) return
      setOpen(false)
    }
    document.addEventListener(BUYER_CLOSE_PEER_EVENT, onPeerClose)
    return () => document.removeEventListener(BUYER_CLOSE_PEER_EVENT, onPeerClose)
  }, [])

  // Desktop viewport: clear mobile-only dialog state + inert.
  useEffect(() => {
    const mq = window.matchMedia(BUYER_MOBILE_MQ)
    function onChange() {
      if (!mq.matches) setOpen(false)
    }
    onChange()
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  // Scroll-lock + initial focus + keyboard trap.
  useEffect(() => {
    if (!open) {
      document.body.classList.remove("mobile-nav-open")
      document.documentElement.classList.remove("mobile-nav-open")
      setMobileNavBackgroundInert(false)
      return
    }

    requestCloseBuyerDialogPeer(LAYER)
    document.body.classList.add("mobile-nav-open")
    document.documentElement.classList.add("mobile-nav-open")
    setMobileNavBackgroundInert(true)

    const panel = panelRef.current

    requestAnimationFrame(() => {
      // The sheet's own close button first: the safe, non-navigating control
      // (the brand link would send a screen-reader user home).
      const first = closeRef.current ?? listFocusable(panel)[0]
      first?.focus()
    })

    function onKeyDown(e: KeyboardEvent) {
      handleDialogKeydown(e, {
        panel,
        trigger: btnRef.current,
        onEscape: () => close(true),
      })
    }

    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.body.classList.remove("mobile-nav-open")
      document.documentElement.classList.remove("mobile-nav-open")
      setMobileNavBackgroundInert(false)
    }
  }, [open, close])

  function toggle() {
    if (open) close(true)
    else setOpen(true)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="mobile-nav-btn"
        aria-expanded={open}
        aria-controls={PANEL_ID}
        aria-label={open ? a11yCopy.closeMenu : a11yCopy.openMenu}
        onClick={toggle}
      >
        <span className={`mobile-nav-icon${open ? " is-open" : ""}`} aria-hidden="true" />
      </button>

      <div
        ref={panelRef}
        id={PANEL_ID}
        className={`mobile-nav-overlay${open ? " is-open" : ""}`}
        data-open={open ? "true" : "false"}
        {...(open
          ? {
              role: "dialog",
              "aria-modal": true as const,
              "aria-label": a11yCopy.mobileNavLabel,
            }
          : { "aria-hidden": true as const })}
      >
        {open ? (
          <>
            {/* Own top row: the sheet covers the whole viewport (inset: 0), so
                it no longer depends on the sticky header staying in view -
                in-app browsers (Telegram / VK) scrolled it away and page
                content peeked above the menu. */}
            <div className="mobile-nav-top">
              <Link
                href="/"
                className="mobile-nav-brand"
                aria-label="Woodright - на главную"
                onClick={() => close(false)}
              >
                <WoodrightWordmark className="logo-image" />
              </Link>
              <button
                ref={closeRef}
                type="button"
                className="mobile-nav-close"
                aria-label={a11yCopy.closeMenu}
                onClick={() => close(true)}
              >
                <span className="mobile-nav-icon is-open" aria-hidden="true" />
              </button>
            </div>
            <nav className="mobile-nav" aria-label={a11yCopy.mobileNavLabel}>
              <div className="mobile-nav-group">
                {PRIMARY.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={item.className}
                    aria-current={
                      isPrimaryNavCurrent(pathname, item.href) ? "page" : undefined
                    }
                    onClick={() => close(false)}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
              <div className="mobile-nav-group">
                {SECONDARY.map((item) => (
                  <Link key={item.href} href={item.href} onClick={() => close(false)}>
                    {item.label}
                  </Link>
                ))}
                <Link
                  href="/contacts"
                  className="mobile-nav-showroom-link"
                  onClick={() => close(false)}
                >
                  {navCopy.showroom}
                </Link>
                <Link href="/contacts" onClick={() => close(false)}>
                  {navCopy.contacts}
                </Link>
              </div>
              <div className="mobile-nav-group mobile-nav-group-cart">
                <Link href="/cart" onClick={() => close(false)}>
                  {navCopy.cart}
                </Link>
              </div>
            </nav>
          </>
        ) : null}
      </div>
    </>
  )
}
