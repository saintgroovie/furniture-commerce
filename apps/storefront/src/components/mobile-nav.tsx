"use client"

/**
 * Mobile navigation — parity with desktop buyer routes.
 * Baseline architecture (woodright-copy + CSS scroll-lock class) preserved.
 * Package A1 gap-fill: focus containment, closed-menu unmount, Escape/focus restore.
 * Showroom: expandable accordion (no hover); «Контакты» is a plain /contacts link.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react"
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
  const [showroomOpen, setShowroomOpen] = useState(false)
  const pathname = usePathname()
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const showroomTriggerRef = useRef<HTMLButtonElement>(null)
  const showroomOpenRef = useRef(false)
  const showroomPanelId = useId().replace(/:/g, "")
  const showroomRegionId = `mobile-showroom-${showroomPanelId}`

  showroomOpenRef.current = showroomOpen

  const close = useCallback((restoreFocus = true) => {
    setOpen(false)
    setShowroomOpen(false)
    if (restoreFocus) {
      requestAnimationFrame(() => btnRef.current?.focus())
    }
  }, [])

  // Close on route change (after link navigation).
  useEffect(() => {
    setOpen(false)
    setShowroomOpen(false)
  }, [pathname])

  // Scroll-lock + initial focus + keyboard trap. Depends only on `open`
  // so expanding the showroom accordion does not steal focus back to the first link.
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
        if (showroomOpenRef.current) {
          setShowroomOpen(false)
          requestAnimationFrame(() => showroomTriggerRef.current?.focus())
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
              <div className="mobile-nav-showroom">
                <button
                  ref={showroomTriggerRef}
                  type="button"
                  className="mobile-nav-showroom-trigger"
                  aria-expanded={showroomOpen}
                  aria-controls={showroomRegionId}
                  onClick={() => setShowroomOpen((v) => !v)}
                >
                  <span className="mobile-nav-showroom-label">{navCopy.showroom}</span>
                  <span
                    className="mobile-nav-showroom-chevron"
                    data-expanded={showroomOpen ? "true" : "false"}
                    aria-hidden="true"
                  />
                </button>
                {showroomOpen ? (
                  <div
                    id={showroomRegionId}
                    className="mobile-nav-showroom-panel"
                    role="region"
                    aria-label={navCopy.showroom}
                  >
                    <ShowroomContactsContent
                      variant="mobile"
                      idPrefix={showroomRegionId}
                    />
                  </div>
                ) : null}
              </div>
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
        ) : null}
      </div>
    </>
  )
}
