import { buildDisplayGroupColorVariants } from "./card-color-media"
import { getPrice } from "./format"

export type DisplayGroup = {
  count: number
  minPrice: number | null
}

export type DisplayEntry = {
  product: Record<string, unknown>
  displayGroup?: DisplayGroup
}

function pluralizeSizes(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 19) return `${n} размеров`
  if (mod10 === 1) return `${n} размер`
  if (mod10 >= 2 && mod10 <= 4) return `${n} размера`
  return `${n} размеров`
}

export function formatGroupHint(count: number): string {
  return pluralizeSizes(count)
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

    const members = groupMembers.get(dg)!
    members.sort(
      (a, b) =>
        ((a.metadata as any)?.display_group_sort ?? 99) -
        ((b.metadata as any)?.display_group_sort ?? 99)
    )

    const representative = members[0]
    const groupTitle =
      (representative.metadata as any)?.display_group_title ??
      representative.title

    const display_group_color_variants =
      buildDisplayGroupColorVariants(members) ?? undefined

    const prices = members
      .map((m) => getPrice(m))
      .filter((v): v is number => v != null)

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
      },
    })
  }

  return result
}

/**
 * Other products in the same display group and collection (e.g. bed sizes).
 * Same collection + display_group keys as in ingestion metadata.
 */
export function getDisplayGroupMembers(
  product: Record<string, unknown>,
  allProducts: Record<string, unknown>[]
): Record<string, unknown>[] {
  const m = product.metadata as Record<string, unknown> | undefined
  const dg = m?.display_group as string | undefined
  const coll = m?.collection as string | undefined
  const id = product.id as string | undefined
  if (!dg || !coll || !id) return []

  const members = allProducts.filter((p) => {
    if ((p.id as string | undefined) === id) return false
    const pm = p.metadata as Record<string, unknown> | undefined
    return pm?.display_group === dg && pm?.collection === coll
  })

  members.sort((a, b) => {
    const sa = (a.metadata as Record<string, unknown>)?.display_group_sort as
      | number
      | undefined
    const sb = (b.metadata as Record<string, unknown>)?.display_group_sort as
      | number
      | undefined
    return (sa ?? 99) - (sb ?? 99)
  })

  return members
}
