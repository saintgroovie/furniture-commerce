/**
 * Published catalog rows become Provence fabric chips.
 * A missing or non-published status stays out of that list.
 *
 *   npx --yes tsx src/lib/bed-display-group-public.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { isBuyerPublicProductStatus } from "./buyer-publication"
import {
  displayGroupMemberLabel,
  getDisplayGroupMembers,
  inferDisplayGroupAxis,
} from "./display-group"
import { pdpCopy } from "./woodright-copy"

function bed(partial: {
  id: string
  title: string
  status?: string
  sort: number
}): Record<string, unknown> {
  return {
    id: partial.id,
    title: partial.title,
    status: partial.status,
    metadata: {
      display_group: "pv-15-bed",
      display_group_sort: partial.sort,
    },
  }
}

const plain = bed({
  id: "PV-15-1",
  title: "Кровать 1,5-сп. (120×190) без изножья",
  status: "published",
  sort: 1,
})
const fabric = bed({
  id: "PV-15-2",
  title: "Кровать 1,5-сп. (120×190) с тканью без изножья",
  status: "published",
  sort: 2,
})
const draft = bed({
  id: "PV-15-draft",
  title: "Кровать 1,5-сп. (120×190) с тканью без изножья",
  status: "draft",
  sort: 3,
})
const missingStatus = bed({
  id: "PV-15-missing",
  title: "Кровать 1,5-сп. (120×190) с тканью без изножья",
  sort: 4,
})

const publicRows = [plain, fabric, draft, missingStatus].filter((product) =>
  isBuyerPublicProductStatus(product.status)
)
assert.deepEqual(
  publicRows.map((product) => product.id),
  ["PV-15-1", "PV-15-2"]
)

const members = getDisplayGroupMembers(plain, publicRows)
assert.equal(members.length, 1)
assert.equal(members[0]!.id, "PV-15-2")
const axis = inferDisplayGroupAxis([plain, ...members])
assert.equal(axis, "execution")
assert.equal(displayGroupMemberLabel(plain, axis), pdpCopy.fabricChipWithout)
assert.equal(displayGroupMemberLabel(members[0]!, axis), pdpCopy.fabricChipWith)

console.log("bed-display-group-public.fidelity.test.ts: ok")
