/**
 * First-screen catalog eager flags.
 * Run from apps/storefront:
 *   ../backend/node_modules/.bin/tsx src/lib/catalog-atf.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { CATALOG_ATF_EAGER_COUNT, catalogCardAtfFlags } from "./catalog-atf"

assert.equal(CATALOG_ATF_EAGER_COUNT, 8)

const first = catalogCardAtfFlags(0)
assert.equal(first.priorityHero, true)
assert.equal(first.atfHero, false)

const second = catalogCardAtfFlags(1)
assert.equal(second.priorityHero, false)
assert.equal(second.atfHero, true)

const lastAtf = catalogCardAtfFlags(7)
assert.equal(lastAtf.priorityHero, false)
assert.equal(lastAtf.atfHero, true)

const below = catalogCardAtfFlags(8)
assert.equal(below.priorityHero, false)
assert.equal(below.atfHero, false)

console.log("catalog-atf.fidelity.test.ts: ok")
