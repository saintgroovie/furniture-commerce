/**
 * Fidelity: RoomSet V1 owner-approved seed contract (static + classifier).
 * Run via: yarn dlx tsx src/scripts/seed-rooms-v1-owner-approved.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import {
  classifyItemsAction,
  sortOrdersAreContiguousSlots,
} from "./seed-rooms-v1-plan"

const root = process.cwd()
const script = join(root, "src/scripts/seed-rooms-v1-owner-approved.ts")
const plan = join(root, "src/scripts/seed-rooms-v1-plan.ts")
assert.equal(existsSync(script), true, "seed script missing")
assert.equal(existsSync(plan), true, "plan module missing")
const txt = readFileSync(script, "utf8")
const planTxt = readFileSync(plan, "utf8")

assert.match(txt, /spalnya-greenwich|ROOMS_V1_SPECS|FORBIDDEN_HISTORICAL_SLUGS/)
assert.match(txt, /FORBIDDEN_HISTORICAL_SLUGS/)
assert.match(txt, /ROOMSET_SEED_TARGET/)
assert.match(txt, /ROOMSET_SEED_SCOPE/)
assert.match(txt, /ROOMSET_SEED_MODE/)
assert.match(txt, /assertRoomsetSeedGate/)
assert.match(txt, /seed-rooms-v1-manifest/)
assert.match(txt, /seed-rooms-v1-target-gate/)
assert.match(txt, /woodright_staging|gate_ok/)
assert.doesNotMatch(txt, /ALLOW_NON_STAGING/)
assert.doesNotMatch(txt, /WOODRIGHT_ROOMS_V1_APPLY\s*===/)
assert.match(txt, /complete_orphan_links/)
assert.match(txt, /reconcile_partial/)
assert.match(txt, /classifyItemsAction/)
assert.match(txt, /seed-rooms-v1-plan/)
assert.match(planTxt, /sortOrdersAreContiguousSlots/)
assert.match(planTxt, /classifyItemsAction/)
assert.match(txt, /product\.status !== "published"/)
assert.match(txt, /historical slug .* is active; refusing V1 seed/)

const manifestTxt = readFileSync(
  join(root, "src/scripts/seed-rooms-v1-manifest.ts"),
  "utf8"
)
const createOrder = manifestTxt.match(/ROOMS_V1_CREATE_ORDER\s*=\s*\[([^\]]+)\]/s)
assert.ok(createOrder, "create order missing")
assert.ok(
  createOrder[1].indexOf("spalnya-cloud") <
    createOrder[1].indexOf("spalnya-greenwich"),
  "Cloud before Greenwich"
)

// Per-room product order (owner-approved) — pinned in manifest module
assert.match(
  manifestTxt,
  /slug:\s*"spalnya-cloud"[\s\S]*?product_handles:\s*\[\s*"greenwich-gr-12-1",\s*"greenwich-gr-67-1",\s*"greenwich-gr-02-1"/
)
assert.match(
  manifestTxt,
  /slug:\s*"spalnya-greenwich"[\s\S]*?product_handles:\s*\[\s*"greenwich-gr-12-1",\s*"greenwich-gr-08-1",\s*"greenwich-gr-67-1"/
)
assert.match(
  manifestTxt,
  /slug:\s*"spalnya-greenwich"[\s\S]*?GR-BED-POOL_frame_noliver_var2_View01\.jpg/
)
assert.match(
  manifestTxt,
  /slug:\s*"spalnya-cloud"[\s\S]*?GR-BED-POOL_cloud_bedroom2_int_View04\.jpg/
)
assert.match(manifestTxt, /detskaya-pervenets/)
assert.match(manifestTxt, /gostinaya/)
assert.match(
  manifestTxt,
  /71ef39d2699330bb2c0bca59f968bc695151b87d9ad9b7f23d9b35be0c07b67e/
)

assert.match(txt, /is_active: false/)
assert.match(txt, /ACTIVATE room_set/)
assert.match(txt, /deactivate_until_items_ok|inactive until items complete/)
assert.match(txt, /asOne\(/)
assert.match(txt, /Array\.isArray\(value\) \? value\[0\] : value/)
assert.doesNotMatch(txt, /ol-85-1|ol-95-1|ol-81-1/)
assert.doesNotMatch(txt, /deleteRoomSets|deleteRoomSetItems/)
assert.match(txt, /FAIL_CLOSED/)
assert.match(txt, /soft-deleted/)

const desired = ["a", "b", "c"]

assert.equal(classifyItemsAction([], desired), "create_all")

assert.equal(
  classifyItemsAction(
    [
      { id: "1", sort_order: 0, products: [{ handle: "a" }] },
      { id: "2", sort_order: 1, products: [{ handle: "b" }] },
      { id: "3", sort_order: 2, products: [{ handle: "c" }] },
    ],
    desired
  ),
  "noop"
)

assert.equal(
  classifyItemsAction(
    [
      { id: "1", sort_order: 0, products: [] },
      { id: "2", sort_order: 1 },
      { id: "3", sort_order: 2, products: [] },
    ],
    desired
  ),
  "complete_orphan_links"
)

// Unresolved product stub (not a true orphan) → conflict
assert.equal(
  classifyItemsAction(
    [{ id: "1", sort_order: 0, products: [{}] }],
    desired
  ),
  "conflict"
)

// Linked prefix after interruption after first item
assert.equal(
  classifyItemsAction(
    [{ id: "1", sort_order: 0, products: [{ handle: "a" }] }],
    desired
  ),
  "reconcile_partial"
)

// Orphan prefix after interruption before link
assert.equal(
  classifyItemsAction([{ id: "1", sort_order: 0, products: [] }], desired),
  "reconcile_partial"
)

// Mixed: linked + orphan in prefix
assert.equal(
  classifyItemsAction(
    [
      { id: "1", sort_order: 0, products: [{ handle: "a" }] },
      { id: "2", sort_order: 1, products: [] },
    ],
    desired
  ),
  "reconcile_partial"
)

// Wrong handle → conflict
assert.equal(
  classifyItemsAction(
    [{ id: "1", sort_order: 0, products: [{ handle: "wrong" }] }],
    desired
  ),
  "conflict"
)

// Gapped sort_order (missing 0) → conflict
assert.equal(
  classifyItemsAction(
    [{ id: "1", sort_order: 1, products: [{ handle: "a" }] }],
    desired
  ),
  "conflict"
)

// Duplicate sort_order after sort still fails contiguous check
assert.equal(
  sortOrdersAreContiguousSlots([
    { id: "1", sort_order: 0 },
    { id: "2", sort_order: 0 },
  ]),
  false
)
assert.equal(
  classifyItemsAction(
    [
      { id: "1", sort_order: 0, products: [{ handle: "a" }] },
      { id: "2", sort_order: 0, products: [{ handle: "b" }] },
    ],
    desired
  ),
  "conflict"
)

// Oversized → conflict
assert.equal(
  classifyItemsAction(
    [
      { id: "1", sort_order: 0, products: [{ handle: "a" }] },
      { id: "2", sort_order: 1, products: [{ handle: "b" }] },
      { id: "3", sort_order: 2, products: [{ handle: "c" }] },
      { id: "4", sort_order: 3, products: [{ handle: "d" }] },
    ],
    desired
  ),
  "conflict"
)

// Ambiguous multi-product link on one item → conflict
assert.equal(
  classifyItemsAction(
    [
      {
        id: "1",
        sort_order: 0,
        products: [{ handle: "a" }, { handle: "b" }],
      },
    ],
    desired
  ),
  "conflict"
)

// Missing sort_order → conflict
assert.equal(
  classifyItemsAction([{ id: "1", products: [{ handle: "a" }] }], desired),
  "conflict"
)

console.log("seed-rooms-v1-owner-approved.fidelity.test.ts: ok")
