import type { ClassificationView } from "./types.ts"
import { formatMajorMoney } from "./price-input.ts"
import { variantPriceMutationGate } from "./price-editability.ts"
import type {
  AdminProductOptionDetailed,
  AdminVariantDetailed,
  VariantMatrixColumn,
  VariantMatrixRow,
  VariantMatrixView,
  VariantValidationIssue,
} from "./variant-matrix-types.ts"

function isDefaultOnlyProduct(
  options: AdminProductOptionDetailed[],
  variants: AdminVariantDetailed[]
): boolean {
  if (variants.length !== 1) return false
  if (options.length === 0) return true
  if (options.length === 1) {
    const title = (options[0].title ?? "").trim().toLowerCase()
    const values = options[0].values ?? []
    const onlyDefaultValue =
      values.length <= 1 &&
      ((values[0]?.value ?? "Default").trim().toLowerCase() === "default" || values.length === 0)
    return title === "default" && onlyDefaultValue
  }
  return false
}

function optionValueMap(
  variant: AdminVariantDetailed,
  columns: VariantMatrixColumn[]
): Record<string, string> {
  const map: Record<string, string> = {}
  for (const col of columns) map[col.option_id] = "—"
  for (const ov of variant.options ?? []) {
    const optionId = ov.option_id || ov.option?.id
    const title = (ov.option?.title ?? "").trim()
    const value = (ov.value ?? "").trim() || "—"
    if (optionId && map[optionId] !== undefined) {
      map[optionId] = value
      continue
    }
    const byTitle = columns.find((c) => c.title === title)
    if (byTitle) map[byTitle.option_id] = value
  }
  return map
}

function combinationKey(map: Record<string, string>, columns: VariantMatrixColumn[]): string {
  return columns.map((c) => `${c.option_id}=${map[c.option_id] ?? ""}`).join("|")
}

function buildRowIssues(args: {
  row: Omit<VariantMatrixRow, "issues">
  skuCounts: Map<string, number>
  comboCounts: Map<string, number>
  columns: VariantMatrixColumn[]
  defaultOnly: boolean
}): VariantValidationIssue[] {
  const issues: VariantValidationIssue[] = []
  const sku = (args.row.sku ?? "").trim()
  if (!sku) {
    issues.push({
      level: "attention",
      code: "missing_sku",
      field: "sku",
      message: "Нет артикула.",
      action: "Укажите артикул или оставьте пустым осознанно.",
    })
  } else if ((args.skuCounts.get(sku.toLowerCase()) ?? 0) > 1) {
    issues.push({
      level: "error",
      code: "duplicate_sku",
      field: "sku",
      message: "Этот артикул повторяется у другого варианта этого товара.",
      action: "Сделайте артикул уникальным внутри товара.",
    })
  }

  if (args.row.price_status === "missing") {
    issues.push({
      level: "attention",
      code: "missing_price",
      field: "price",
      message: "Нет цены.",
      action: "Добавьте простую цену в нужной валюте.",
    })
  }
  if (args.row.price_status === "complex" || args.row.price_status === "ambiguous") {
    issues.push({
      level: "info",
      code: "complex_price",
      field: "price",
      message: args.row.price_status_label,
      action: "Откройте варианты в полной карточке.",
    })
  }

  if (!args.defaultOnly && args.columns.length > 0) {
    const incomplete = args.columns.some((c) => {
      const v = args.row.option_values[c.option_id]
      return !v || v === "—"
    })
    if (incomplete) {
      issues.push({
        level: "attention",
        code: "incomplete_options",
        field: "options",
        message: "Неполная комбинация опций.",
        action: "Проверьте значения опций в полной карточке.",
      })
    }
    const key = combinationKey(args.row.option_values, args.columns)
    if ((args.comboCounts.get(key) ?? 0) > 1) {
      issues.push({
        level: "error",
        code: "duplicate_option_combo",
        field: "options",
        message: "Такая комбинация опций повторяется.",
        action: "Исправьте дубликат в полной карточке.",
      })
    }
  }

  return issues
}

