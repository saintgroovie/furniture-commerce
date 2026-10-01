"use client"

import { useState } from "react"
import { formatRub } from "@/lib/format"

/** First price of a variant: shows the exact amount that will be created before submit. */
export function FirstPriceFields({ defaultValue = "" }: { defaultValue?: string }) {
  const [raw, setRaw] = useState(defaultValue)
  const digits = raw.replace(/\s/g, "")
  const amount = /^\d+$/.test(digits) ? Number(digits) : null
  return (
    <>
      <label className="field">
        <span>Обычная цена, ₽</span>
        <input name="amount" inputMode="numeric" required value={raw} onChange={(event) => setRaw(event.target.value)} />
      </label>
      {amount && amount > 0 ? (
        <p className="meta">Будет создана первая обычная цена: {formatRub(amount)}</p>
      ) : (
        <p className="meta">После ввода здесь появится сумма первой цены</p>
      )}
    </>
  )
}
