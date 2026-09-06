import { buildDisplayGroupColorVariants } from "./card-color-media"
import { resolveCatalogCardPrice } from "./catalog-card-price"
import { getPrice } from "./format"
import { pdpCopy } from "./woodright-copy"

export type DisplayGroupAxis = "size" | "execution"

export type DisplayGroupMemberChip = {
  id: string
  label: string
  href: string
  isRepresentative: boolean
}

export type DisplayGroup = {
  count: number
  minPrice: number | null
  hint?: string
  axis?: DisplayGroupAxis
  memberChips?: DisplayGroupMemberChip[]
}

export type DisplayEntry = {
  product: Record<string, unknown>
  displayGroup?: DisplayGroup
}

function ruPlural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 19) return `${n} ${many}`
  if (mod10 === 1) return `${n} ${one}`
  if (mod10 >= 2 && mod10 <= 4) return `${n} ${few}`
  return `${n} ${many}`
}

function pluralizeSizes(n: number): string {
  return ruPlural(n, "размер", "размера", "размеров")
}

function pluralizeExecutions(n: number): string {
  return ruPlural(n, "исполнение", "исполнения", "исполнений")
}

export function formatGroupHint(count: number): string {
  return pluralizeSizes(count)
}

function productTitle(product: Record<string, unknown>): string {
  return typeof product.title === "string" ? product.title : ""
}

function hasFabricExecution(title: string): boolean {
  return title.toLowerCase().includes("с тканью")
}

/** Owner-locked Provence mattress groups (OD-PROVENCE-GROUP-UX-01=B). */
const EXECUTION_DISPLAY_GROUPS = new Set(["pv-15-bed", "pv-16-bed"])

function memberDisplayGroup(product: Record<string, unknown>): string | undefined {
  const meta = product.metadata as Record<string, unknown> | undefined
  const dg = meta?.display_group
  return typeof dg === "string" && dg ? dg : undefined
}

/**
 * Fabric/standard pairs for locked Provence groups only.
 * Other groups (Greenwich sizes, etc.) stay on the size axis.
 */
export function inferDisplayGroupAxis(
  members: Record<string, unknown>[]
): DisplayGroupAxis {
  const groups = new Set(
    members.map(memberDisplayGroup).filter((g): g is string => Boolean(g))
  )
  if (groups.size === 1 && EXECUTION_DISPLAY_GROUPS.has([...groups][0]!)) {
    return "execution"
  }
  return "size"
}

export function displayGroupMemberLabel(
  product: Record<string, unknown>,
  axis: DisplayGroupAxis
): string {
  const title = productTitle(product)
  if (axis === "execution") {
    return hasFabricExecution(title)
      ? pdpCopy.fabricChipWith
      : pdpCopy.fabricChipWithout
  }
  return title.trim() || "Вариант"
}

export function displayGroupSelectorLabel(axis: DisplayGroupAxis): string {
  return axis === "execution"
    ? pdpCopy.fabricSelectorLabel
    : pdpCopy.sizeSelectorLabel
}

function sortDisplayGroupMembers(
  members: Record<string, unknown>[]
): Record<string, unknown>[] {
  return [...members].sort((a, b) => {
    const sa = (a.metadata as Record<string, unknown> | undefined)
      ?.display_group_sort as number | undefined
    const sb = (b.metadata as Record<string, unknown> | undefined)
      ?.display_group_sort as number | undefined
    return (sa ?? 99) - (sb ?? 99)
  })
}

/**
 * Collapses products that share `metadata.display_group` into a single
 * representative entry per group. Maintains original list order — the
 * grouped card appears at the position of the first group member.
 *
 * Products without `display_group` pass through unchanged.
 */
export function groupProductsForDisplay(
  products: Record<string, unknown>[]
): DisplayEntry[] {
  const groupMembers = new Map<string, Record<string, unknown>[]>()

  for (const p of products) {
    const meta = p.metadata as Record<string, unknown> | undefined
    const dg = meta?.display_group as string | undefined
    if (dg) {
      if (!groupMembers.has(dg)) groupMembers.set(dg, [])
      groupMembers.get(dg)!.push(p)
    }
  }

  const seen = new Set<string>()
  const result: DisplayEntry[] = []

  for (const p of products) {
    const meta = p.metadata as Record<string, unknown> | undefined
    const dg = meta?.display_group as string | undefined

    if (!dg) {
      result.push({ product: p })
      continue
    }

    if (seen.has(dg)) continue
    seen.add(dg)

    const members = sortDisplayGroupMembers(groupMembers.get(dg)!)

    const representative = members[0]
    const groupTitle =
      (representative.metadata as Record<string, unknown> | undefined)
        ?.display_group_title ?? representative.title

    const display_group_color_variants =
      buildDisplayGroupColorVariants(members) ?? undefined

    const prices = members
      .map((m) => resolveCatalogCardPrice(m).amount ?? getPrice(m))
      .filter((v): v is number => v != null)

    const axis = inferDisplayGroupAxis(members)
    const hint =
      axis === "execution"
        ? pluralizeExecutions(members.length)
        : pluralizeSizes(members.length)

    const memberChips: DisplayGroupMemberChip[] | undefined =
      axis === "execution" && members.length > 1
        ? members.map((m) => ({
            id: String(m.id ?? ""),
            label: displayGroupMemberLabel(m, axis),
            href: `/product/${String(m.id ?? "")}`,
            isRepresentative: m.id === representative.id,
          }))
        : undefined

    result.push({
      product: {
        ...representative,
        title: groupTitle,
        ...(display_group_color_variants
          ? { display_group_color_variants }
          : {}),
      },
      displayGroup: {
        count: members.length,
        minPrice: prices.length > 0 ? Math.min(...prices) : null,
        hint,
        axis,
        ...(memberChips ? { memberChips } : {}),
      },
    })
  }

  return result
}

/**
 * Other products in the same display_group (e.g. bed sizes or fabric pair).
 * `metadata.collection` is an operational pause key, not required to match.
 */
export function getDisplayGroupMembers(
  product: Record<string, unknown>,
  allProducts: Record<string, unknown>[]
): Record<string, unknown>[] {
  const m = product.metadata as Record<string, unknown> | undefined
  const dg = m?.display_group as string | undefined
  const id = product.id as string | undefined
  if (!dg || !id) return []

  const members = allProducts.filter((p) => {
    if ((p.id as string | undefined) === id) return false
    const pm = p.metadata as Record<string, unknown> | undefined
    return pm?.display_group === dg
  })

  return sortDisplayGroupMembers(members)
}
