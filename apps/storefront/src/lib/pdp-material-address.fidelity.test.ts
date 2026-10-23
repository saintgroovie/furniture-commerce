import assert from "node:assert/strict"
import { test } from "node:test"
import {
  materialAddressCommit,
  materialCodeFromSearch,
} from "./pdp-material-address"

const OPEN = "open-shelf"
const DOOR = "door"
const LDSP = "solid_front_ldsp_body"
const SOLID = "solid_full"
const OPEN_TIERS = [LDSP, SOLID]
const DOOR_TIERS = [SOLID]

/** Same rule as c67 selectedOliverFacadeJsonLd: one existing offer, or none. */
function selectExistingOffer(
  offers: { variant: string; material: string; sku: string; price: number }[],
  variant: string,
  material: string
) {
  const selected = offers.filter((offer) => offer.variant === variant && offer.material === material)
  return selected.length === 1 ? selected[0] : null
}

const offers = [
  { variant: OPEN, material: LDSP, sku: "OL-08-1", price: 32500 },
  { variant: OPEN, material: SOLID, sku: "OL-08-1", price: 34950 },
  { variant: DOOR, material: SOLID, sku: "OL-08-2", price: 39950 },
]

const start =
  `/product/ol-08-1?variant=${OPEN}&material=${LDSP}&finish=cream&from=pdp#photo`

test("material choice keeps variant, finish and other query", () => {
  const next = materialAddressCommit({
    href: start,
    nextCode: SOLID,
    currentCode: LDSP,
    allowedCodes: OPEN_TIERS,
  })
  assert.equal(next.push, true)
  assert.equal(next.code, SOLID)
  const url = new URL(next.href, "http://127.0.0.1")
  assert.equal(url.pathname, "/product/ol-08-1")
  assert.equal(url.searchParams.get("variant"), OPEN)
  assert.equal(url.searchParams.get("material"), SOLID)
  assert.equal(url.searchParams.get("finish"), "cream")
  assert.equal(url.searchParams.get("from"), "pdp")
  assert.equal(url.hash, "#photo")
  const offer = selectExistingOffer(offers, OPEN, next.code)
  assert.deepEqual(offer, { variant: OPEN, material: SOLID, sku: "OL-08-1", price: 34950 })
})

test("selecting the current material does not push history", () => {
  const again = materialAddressCommit({
    href: start,
    nextCode: LDSP,
    currentCode: LDSP,
    allowedCodes: OPEN_TIERS,
  })
  assert.equal(again.push, false)
  assert.equal(again.href, start)
  assert.equal(again.code, LDSP)
})

test("reload, back and forward restore the same offer", () => {
  const picked = materialAddressCommit({
    href: start,
    nextCode: SOLID,
    currentCode: LDSP,
    allowedCodes: OPEN_TIERS,
  })
  const history = [start, picked.href]
  const backHref = history[0]
  const forwardHref = history[1]
  const backCode = materialCodeFromSearch(new URL(backHref, "http://127.0.0.1").search, OPEN_TIERS, LDSP)
  const forwardCode = materialCodeFromSearch(new URL(forwardHref, "http://127.0.0.1").search, OPEN_TIERS, LDSP)
  const reloadCode = materialCodeFromSearch(new URL(picked.href, "http://127.0.0.1").search, OPEN_TIERS, LDSP)
  assert.equal(backCode, LDSP)
  assert.equal(forwardCode, SOLID)
  assert.equal(reloadCode, SOLID)
  assert.equal(selectExistingOffer(offers, OPEN, backCode)?.price, 32500)
  assert.equal(selectExistingOffer(offers, OPEN, forwardCode)?.price, 34950)
  assert.equal(selectExistingOffer(offers, OPEN, reloadCode)?.sku, "OL-08-1")
})

test("door plus LDSP is not written and matches no offer", () => {
  const doorHref = `/product/ol-08-1?variant=${DOOR}&finish=cream`
  const refused = materialAddressCommit({
    href: doorHref,
    nextCode: LDSP,
    currentCode: SOLID,
    allowedCodes: DOOR_TIERS,
  })
  assert.equal(refused.push, false)
  assert.equal(refused.href, doorHref)
  assert.equal(refused.code, SOLID)
  assert.equal(selectExistingOffer(offers, DOOR, LDSP), null)
  const restored = materialCodeFromSearch(`?variant=${DOOR}&material=${LDSP}`, DOOR_TIERS, SOLID)
  assert.equal(restored, SOLID)
  assert.equal(selectExistingOffer(offers, DOOR, restored)?.price, 39950)
})
