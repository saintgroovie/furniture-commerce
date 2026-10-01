"use client"

import { useState } from "react"
import { formatRub } from "@/lib/format"

export function FirstPriceFields() {
  const [raw, setRaw] = useState("")
  const digits = raw.replace(/\s/g, "")
  const amount = /^\d+$/.test(digits) ? Number(digits) : null
  return (
    <>
      <label>
        Обычная цена, ₽
        <input
          name="amount"
          inputMode="numeric"
          required
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
        />
      </label>
      {amount && amount > 0 ? (
        <p>Будет создана первая обычная цена варианта: {formatRub(amount)}</p>
      ) : (
        <p className="muted">После ввода здесь появится сумма первой цены</p>
      )}
    </>
  )
}
