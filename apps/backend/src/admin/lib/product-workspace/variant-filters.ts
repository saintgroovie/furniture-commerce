import type { VariantMatrixRow } from "./variant-matrix-types.ts"

export type VariantFilterId =
  | "all"
  | "no_price"
  | "no_sku"
  | "problems"
  | "option"

export type VariantSortId =
  | "original"
  | "sku"
  | "price"
  | "problems"
  | "options"

export function filterVariantRows(
  rows: VariantMatrixRow[],
  args: {
    query: string
    filter: VariantFilterId
    optionValue?: string | null
  }
): VariantMatrixRow[] {
  const q = args.query.trim().toLowerCase()
  return rows.filter((row) => {
    if (args.filter === "no_price" && row.price_status !== "missing") return false
    if (args.filter === "no_sku" && (row.sku ?? "").trim()) return false
    if (args.filter === "problems") {
      const hasProblem = row.issues.some((i) => i.level === "error" || i.level === "attention")
      if (!hasProblem) return false
    }
    if (args.filter === "option" && args.optionValue) {
      const hit = Object.values(row.option_values).some(
        (v) => v.toLowerCase() === args.optionValue!.trim().toLowerCase()
      )
      if (!hit) return false
    }
    if (!q) return true
    const hay = [
      row.sku ?? "",
      row.title,
      row.display_title,
      row.option_label,
      ...Object.values(row.option_values),
    ]
      .join(" ")
      .toLowerCase()
    return hay.includes(q)
  })
}

export function sortVariantRows(
  rows: VariantMatrixRow[],
  sort: VariantSortId
): VariantMatrixRow[] {
  const copy = [...rows]
  if (sort === "original") return copy
  if (sort === "sku") {
    return copy.sort((a, b) => (a.sku ?? "").localeCompare(b.sku ?? "", "ru"))
  }
  if (sort === "price") {
    return copy.sort((a, b) => {
      const aa = a.primary_amount
      const bb = b.primary_amount
      if (aa == null && bb == null) return 0
      if (aa == null) return 1
      if (bb == null) return -1
      return aa - bb
    })
  }
  if (sort === "problems") {
    return copy.sort((a, b) => b.issues.length - a.issues.length)
  }
  if (sort === "options") {
    return copy.sort((a, b) => a.option_label.localeCompare(b.option_label, "ru"))
  }
  return copy
}
