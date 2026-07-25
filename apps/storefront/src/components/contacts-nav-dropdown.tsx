"use client"

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
} from "react"
import { ShowroomContactsContent } from "@/components/showroom-contacts-content"

type Props = {
  label: string
  className?: string
}

/**
 * Top-bar «Контакты» control with a premium showroom panel.
 * Opens on hover, keyboard focus, and click; closes on leave, Escape, outside click.
 * Hover zone wraps trigger + panel so there is no dead gap that collapses the menu.
 *
 * Click always opens (does not toggle-close). Hover already opens before a mouse
 * click lands; a toggle would immediately close the panel. Close via leave /
 * outside / Escape instead.
 */
export function ContactsNavDropdown({ label, className }: Props) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const suppressFocusOpenRef = useRef(false)
  const reactId = useId()
  const menuId = `contacts-menu-${reactId.replace(/:/g, "")}`

  useEffect(() => {
    if (!open) return

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        // Suppress only the focus() we issue below. If the trigger is already
        // focused, focus() is a no-op and no focus event runs — clear on rAF
        // so the flag cannot stick and block a later keyboard reopen.
        suppressFocusOpenRef.current = true
        setOpen(false)
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
        setOpen(false)
      }
    }

    document.addEventListener("keydown", onKeyDown)
    document.addEventListener("mousedown", onPointerDownOutside)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("mousedown", onPointerDownOutside)
    }
  }, [open])

  function openMenu() {
    setOpen(true)
  }

  function closeMenu() {
    setOpen(false)
  }

  function onFocus() {
    if (suppressFocusOpenRef.current) {
      suppressFocusOpenRef.current = false
      return
    }
    setOpen(true)
  }

  function onBlur(e: ReactFocusEvent<HTMLDivElement>) {
    const next = e.relatedTarget as Node | null
    if (next && containerRef.current?.contains(next)) return
    setOpen(false)
  }

  const rootClass = className
    ? `nav-dropdown contacts-nav-dropdown ${className}`
    : "nav-dropdown contacts-nav-dropdown"

  return (
    <div
      className={rootClass}
      ref={containerRef}
      onMouseEnter={openMenu}
      onMouseLeave={closeMenu}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <button
        ref={triggerRef}
        type="button"
        className="nav-dropdown-link contacts-nav-trigger"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={openMenu}
      >
        {label}
      </button>
      <span
        className="nav-dropdown-toggle contacts-nav-chevron"
        aria-hidden="true"
        data-expanded={open ? "true" : "false"}
      />
      {open ? (
        <div
          id={menuId}
          className="nav-dropdown-menu contacts-nav-dropdown-menu"
          role="region"
          aria-label={label}
        >
          {/* Invisible bridge removes any hover flicker between trigger and panel. */}
          <span className="contacts-nav-dropdown-bridge" aria-hidden="true" />
          <ShowroomContactsContent variant="dropdown" idPrefix={menuId} />
        </div>
      ) : null}
    </div>
  )
}
