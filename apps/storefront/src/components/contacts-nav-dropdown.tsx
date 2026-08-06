"use client"

import Link from "next/link"
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
 * The label itself is a real link to `/contacts` (desktop parity with HEAD).
 * Hover / focus still opens the quick showroom panel; Escape / leave closes it.
 */
export function ContactsNavDropdown({ label, className }: Props) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLAnchorElement>(null)
  const suppressFocusOpenRef = useRef(false)
  const reactId = useId()
  const menuId = `contacts-menu-${reactId.replace(/:/g, "")}`

  useEffect(() => {
    if (!open) return

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
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
      <Link
        ref={triggerRef}
        href="/contacts"
        className="nav-dropdown-link contacts-nav-trigger"
        aria-expanded={open}
        aria-controls={menuId}
      >
        {label}
      </Link>
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
          <span className="contacts-nav-dropdown-bridge" aria-hidden="true" />
          <ShowroomContactsContent variant="desktop" idPrefix={menuId} />
          <Link href="/contacts" className="contacts-nav-page-link" onClick={closeMenu}>
            Страница контактов
          </Link>
        </div>
      ) : null}
    </div>
  )
}
