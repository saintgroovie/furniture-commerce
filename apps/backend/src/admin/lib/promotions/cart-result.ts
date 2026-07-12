/**
 * Package E — cart verification result attribution.
 * Maps Store cart adjustments back to expected promotion codes. When the cart
 * carries adjustments that cannot be attributed to a single expected code
 * (missing code fields, foreign codes, several candidates), the verdict is
 * `unknown` — the UI must never guess which promotion produced a discount.
 */

export type CartAdjustmentLike = {
  id?: string
  code?: string | null
  promotion_id?: string | null
  amount?: number | string | null
  description?: string | null
}

export type StoreCartLike = {
  id?: string
  items?: Array<{
    id?: string
    adjustments?: CartAdjustmentLike[] | null
  }> | null
  shipping_methods?: Array<{
    id?: string
    adjustments?: CartAdjustmentLike[] | null
  }> | null
  promotions?: Array<{ id?: string; code?: string | null }> | null
}

export type CodeAttribution = {
  code: string
  outcome: "applied" | "not_applied"
  /** Sum of adjustment amounts attributed to this code; null when unknown. */
  total_amount: number | null
  adjustment_count: number
}

export type CartAttributionResult = {
  per_code: CodeAttribution[]
  /** Adjustments that could not be attributed to any expected code. */
  unattributed_count: number
  unattributed_amount: number
  verdict: "all_applied" | "partially_applied" | "none_applied" | "unknown"
  explanation: string
}

function toAmount(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
    return Number(value)
  }
  return null
}

function collectAdjustments(cart: StoreCartLike): CartAdjustmentLike[] {
  const out: CartAdjustmentLike[] = []
  for (const item of cart.items ?? []) {
    for (const adj of item?.adjustments ?? []) out.push(adj)
  }
  for (const sm of cart.shipping_methods ?? []) {
    for (const adj of sm?.adjustments ?? []) out.push(adj)
  }
  return out
}

export function attributeCartAdjustments(input: {
  cart: StoreCartLike
  expected_codes: string[]
}): CartAttributionResult {
  const expected = [...new Set(input.expected_codes.map((c) => c.trim().toUpperCase()))].filter(
    Boolean
  )
  const adjustments = collectAdjustments(input.cart)

  const byCode = new Map<string, { total: number | null; count: number }>()
  for (const code of expected) byCode.set(code, { total: 0, count: 0 })

  let unattributedCount = 0
  let unattributedAmount = 0
  let hasAmbiguous = false

  for (const adj of adjustments) {
    const code = (adj.code ?? "").trim().toUpperCase()
    const amount = toAmount(adj.amount)
    if (code && byCode.has(code)) {
      const slot = byCode.get(code)!
      slot.count += 1
      slot.total = slot.total == null || amount == null ? null : slot.total + amount
      continue
    }
    // No code on the adjustment, or a code we did not expect.
    unattributedCount += 1
    unattributedAmount += amount ?? 0
    if (!code && expected.length > 1) {
      // Several expected codes and an anonymous adjustment — attribution is
      // genuinely ambiguous.
      hasAmbiguous = true
    } else if (!code && expected.length === 1 && adjustments.length > 1) {
      // Mixed anonymous + coded adjustments — cannot split honestly.
      hasAmbiguous = true
    }
  }

  const perCode: CodeAttribution[] = expected.map((code) => {
    const slot = byCode.get(code)!
    return {
      code,
      outcome: slot.count > 0 ? "applied" : "not_applied",
      total_amount: slot.count > 0 ? slot.total : null,
      adjustment_count: slot.count,
    }
  })

  const appliedCount = perCode.filter((p) => p.outcome === "applied").length

  let verdict: CartAttributionResult["verdict"]
  let explanation: string
  if (hasAmbiguous || (unattributedCount > 0 && expected.length > 0 && appliedCount === 0)) {
    verdict = "unknown"
    explanation =
      "В корзине есть скидки, которые нельзя однозначно связать с проверяемыми кодами - результат не подтверждён"
  } else if (expected.length === 0) {
    verdict = adjustments.length ? "unknown" : "none_applied"
    explanation = adjustments.length
      ? "Коды не переданы, но в корзине есть скидки - источник не определён"
      : "Коды не переданы, скидок в корзине нет"
  } else if (appliedCount === expected.length) {
    verdict = "all_applied"
    explanation =
      unattributedCount > 0
        ? "Все проверяемые коды сработали, но в корзине есть и другие скидки"
        : "Все проверяемые коды сработали"
  } else if (appliedCount > 0) {
    verdict = "partially_applied"
    explanation = "Сработала только часть проверяемых кодов"
  } else {
    verdict = "none_applied"
    explanation = "Ни один из проверяемых кодов не дал скидку в корзине"
  }

  return {
    per_code: perCode,
    unattributed_count: unattributedCount,
    unattributed_amount: unattributedAmount,
    verdict,
    explanation,
  }
}
