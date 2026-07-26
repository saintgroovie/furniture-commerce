"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type ReactNode,
} from "react"

type SetActiveId = (
  next: string | null | ((prev: string | null) => string | null)
) => void

type DropdownContextValue = {
  activeId: string | null
  setActiveId: SetActiveId
}

const HeaderHoverDropdownContext = createContext<DropdownContextValue | null>(
  null
)

/** Coordinates exclusive open state across top-bar hover dropdowns. */
export function HeaderHoverDropdownProvider({
  children,
}: {
  children: ReactNode
}) {
  const [activeId, setActiveIdState] = useState<string | null>(null)
  const setActiveId = useCallback<SetActiveId>((next) => {
    setActiveIdState((prev) =>
      typeof next === "function" ? next(prev) : next
    )
  }, [])

  return (
    <HeaderHoverDropdownContext.Provider value={{ activeId, setActiveId }}>
      {children}
    </HeaderHoverDropdownContext.Provider>
  )
}

type Props = {
  /** Stable id for exclusive open coordination. */
  id: string
  href: string
  label: string
  align?: "start" | "end"
  className?: string
  children: ReactNode
}

/**
 * Top-bar hover/focus preview dropdown with a real navigation link trigger.
 * - Hover / keyboard focus opens the panel
 * - Click / Enter on the trigger navigates to `href` (no preventDefault, no click-toggle)
 * - Escape closes and restores focus; suppressFocusOpenRef cannot stick
 * - At most one coordinated panel is open at a time
 */
export function HeaderHoverDropdown({
  id,
  href,
  label,
  align = "start",
  className,
  children,
}: Props) {
  const ctx = useContext(HeaderHoverDropdownContext)
  if (!ctx) {
    throw new Error("HeaderHoverDropdown requires HeaderHoverDropdownProvider")
  }
  const { activeId, setActiveId } = ctx
  const open = activeId === id

  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLAnchorElement>(null)
  const suppressFocusOpenRef = useRef(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reactId = useId()
  const menuId = `header-hover-${id}-${reactId.replace(/:/g, "")}`
  const pathname = usePathname()

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const openMenu = useCallback(() => {
    clearCloseTimer()
    setActiveId(id)
  }, [clearCloseTimer, id, setActiveId])

  const closeMenu = useCallback(() => {
    clearCloseTimer()
    setActiveId((prev) => (prev === id ? null : prev))
  }, [clearCloseTimer, id, setActiveId])

  /** Delayed close so the cursor can cross into a sibling dropdown without flicker. */
  const scheduleClose = useCallback(() => {
    clearCloseTimer()
    closeTimerRef.current = setTimeout(() => {
      setActiveId((prev) => (prev === id ? null : prev))
    }, 60)
  }, [clearCloseTimer, id, setActiveId])

  useEffect(() => {
    return () => clearCloseTimer()
  }, [clearCloseTimer])

  // Close after navigation.
  useEffect(() => {
    setActiveId(null)
  }, [pathname, setActiveId])

  useEffect(() => {
    if (!open) return

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        // Suppress only the focus() we issue below. If the trigger is already
        // focused, focus() is a no-op and no focus event runs - clear on rAF
        // so the flag cannot stick and block a later keyboard reopen.
        suppressFocusOpenRef.current = true
        setActiveId((prev) => (prev === id ? null : prev))
        triggerRef.current?.focus()
        requestAnimationFrame(() => {
          suppressFocusOpenRef.current = false
        })
      }
    }

    function onPointerDownOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setActiveId((prev) => (prev === id ? null : prev))
      }
    }

    document.addEventListener("keydown", onKeyDown)
    document.addEventListener("mousedown", onPointerDownOutside)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("mousedown", onPointerDownOutside)
    }
  }, [open, id, setActiveId])

  function onFocus() {
    if (suppressFocusOpenRef.current) {
      suppressFocusOpenRef.current = false
      return
    }
    openMenu()
  }

  function onBlur(e: ReactFocusEvent<HTMLDivElement>) {
    const next = e.relatedTarget as Node | null
    if (next && containerRef.current?.contains(next)) return
    closeMenu()
  }

  const rootClass = [
    "nav-dropdown",
    "contacts-nav-dropdown",
    `contacts-nav-dropdown--align-${align}`,
    className,
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <div
      className={rootClass}
      ref={containerRef}
      onMouseEnter={openMenu}
      onMouseLeave={scheduleClose}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <Link
        ref={triggerRef}
        href={href}
        className="nav-dropdown-link contacts-nav-trigger"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={menuId}
      >
        <span className="contacts-nav-trigger-label">{label}</span>
        <span
          className="nav-dropdown-toggle contacts-nav-chevron"
          aria-hidden="true"
          data-expanded={open ? "true" : "false"}
        />
      </Link>
      {open ? (
        <div
          id={menuId}
          className="nav-dropdown-menu contacts-nav-dropdown-menu"
          role="region"
          aria-label={label}
        >
          <span className="contacts-nav-dropdown-bridge" aria-hidden="true" />
          {children}
        </div>
      ) : null}
    </div>
  )
}
