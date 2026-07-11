"use client"

/**
 * Accessible mobile navigation — parity with desktop buyer routes.
 * Non-modal full-viewport panel under the header (not a third-party dialog).
 * Focus is contained while open; closed links are removed from tab order.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { a1A11y, a1Nav } from "@/lib/package-a1-copy"

type NavLink = { href: string; label: string }

const PRIMARY: NavLink[] = [
  { href: "/catalog", label: a1Nav.catalog },
  { href: "/rooms", label: a1Nav.rooms },
  { href: "/kids", label: a1Nav.kids },
  { href: "/bespoke", label: a1Nav.bespoke },
]

const SECONDARY: NavLink[] = [
  { href: "/about", label: a1Nav.about },
  { href: "/designers", label: a1Nav.designers },
  { href: "/contacts", label: a1Nav.contacts },
]

const PANEL_ID = "mobile-nav-panel"

export function MobileNav() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const prevOverflow = useRef<{ body: string; html: string } | null>(null)

  const close = useCallback((restoreFocus = true) => {
    setOpen(false)
    if (restoreFocus) {
      requestAnimationFrame(() => btnRef.current?.focus())
    }
  }, [])

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) {
      if (prevOverflow.current) {
        document.body.style.overflow = prevOverflow.current.body
        document.documentElement.style.overflow = prevOverflow.current.html
        prevOverflow.current = null
      }
      return
    }

    prevOverflow.current = {
      body: document.body.style.overflow,
      html: document.documentElement.style.overflow,
    }
    document.body.style.overflow = "hidden"
    document.documentElement.style.overflow = "hidden"

    const panel = panelRef.current
    const focusables = () =>
      panel
        ? Array.from(
            panel.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
          ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1)
        : []

    // Move focus into the panel for keyboard users.
    requestAnimationFrame(() => {
      const first = focusables()[0]
      first?.focus()
    })

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
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
      if (prevOverflow.current) {
        document.body.style.overflow = prevOverflow.current.body
        document.documentElement.style.overflow = prevOverflow.current.html
        prevOverflow.current = null
      }
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
        aria-label={open ? a1A11y.closeMenu : a1A11y.openMenu}
        onClick={toggle}
      >
        <span className={`mobile-nav-icon${open ? " is-open" : ""}`} aria-hidden="true" />
      </button>

      <div
        ref={panelRef}
        id={PANEL_ID}
        className={`mobile-nav-overlay${open ? " is-open" : ""}`}
        data-open={open ? "true" : "false"}
        aria-hidden={!open}
      >
        {open ? (
          <nav className="mobile-nav" aria-label={a1A11y.mobileNavLabel}>
            <div className="mobile-nav-group">
              {PRIMARY.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => close(false)}>
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
                {a1Nav.cart}
              </Link>
            </div>
          </nav>
        ) : null}
      </div>
    </>
  )
}
