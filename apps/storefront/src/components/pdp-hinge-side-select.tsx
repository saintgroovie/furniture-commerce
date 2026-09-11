"use client"

import { useEffect } from "react"
import {
  clearPdpHingeSideSelection,
  hingeSideForProduct,
  publishPdpHingeSideSelection,
  usePdpHingeSideSelection,
  type HingeSideValue,
} from "@/lib/cart/pdp-hinge-side"
import { pdpCopy } from "@/lib/woodright-copy"

type Props = {
  productKey: string
}

const OPTIONS: Array<{ value: HingeSideValue; label: string }> = [
  { value: "left", label: pdpCopy.hingeSideLeft },
  { value: "right", label: pdpCopy.hingeSideRight },
]

/**
 * Same-product handle side (навеска двери). Not a SKU switch.
 */
export function PdpHingeSideSelect({ productKey }: Props) {
  const selection = usePdpHingeSideSelection()
  const current = hingeSideForProduct(selection, productKey)
  const valueLabel =
    OPTIONS.find((o) => o.value === current)?.label ?? pdpCopy.optionChooseValue

  useEffect(() => {
    return () => {
      clearPdpHingeSideSelection()
    }
  }, [productKey])

  return (
    <div className="pdp-size-selector" role="group" aria-label={pdpCopy.hingeSideLabel}>
      <span className="pdp-option-heading">
        <span className="pdp-option-heading-label">{pdpCopy.hingeSideLabel}</span>
        <span className="pdp-option-heading-sep" aria-hidden="true">
          {" - "}
        </span>
        <span className="pdp-option-heading-value">{valueLabel}</span>
      </span>
      <div className="pdp-size-chip-row">
        {OPTIONS.map((opt) => {
          const active = current === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              className={`pdp-size-chip${active ? " is-active" : ""}`}
              aria-pressed={active}
              onClick={() =>
                publishPdpHingeSideSelection({ productKey, value: opt.value })
              }
            >
              <span className="pdp-size-chip-label">{opt.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
