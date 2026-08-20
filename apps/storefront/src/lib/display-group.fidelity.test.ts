/**
 * Provence grouping + pause-key-independent siblings.
 * Run from apps/storefront:
 *   npx --yes tsx src/lib/display-group.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  getDisplayGroupMembers,
  groupProductsForDisplay,
  inferDisplayGroupAxis,
} from "./display-group"

function product(partial: {
  id: string
  title: string
  display_group?: string
  display_group_title?: string
  display_group_sort?: number
  collection?: string
  amount?: number
}): Record<string, unknown> {
  return {
    id: partial.id,
    title: partial.title,
    handle: partial.id,
    metadata: {
      ...(partial.display_group
        ? { display_group: partial.display_group }
        : {}),
      ...(partial.display_group_title
        ? { display_group_title: partial.display_group_title }
        : {}),
      ...(partial.display_group_sort != null
        ? { display_group_sort: partial.display_group_sort }
        : {}),
      ...(partial.collection ? { collection: partial.collection } : {}),
    },
    variants: [{ prices: [{ amount: partial.amount ?? 70000 }] }],
  }
}

{
  const axis = inferDisplayGroupAxis([
    product({
      id: "PV-15-1",
      title: "Кровать 1,5-сп. (120×190) без изножья",
      display_group: "pv-15-bed",
    }),
    product({
      id: "PV-15-2",
      title: "Кровать 1,5-сп. (120×190) с тканью без изножья",
      display_group: "pv-15-bed",
    }),
  ])
  assert.equal(axis, "execution")
}

{
  const axis = inferDisplayGroupAxis([
    product({
      id: "weird-1",
      title: "Кровать 1,5-сп. (120×190) без изножья",
      display_group: "unrelated-bed",
    }),
    product({
      id: "weird-2",
      title: "Кровать 1,5-сп. (120×190) с тканью без изножья",
      display_group: "unrelated-bed",
    }),
  ])
  assert.equal(axis, "size")
}

{
  const axis = inferDisplayGroupAxis([
    product({ id: "gr-09", title: "Кровать 1-сп. (90×200)" }),
    product({ id: "gr-12", title: "Кровать 1,5-сп. (120×200)" }),
  ])
  assert.equal(axis, "size")
}

const pv15 = [
  product({
    id: "PV-15-1",
    title: "Кровать 1,5-сп. (120×190) без изножья",
    display_group: "pv-15-bed",
    display_group_title: "Кровать 1,5-сп. (120×190) без изножья",
    display_group_sort: 1,
    amount: 70300,
  }),
  product({
    id: "PV-15-2",
    title: "Кровать 1,5-сп. (120×190) с тканью без изножья",
    display_group: "pv-15-bed",
    display_group_title: "Кровать 1,5-сп. (120×190) без изножья",
    display_group_sort: 2,
    amount: 70300,
  }),
]
const pv16 = [
  product({
    id: "PV-16-1",
    title: "Кровать 1,5-сп. (140×190) без изножья",
    display_group: "pv-16-bed",
    display_group_title: "Кровать 1,5-сп. (140×190) без изножья",
    display_group_sort: 1,
    amount: 77300,
  }),
  product({
    id: "PV-16-2",
    title: "Кровать 1,5-сп. (140×190) с тканью без изножья",
    display_group: "pv-16-bed",
    display_group_title: "Кровать 1,5-сп. (140×190) без изножья",
    display_group_sort: 2,
    amount: 77300,
  }),
]

const grouped = groupProductsForDisplay([...pv15, ...pv16])
assert.equal(grouped.length, 2)
assert.equal(grouped[0]!.product.title, "Кровать 1,5-сп. (120×190) без изножья")
assert.equal(grouped[1]!.product.title, "Кровать 1,5-сп. (140×190) без изножья")
assert.equal(grouped[0]!.displayGroup?.axis, "execution")
assert.equal(grouped[0]!.displayGroup?.hint, "2 исполнения")
assert.equal(grouped[0]!.displayGroup?.memberChips?.length, 2)
assert.equal(grouped[0]!.displayGroup?.memberChips?.[0]?.label, "Без ткани")
assert.equal(grouped[0]!.displayGroup?.memberChips?.[1]?.label, "С тканью")
assert.equal(grouped[1]!.displayGroup?.memberChips?.[0]?.label, "Без ткани")

const siblings = getDisplayGroupMembers(pv15[0]!, [...pv15, ...pv16])
assert.equal(siblings.length, 1)
assert.equal(siblings[0]!.id, "PV-15-2")

{
  const paused = product({
    id: "PV-15-1",
    title: "Кровать 1,5-сп. (120×190) без изножья",
    display_group: "pv-15-bed",
    collection: "provence",
  })
  const unpaused = product({
    id: "PV-15-2",
    title: "Кровать 1,5-сп. (120×190) с тканью без изножья",
    display_group: "pv-15-bed",
  })
  const found = getDisplayGroupMembers(unpaused, [paused, unpaused])
  assert.equal(found.length, 1)
  assert.equal(found[0]!.id, "PV-15-1")
}

const gw = [
  product({
    id: "gr-09",
    title: "Кровать 1-сп. (90×200)",
    display_group: "greenwich-bed",
    display_group_title: "Кровать",
    display_group_sort: 1,
    collection: "greenwich",
  }),
  product({
    id: "gr-12",
    title: "Кровать 1,5-сп. (120×200)",
    display_group: "greenwich-bed",
    display_group_title: "Кровать",
    display_group_sort: 2,
    collection: "greenwich",
  }),
]
const gwGrouped = groupProductsForDisplay(gw)
assert.equal(gwGrouped.length, 1)
assert.equal(gwGrouped[0]!.product.title, "Кровать")
assert.equal(gwGrouped[0]!.displayGroup?.axis, "size")
assert.equal(gwGrouped[0]!.displayGroup?.hint, "2 размера")
assert.equal(gwGrouped[0]!.displayGroup?.memberChips, undefined)

console.log("display-group.fidelity.test.ts: ok")
