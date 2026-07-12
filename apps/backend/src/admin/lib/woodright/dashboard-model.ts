/**
 * Package F — pure view-model helpers for the Woodright dashboard.
 * No fetch, no DOM: everything here is unit-testable under node --test.
 */

/** Russian plural forms: [1 черновик, 2 черновика, 5 черновиков]. */
export function formatRuCount(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n)
  const mod10 = abs % 10
  const mod100 = abs % 100
  const form =
    mod10 === 1 && mod100 !== 11
      ? forms[0]
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)
        ? forms[1]
        : forms[2]
  return `${n} ${form}`
}

export type DraftCounterVM = {
  count: number
  label: string
  has_drafts: boolean
}

export function buildDraftCounterVM(count: number): DraftCounterVM {
  if (count <= 0) {
    return { count: 0, label: "Черновиков нет", has_drafts: false }
  }
  return {
    count,
    label: formatRuCount(count, ["черновик", "черновика", "черновиков"]),
    has_drafts: true,
  }
}

export function countMissingThumbnails(
  products: Array<{ thumbnail?: string | null }>
): number {
  return products.filter((p) => !(p.thumbnail ?? "").trim()).length
}

export type ThumbnailSampleVM = {
  checked: number
  missing: number
  total: number
  /** True when the sample covered every published product. */
  complete: boolean
  label: string
  /** Honesty note for partial samples; null when the count is exact. */
  note: string | null
}

/**
 * Honest counter for «опубликованы без главного фото».
 * The Admin API has no thumbnail filter, so we only inspect a bounded sample
 * (a few pages). When the sample does not cover the whole catalog the label
 * must say «оценка по выборке» — never claim a global total.
 */
export function buildThumbnailSampleVM(input: {
  checked: number
  missing: number
  total: number
}): ThumbnailSampleVM {
  const complete = input.checked >= input.total
  const base =
    input.missing <= 0
      ? complete
        ? "У всех опубликованных есть главное фото"
        : "В проверенной части все с главным фото"
      : `Без главного фото: ${input.missing}`
  const label = complete ? base : `${base} (оценка по выборке)`
  const note = complete
    ? null
    : `Проверено ${input.checked} из ${input.total} опубликованных товаров`
  return {
    checked: input.checked,
    missing: input.missing,
    total: input.total,
    complete,
    label,
    note,
  }
}

export function pickFirstSku(
  variants: Array<{ sku?: string | null }> | null | undefined
): string | null {
  for (const v of variants ?? []) {
    const sku = (v.sku ?? "").trim()
    if (sku) return sku
  }
  return null
}

export function productStatusLabel(status: string | null | undefined): string {
  switch ((status ?? "").trim().toLowerCase()) {
    case "published":
      return "Опубликован"
    case "proposed":
      return "На проверке"
    case "rejected":
      return "Отклонён"
    case "draft":
      return "Черновик"
    default:
      return "Статус не определён"
  }
}

export type PaginationVM = {
  has_prev: boolean
  has_next: boolean
  label: string
}

export function buildPaginationVM(input: {
  count: number
  offset: number
  limit: number
}): PaginationVM {
  const from = input.count === 0 ? 0 : input.offset + 1
  const to = Math.min(input.offset + input.limit, input.count)
  return {
    has_prev: input.offset > 0,
    has_next: input.offset + input.limit < input.count,
    label: `${from} - ${to} из ${input.count}`,
  }
}

/** Compute how many sample pages to fetch without exceeding the cap. */
export function planSamplePages(input: {
  total: number
  pageSize: number
  maxPages: number
}): number {
  if (input.total <= 0 || input.pageSize <= 0 || input.maxPages <= 0) return 0
  return Math.min(Math.ceil(input.total / input.pageSize), input.maxPages)
}
