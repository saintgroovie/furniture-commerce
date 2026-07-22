"use client"

/**
 * Mobile navigation — parity with desktop buyer routes.
 * Disclosure + dialog pattern: focus containment, Escape, focus restore,
 * background inert while open (WCAG 2.2 focus management).
 */
import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
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

function setBackgroundInert(enabled: boolean) {
  const main = document.getElementById("main-content")
  const footer = document.querySelector("footer")
  for (const el of [main, footer]) {
    if (!el) continue
    if (enabled) el.setAttribute("inert", "")
    else el.removeAttribute("inert")
  }
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

  useEffect(() => {
    if (!open) {
      document.body.classList.remove("mobile-nav-open")
      document.documentElement.classList.remove("mobile-nav-open")
      setBackgroundInert(false)
      return
    }

    document.body.classList.add("mobile-nav-open")
    document.documentElement.classList.add("mobile-nav-open")
    setBackgroundInert(true)

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
      setBackgroundInert(false)
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
