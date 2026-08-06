"use client"

/**
 * Mobile navigation — parity with desktop buyer routes.
 * Baseline architecture (woodright-copy + CSS scroll-lock class) preserved.
 * Package A1 gap-fill: focus containment, closed-menu unmount, Escape/focus restore.
 * Contacts: expandable showroom panel (no hover), data from showroomContacts.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ShowroomContactsContent } from "@/components/showroom-contacts-content"
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
]

const PANEL_ID = "mobile-nav-panel"

export function MobileNav() {
  const [open, setOpen] = useState(false)
  const [contactsOpen, setContactsOpen] = useState(false)
  const [portalReady, setPortalReady] = useState(false)
  const pathname = usePathname()
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const contactsTriggerRef = useRef<HTMLButtonElement>(null)
  const contactsOpenRef = useRef(false)
  const contactsPanelId = useId().replace(/:/g, "")
  const contactsRegionId = `mobile-contacts-${contactsPanelId}`

  contactsOpenRef.current = contactsOpen

  useEffect(() => {
    setPortalReady(true)
  }, [])

  const close = useCallback((restoreFocus = true) => {
    setOpen(false)
    setContactsOpen(false)
    if (restoreFocus) {
      requestAnimationFrame(() => btnRef.current?.focus())
    }
  }, [])

  // Close on route change (after link navigation).
  useEffect(() => {
    setOpen(false)
    setContactsOpen(false)
  }, [pathname])

  // Scroll-lock + initial focus + keyboard trap. Depends only on `open`
  // so expanding «Контакты» does not steal focus back to the first link.
  useEffect(() => {
    if (!open) {
      document.body.classList.remove("mobile-nav-open")
      document.documentElement.classList.remove("mobile-nav-open")
      return
    }

    document.body.classList.add("mobile-nav-open")
    document.documentElement.classList.add("mobile-nav-open")

    const panel = panelRef.current
    const focusables = () =>
      panel
        ? Array.from(
            panel.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
          ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1)
        : []

    requestAnimationFrame(() => {
      focusables()[0]?.focus()
    })

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        if (contactsOpenRef.current) {
          setContactsOpen(false)
          requestAnimationFrame(() => contactsTriggerRef.current?.focus())
          return
        }
        close(true)
        return
      }
      if (e.key !== "Tab" || !panel) return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      } else if (active && !panel.contains(active) && active !== btnRef.current) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.body.classList.remove("mobile-nav-open")
      document.documentElement.classList.remove("mobile-nav-open")
    }
  }, [open, close])

  function toggle() {
    if (open) close(true)
    else setOpen(true)
  }

  const overlay =
    portalReady && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            id={PANEL_ID}
            className={`mobile-nav-overlay${open ? " is-open" : ""}`}
            data-open={open ? "true" : "false"}
            aria-hidden={!open}
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
              <div className="mobile-nav-contacts">
                <Link href="/contacts" onClick={() => close(false)}>
                  {navCopy.contacts}
                </Link>
                <button
                  ref={contactsTriggerRef}
                  type="button"
                  className="mobile-nav-contacts-trigger"
                  aria-expanded={contactsOpen}
                  aria-controls={contactsRegionId}
                  onClick={() => setContactsOpen((v) => !v)}
                >
                  <span>Шоурум и мессенджеры</span>
                  <span
                    className="mobile-nav-contacts-chevron"
                    data-expanded={contactsOpen ? "true" : "false"}
                    aria-hidden="true"
                  />
                </button>
                {contactsOpen ? (
                  <div
                    id={contactsRegionId}
                    className="mobile-nav-contacts-panel"
                    role="region"
                    aria-label={navCopy.contacts}
                  >
                    <ShowroomContactsContent
                      variant="mobile"
                      idPrefix={contactsRegionId}
                    />
                  </div>
                ) : null}
              </div>
                </div>
                <div className="mobile-nav-group mobile-nav-group-cart">
                  <Link href="/cart" onClick={() => close(false)}>
                    {navCopy.cart}
                  </Link>
                </div>
              </nav>
            ) : null}
          </div>,
          document.body
        )
      : null

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
      {overlay}
    </>
  )
}
