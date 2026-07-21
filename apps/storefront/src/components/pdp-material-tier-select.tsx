"use client"

import type { KeyboardEvent } from "react"
import { useCallback, useEffect, useId, useRef, useState } from "react"
import type { MaterialTierOption } from "@/lib/material-tiers"
import {
  clearPdpMaterialSelection,
  materialCodeForProduct,
  publishPdpMaterialSelection,
  usePdpMaterialSelection,
} from "@/lib/cart/pdp-material-selection"
import {
  gateMatchesProduct,
  usePdpPurchaseGate,
} from "@/lib/cart/pdp-selection"
import {
  resolveConfiguredUnitPrice,
  resolveFinishColorMultiplier,
} from "@/lib/finish-color-premium"
import { formatRub } from "@/lib/format"
import { pdpCopy } from "@/lib/woodright-copy"

type Props = {
  /** Product handle/id — guards against a stale pick after client navigation. */
  productKey: string
  /** Ordered tier options from `metadata.material_tiers` (position 0 = default). */
  options: MaterialTierOption[]
  /** request_quote products show reference prices as «от … ₽». */
  requestQuote?: boolean
}

/**
 * PDP material execution dropdown — APG select-only combobox in the Woodright
 * visual language (see .pdp-material-* styles). The first option is always
 * selected by default; the pick is published to pdp-material-selection so the
 * price block and CTA react as one unit.
 */
export function PdpMaterialTierSelect({ productKey, options, requestQuote = false }: Props) {
  const [open, setOpen] = useState(false)
  const selection = usePdpMaterialSelection()
  const gate = usePdpPurchaseGate()
  const gateOk = gateMatchesProduct(gate, productKey)
  const selectedCode = materialCodeForProduct(selection, productKey) ?? options[0]?.code
  const selectedIndex = Math.max(0, options.findIndex((o) => o.code === selectedCode))
  const [activeIndex, setActiveIndex] = useState(selectedIndex)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listboxId = useId()

  const selected = options[selectedIndex] ?? options[0]
  const colorMultiplier = gateOk
    ? resolveFinishColorMultiplier(gate.finishKey, gate.standardFinishKey)
    : 1

  /* Publish cheapest (position 0) tier as the selected default so price, CTA,
     and cart metadata share one configuration identity from first paint. */
  useEffect(() => {
    const defaultTier = options[0]
    if (defaultTier) {
      publishPdpMaterialSelection({ productKey, code: defaultTier.code })
    }
    return () => clearPdpMaterialSelection()
    // options identity changes every render; key off the default code.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [productKey, options[0]?.code])

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
    setActiveIndex(Math.max(0, options.findIndex((o) => o.code === selectedCode)))
    setOpen(true)
  }, [options, selectedCode])

  const commit = useCallback(
    (idx: number) => {
      const opt = options[idx]
      setOpen(false)
      buttonRef.current?.focus()
      if (opt && opt.code !== selectedCode) {
        publishPdpMaterialSelection({ productKey, code: opt.code })
      }
    },
    [options, productKey, selectedCode]
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
          buttonRef.current?.focus()
        }
        break
      case "Tab":
        setOpen(false)
        break
    }
  }

  const priceLabel = (opt: MaterialTierOption): string | null => {
    /* Derive from solid_full base via multiplier so color premium stays consistent. */
    const solid = options.find((o) => o.multiplier === 1 && o.price != null)
    const base =
      solid?.price ??
      (opt.price != null && opt.multiplier > 0
        ? Math.round(opt.price / opt.multiplier)
        : null)
    if (base == null) return null
    const amount = resolveConfiguredUnitPrice(base, opt.multiplier, colorMultiplier)
    return requestQuote ? `от ${formatRub(amount)}` : formatRub(amount)
  }

  return (
    <div className="pdp-material-select" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        className={`pdp-material-trigger${open ? " is-open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open ? `${listboxId}-opt-${activeIndex}` : undefined}
        aria-label={pdpCopy.materialTierLabel}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
      >
        <span className="pdp-material-trigger-main">
          <span className="pdp-material-trigger-label">{pdpCopy.materialTierLabel}</span>
          <span className="pdp-material-trigger-value">{selected?.label}</span>
        </span>
        <span className="pdp-material-trigger-side">
          {selected && priceLabel(selected) != null && (
            <span className="pdp-material-trigger-price">{priceLabel(selected)}</span>
          )}
          <span className="pdp-material-chevron" aria-hidden="true" />
        </span>
      </button>
      {open && (
        <ul
          className="pdp-material-menu"
          role="listbox"
          id={listboxId}
          aria-label={pdpCopy.materialTierLabel}
        >
          {options.map((opt, idx) => {
            const isSelected = opt.code === selectedCode
            const isActive = idx === activeIndex
            return (
              <li
                key={opt.code}
                id={`${listboxId}-opt-${idx}`}
                role="option"
                aria-selected={isSelected}
                className={`pdp-material-option${isSelected ? " is-selected" : ""}${isActive ? " is-active" : ""}`}
                onPointerEnter={() => setActiveIndex(idx)}
                onClick={() => commit(idx)}
              >
                <span className="pdp-material-option-check" aria-hidden="true">
                  {isSelected && (
                    <svg viewBox="0 0 12 12" width="12" height="12" fill="none">
                      <path
                        d="M2 6.2 4.8 9 10 3.4"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                <span className="pdp-material-option-main">
                  <span className="pdp-material-option-label">{opt.label}</span>
                  {opt.description && (
                    <span className="pdp-material-option-desc">{opt.description}</span>
                  )}
                </span>
                {priceLabel(opt) != null && (
                  <span className="pdp-material-option-price">{priceLabel(opt)}</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
