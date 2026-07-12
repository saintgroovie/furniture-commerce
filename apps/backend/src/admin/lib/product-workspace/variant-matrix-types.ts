import type { WoodrightProductTypeCode } from "./types.ts"

export type VariantPriceRow = {
  id: string
  amount: number
  currency_code: string
  min_quantity?: number | null
  max_quantity?: number | null
  rules?: Record<string, unknown> | null
  price_list_id?: string | null
}

export type VariantOptionValue = {
  option_id?: string | null
  option_title: string
  value: string
}

export type AdminVariantDetailed = {
  id: string
  title?: string | null
  sku?: string | null
  manage_inventory?: boolean | null
  allow_backorder?: boolean | null
  options?: Array<{
    id?: string
    value?: string | null
    option_id?: string | null
    option?: { id?: string; title?: string | null } | null
  }> | null
  prices?: VariantPriceRow[] | null
}

export type AdminProductOptionDetailed = {
  id: string
  title?: string | null
  values?: Array<{ id?: string; value?: string | null }> | null
}

export type VariantMatrixColumn = {
  option_id: string
  title: string
}

export type PriceEditability =
  | { kind: "simple"; price: VariantPriceRow }
  | { kind: "missing" }
  | { kind: "zero"; price: VariantPriceRow }
  | { kind: "complex"; reason: string; price?: VariantPriceRow }
  | { kind: "ambiguous"; reason: string }

export type VariantValidationLevel = "error" | "attention" | "info"

export type VariantValidationIssue = {
  level: VariantValidationLevel
  code: string
  field: string
  message: string
  action: string
}

export type VariantMatrixRow = {
  variant_id: string
  title: string
  display_title: string
  is_default_only: boolean
  sku: string | null
  option_values: Record<string, string>
  option_label: string
  prices: VariantPriceRow[]
  primary_currency: string | null
  primary_amount: number | null
  price_status: "ok" | "missing" | "zero" | "multi" | "complex" | "ambiguous"
  price_status_label: string
  editable_currencies: string[]
  price_edit_blocked_reason: string | null
  inventory_hint: string | null
  issues: VariantValidationIssue[]
  manage_inventory: boolean | null
}

export type VariantMatrixView = {
  classification: WoodrightProductTypeCode | null
  mode: "compact" | "matrix"
  columns: VariantMatrixColumn[]
  rows: VariantMatrixRow[]
  truncated: boolean
  banner: string | null
  stock_admin_path: string
}
