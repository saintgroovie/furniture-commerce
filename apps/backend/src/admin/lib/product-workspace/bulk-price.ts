import { formatMajorMoney } from "./price-input.ts"
import type { VariantMatrixRow } from "./variant-matrix-types.ts"
import { buildVariantPricesPayload } from "./price-payload.ts"

export type BulkPriceOp =
  | { type: "set"; amount: number; currency_code: string }
  | { type: "add_fixed"; delta: number; currency_code: string }
  | { type: "add_percent"; percent: number; currency_code: string }

export type BulkPreviewItem = {
  variant_id: string
  label: string
  skipped: boolean
  skip_reason?: string
  old_amount?: number
  new_amount?: number
}

export type BulkPreview = {
  currency_code: string
  operation_label: string
  selected_count: number
  will_change_count: number
  skipped_count: number
  old_min: number | null
  old_max: number | null
  new_min: number | null
  new_max: number | null
  summary: string
  items: BulkPreviewItem[]
}

/** Integer major units: round half away from zero via Math.round. */
export function applyBulkAmount(
  current: number | null,
  op: BulkPriceOp
): { ok: true; amount: number } | { ok: false; reason: string } {
  const currency = op.currency_code.trim().toLowerCase()
  if (!currency) return { ok: false, reason: "Не указана валюта." }

  if (op.type === "set") {
    if (!Number.isFinite(op.amount) || op.amount < 0) {
      return { ok: false, reason: "Некорректная новая сумма." }
    }
    return { ok: true, amount: Math.round(op.amount) }
  }

  if (current == null || !Number.isFinite(current)) {
    return { ok: false, reason: "Нет простой цены в этой валюте для изменения." }
  }

  if (op.type === "add_fixed") {
    if (!Number.isFinite(op.delta)) return { ok: false, reason: "Некорректная дельта." }
    const next = Math.round(current + op.delta)
    if (next < 0) return { ok: false, reason: "Результат отрицательный." }
    return { ok: true, amount: next }
  }

  if (op.type === "add_percent") {
    if (!Number.isFinite(op.percent)) return { ok: false, reason: "Некорректный процент." }
    const next = Math.round(current * (1 + op.percent / 100))
    if (next < 0) return { ok: false, reason: "Результат отрицательный." }
    return { ok: true, amount: next }
  }

  return { ok: false, reason: "Неизвестная операция." }
}

export function buildBulkPricePreview(
  selectedRows: VariantMatrixRow[],
  op: BulkPriceOp
): BulkPreview {
  const currency = op.currency_code.trim().toLowerCase()
  const items: BulkPreviewItem[] = []
  const changingOld: number[] = []
  const changingNew: number[] = []

  for (const row of selectedRows) {
    const label = `${row.display_title}${row.sku ? ` · ${row.sku}` : ""}`
    if (row.price_edit_blocked_reason) {
      items.push({
        variant_id: row.variant_id,
        label,
        skipped: true,
        skip_reason: row.price_edit_blocked_reason,
      })
      continue
    }
    const existing = row.prices.find((p) => p.currency_code.toLowerCase() === currency)
    const current = existing?.amount ?? null
    const applied = applyBulkAmount(current, op)
    if (!applied.ok) {
      items.push({
        variant_id: row.variant_id,
        label,
        skipped: true,
        skip_reason: applied.reason,
      })
      continue
    }
    const payload = buildVariantPricesPayload({
      existing: row.prices,
      currency_code: currency,
      amount: applied.amount,
      mode: existing ? "update" : "add",
    })
    if (!payload.ok) {
      items.push({
        variant_id: row.variant_id,
        label,
        skipped: true,
        skip_reason: "Нельзя безопасно собрать payload цен.",
      })
      continue
    }
    items.push({
      variant_id: row.variant_id,
      label,
      skipped: false,
      old_amount: current ?? undefined,
      new_amount: applied.amount,
    })
    if (current != null) changingOld.push(current)
    changingNew.push(applied.amount)
  }

  const will = items.filter((i) => !i.skipped)
  const skipped = items.filter((i) => i.skipped)
  const opLabel =
    op.type === "set"
      ? `установить ${formatMajorMoney(op.amount, currency)}`
      : op.type === "add_fixed"
        ? `изменить на ${op.delta >= 0 ? "+" : ""}${op.delta} ${currency.toUpperCase()}`
        : `изменить на ${op.percent >= 0 ? "+" : ""}${op.percent}%`

  const old_min = changingOld.length ? Math.min(...changingOld) : null
  const old_max = changingOld.length ? Math.max(...changingOld) : null
  const new_min = changingNew.length ? Math.min(...changingNew) : null
  const new_max = changingNew.length ? Math.max(...changingNew) : null

  const range = (min: number | null, max: number | null) => {
    if (min == null || max == null) return "—"
    if (min === max) return formatMajorMoney(min, currency)
    return `${formatMajorMoney(min, currency)}–${formatMajorMoney(max, currency)}`
  }

  const summary = `Будет изменена цена у ${will.length} из ${selectedRows.length} вариантов (${opLabel}). Было: ${range(old_min, old_max)}; станет: ${range(new_min, new_max)}. Пропущено: ${skipped.length}.`

  return {
    currency_code: currency,
    operation_label: opLabel,
    selected_count: selectedRows.length,
    will_change_count: will.length,
    skipped_count: skipped.length,
    old_min,
    old_max,
    new_min,
    new_max,
    summary,
    items,
  }
}
