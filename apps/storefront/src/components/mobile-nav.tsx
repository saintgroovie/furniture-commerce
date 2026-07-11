"use client"

/**
 * Mobile navigation — parity with desktop buyer routes.
 * Replaces the checkbox/aria-hidden hack with a real button + Escape/focus/scroll lock.
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

export function MobileNav() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelId = "mobile-nav-panel"
  const previouslyFocused = useRef<HTMLElement | null>(null)

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
      return
    }

    previouslyFocused.current = document.activeElement as HTMLElement | null
    document.body.classList.add("mobile-nav-open")
    document.documentElement.classList.add("mobile-nav-open")

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        close(true)
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
    if (open) {
      close(true)
    } else {
      setOpen(true)
    }
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="mobile-nav-btn"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? a11yCopy.closeMenu : a11yCopy.openMenu}
        onClick={toggle}
      >
        <span className={`mobile-nav-icon${open ? " is-open" : ""}`} aria-hidden="true" />
      </button>

      <div
        id={panelId}
        className={`mobile-nav-overlay${open ? " is-open" : ""}`}
        data-open={open ? "true" : "false"}
        aria-hidden={!open}
      >
        <nav className="mobile-nav" aria-label={a11yCopy.mobileNavLabel}>
          <div className="mobile-nav-group">
            {PRIMARY.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={item.className}
                tabIndex={open ? undefined : -1}
                onClick={() => close(false)}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="mobile-nav-group">
            {SECONDARY.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                tabIndex={open ? undefined : -1}
                onClick={() => close(false)}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="mobile-nav-group mobile-nav-group-cart">
            <Link
              href="/cart"
              tabIndex={open ? undefined : -1}
              onClick={() => close(false)}
            >
              {navCopy.cart}
            </Link>
          </div>
        </nav>
      </div>
    </>
  )
}
