/**
 * Path → section mapping (no Next runtime).
 * Run from apps/storefront:
 *   ../backend/node_modules/.bin/tsx src/lib/site-section.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  isBespokePath,
  isKidsPath,
  isProductPath,
  sectionFromPath,
} from "./site-section.ts"

assert.equal(isKidsPath("/kids"), true)
assert.equal(isKidsPath("/kids/catalog"), true)
assert.equal(isKidsPath("/catalog"), false)

assert.equal(isBespokePath("/bespoke"), true)
assert.equal(isBespokePath("/bespoke/wall-panels"), true)
assert.equal(isBespokePath("/bespoke/request"), true)
assert.equal(isBespokePath("/catalog"), false)
assert.equal(isBespokePath("/bespoke-extra"), false)

assert.equal(isProductPath("/product/ol-01-1"), true)
assert.equal(isProductPath("/products"), false)

assert.equal(sectionFromPath("/"), "main")
assert.equal(sectionFromPath("/catalog"), "main")
assert.equal(sectionFromPath("/kids"), "kids")
assert.equal(sectionFromPath("/kids/rooms"), "kids")
assert.equal(sectionFromPath("/bespoke"), "bespoke")
assert.equal(sectionFromPath("/bespoke/wall-panels"), "bespoke")
assert.equal(sectionFromPath("/product/x"), "main")

console.log("site-section.fidelity.test.ts: ok")
