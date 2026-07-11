"use client"

import type { KeyboardEvent } from "react"
import { useCallback, useEffect, useId, useRef, useState } from "react"

export type CatalogSortOption = { value: string; label: string }

type Props = {
  options: CatalogSortOption[]
  value: string
  onChange: (value: string) => void
  ariaLabel: string
}

/**
 * Custom listbox-style dropdown for catalog controls (sort). Visual-only
 * replacement for the native <select>: the selected value still flows through
 * the same onChange -> navigate() path, so filtering and query params are
 * untouched. Closes on outside click and Escape, supports arrow-key
 * navigation, and renders above the grid (no overflow clipping).
 */
export function CatalogSortDropdown({ options, value, onChange, ariaLabel }: Props) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, options.findIndex((o) => o.value === value))
  )
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listboxId = useId()

  const selected = options.find((o) => o.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  const openList = useCallback(() => {
    setActiveIndex(Math.max(0, options.findIndex((o) => o.value === value)))
    setOpen(true)
  }, [options, value])

  const commit = useCallback(
    (idx: number) => {
      const opt = options[idx]
      setOpen(false)
      buttonRef.current?.focus()
      if (opt && opt.value !== value) onChange(opt.value)
    },
    [onChange, options, value]
  )

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        if (open) setActiveIndex((i) => Math.min(options.length - 1, i + 1))
        else openList()
        break
      case "ArrowUp":
        e.preventDefault()
        if (open) setActiveIndex((i) => Math.max(0, i - 1))
        else openList()
        break
      case "Home":
        if (open) {
          e.preventDefault()
          setActiveIndex(0)
        }
        break
      case "End":
        if (open) {
          e.preventDefault()
          setActiveIndex(options.length - 1)
        }
        break
      case "Enter":
      case " ":
        e.preventDefault()
        if (open) commit(activeIndex)
        else openList()
        break
      case "Escape":
        if (open) {
          e.preventDefault()
          setOpen(false)
        }
        break
      case "Tab":
        setOpen(false)
        break
    }
  }

  return (
    <div className="wr-select" ref={rootRef}>
      {/* APG select-only combobox: the trigger exposes role="combobox", so its
          accessible NAME comes from aria-label («Сортировка») while its VALUE
          is the visible selected-option text — screen readers announce both. */}
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        className={`wr-select-trigger${open ? " is-open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open ? `${listboxId}-opt-${activeIndex}` : undefined}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
      >
        <span className="wr-select-value">{selected?.label}</span>
        <span className="wr-select-chevron" aria-hidden="true" />
      </button>
      {open && (
        <ul className="wr-select-menu" role="listbox" id={listboxId} aria-label={ariaLabel}>
          {options.map((opt, idx) => {
            const isSelected = opt.value === value
            const isActive = idx === activeIndex
            return (
              <li
                key={opt.value}
                id={`${listboxId}-opt-${idx}`}
                role="option"
                aria-selected={isSelected}
                className={`wr-select-option${isSelected ? " is-selected" : ""}${isActive ? " is-active" : ""}`}
                onPointerEnter={() => setActiveIndex(idx)}
                onClick={() => commit(idx)}
              >
                {opt.label}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
