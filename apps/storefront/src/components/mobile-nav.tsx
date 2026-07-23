"use client"

/**
 * Mobile navigation — parity with desktop buyer routes.
 * Disclosure + dialog pattern: focus containment, Escape, focus restore,
 * background inert while open (WCAG 2.2 focus management).
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
  { href: "/designers", label: navCopy.designers },
  { href: "/contacts", label: navCopy.contacts },
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
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const close = useCallback((restoreFocus = true) => {
    setOpen(false)
    if (restoreFocus) {
      requestAnimationFrame(() => btnRef.current?.focus())
    }
  }, [])

  // Close on route change (after link navigation).
  useEffect(() => {
    setOpen(false)
  }, [pathname])

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
      listFocusable(panel)[0]?.focus()
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
          <nav className="mobile-nav" aria-label={a11yCopy.mobileNavLabel}>
            <div className="mobile-nav-group">
              {PRIMARY.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={item.className}
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
            </div>
            <div className="mobile-nav-group mobile-nav-group-cart">
              <Link href="/cart" onClick={() => close(false)}>
                {navCopy.cart}
              </Link>
            </div>
          </nav>
        ) : null}
      </div>
    </>
  )
}
