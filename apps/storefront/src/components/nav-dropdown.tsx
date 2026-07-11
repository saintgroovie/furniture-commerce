"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"

type Props = {
  label: string
  href: string
  items: Array<{ label: string; href: string }>
  className?: string
}

export function NavDropdown({ label, href, items, className }: Props) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const menuId = `menu-${href.replace(/\W/g, "")}`

  useEffect(() => {
    if (!open) return

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false)
        containerRef.current
          ?.querySelector<HTMLButtonElement>(".nav-dropdown-toggle")
          ?.focus()
      }
    }

    function onClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }

    document.addEventListener("keydown", onKeyDown)
    document.addEventListener("mousedown", onClickOutside)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("mousedown", onClickOutside)
    }
  }, [open])

  return (
    <div
      className={className ? `nav-dropdown ${className}` : "nav-dropdown"}
      ref={containerRef}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Link
        href={href}
        className="nav-dropdown-link"
        onClick={() => setOpen(false)}
      >
        {label}
      </Link>
      <button
        type="button"
        className="nav-dropdown-toggle"
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="true"
        aria-label={`${label}, подменю`}
        onClick={() => setOpen((v) => !v)}
      />
      {open && (
        <div id={menuId} className="nav-dropdown-menu">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