function priceStatusFor(prices: VariantPriceRowLike[]): {
  status: VariantMatrixRow["price_status"]
  label: string
  primary_currency: string | null
  primary_amount: number | null
} {
  const list = prices
  if (list.length === 0) {
    return { status: "missing", label: "Нет цены", primary_currency: null, primary_amount: null }
  }
  const gate = variantPriceMutationGate(list)
  if (!gate.allowed) {
    return {
      status: list.some((p) => (p.min_quantity != null || p.max_quantity != null || (p.rules && Object.keys(p.rules).length)))
        ? "complex"
        : "ambiguous",
      label: gate.reason ?? "Сложная цена",
      primary_currency: list[0]?.currency_code ?? null,
      primary_amount: list[0]?.amount ?? null,
    }
  }
  const currencies = new Set(list.map((p) => p.currency_code.toLowerCase()))
  if (currencies.size > 1) {
    return {
      status: "multi",
      label: `Несколько валют (${[...currencies].map((c) => c.toUpperCase()).join(", ")})`,
      primary_currency: null,
      primary_amount: null,
    }
  }
  const p = list[0]
  if (p.amount === 0) {
    return {
      status: "zero",
      label: `0 (${p.currency_code.toUpperCase()})`,
      primary_currency: p.currency_code,
      primary_amount: 0,
    }
  }
  return {
    status: "ok",
    label: formatMajorMoney(p.amount, p.currency_code),
    primary_currency: p.currency_code,
    primary_amount: p.amount,
  }
}

type VariantPriceRowLike = {
  id: string
  amount: number
  currency_code: string
  min_quantity?: number | null
  max_quantity?: number | null
  rules?: Record<string, unknown> | null
  price_list_id?: string | null
}

export function buildVariantMatrix(args: {
  productId: string
  classification: ClassificationView | null
  options: AdminProductOptionDetailed[] | null | undefined
  variants: AdminVariantDetailed[] | null | undefined
  truncated?: boolean
  stockAdminPath: (id: string) => string
}): VariantMatrixView {
  const variants = args.variants ?? []
  const options = args.options ?? []
  const defaultOnly = isDefaultOnlyProduct(options, variants)
  const columns: VariantMatrixColumn[] = defaultOnly
    ? []
    : options.map((o) => ({
        option_id: o.id,
        title: (o.title ?? "Опция").trim() || "Опция",
      }))

  const skuCounts = new Map<string, number>()
  for (const v of variants) {
    const sku = (v.sku ?? "").trim().toLowerCase()
    if (!sku) continue
    skuCounts.set(sku, (skuCounts.get(sku) ?? 0) + 1)
  }

  const provisionalMaps = variants.map((v) => optionValueMap(v, columns))
  const comboCounts = new Map<string, number>()
  for (const map of provisionalMaps) {
    const key = combinationKey(map, columns)
    comboCounts.set(key, (comboCounts.get(key) ?? 0) + 1)
  }

  const rows: VariantMatrixRow[] = variants.map((v, idx) => {
    const option_values = provisionalMaps[idx]
    const prices = (v.prices ?? []).map((p) => ({
      id: p.id,
      amount: p.amount,
      currency_code: p.currency_code,
      min_quantity: p.min_quantity ?? null,
      max_quantity: p.max_quantity ?? null,
      rules: p.rules ?? {},
      price_list_id: p.price_list_id ?? null,
    }))
    const priceMeta = priceStatusFor(prices)
    const gate = variantPriceMutationGate(prices)
    const title = (v.title ?? "").trim() || "Вариант"
    const display_title = defaultOnly ? "Основной вариант" : title
    const option_label = defaultOnly
      ? "Основной вариант"
      : columns.map((c) => `${c.title}: ${option_values[c.option_id]}`).join(" · ")

    const base = {
      variant_id: v.id,
      title,
      display_title,
      is_default_only: defaultOnly,
      sku: v.sku ?? null,
      option_values,
      option_label,
      prices,
      primary_currency: priceMeta.primary_currency,
      primary_amount: priceMeta.primary_amount,
      price_status: priceMeta.status,
      price_status_label: priceMeta.label,
      editable_currencies: gate.editable_currencies,
      price_edit_blocked_reason: gate.reason,
      inventory_hint:
        v.manage_inventory == null
          ? null
          : v.manage_inventory
            ? "Учёт остатков включён"
            : "Учёт остатков выключен",
      manage_inventory: v.manage_inventory ?? null,
    }
    return {
      ...base,
      issues: buildRowIssues({
        row: base,
        skuCounts,
        comboCounts,
        columns,
        defaultOnly,
      }),
    }
  })

  const code = args.classification?.code ?? null
  let banner: string | null = null
  if (code === "BESPOKE") {
    banner =
      "Товар продаётся по запросу. Изменение цены варианта может не менять основной сценарий оформления заявки."
  } else if (code == null) {
    banner = "Тип товара не указан"
  }

  return {
    classification: code,
    mode: defaultOnly || code === "STANDARD" ? "compact" : "matrix",
    columns,
    rows,
    truncated: Boolean(args.truncated),
    banner,
    stock_admin_path: args.stockAdminPath(args.productId),
  }
}
