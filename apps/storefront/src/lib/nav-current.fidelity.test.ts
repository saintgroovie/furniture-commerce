/**
 * Primary nav current-path matching (section prefix, not substring).
 *
 *   yarn exec tsx src/lib/nav-current.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { isPrimaryNavCurrent } from "./nav-current"

assert.equal(isPrimaryNavCurrent("/bespoke", "/bespoke"), true)
assert.equal(isPrimaryNavCurrent("/bespoke/request", "/bespoke"), true)
assert.equal(isPrimaryNavCurrent("/catalog", "/bespoke"), false)
assert.equal(isPrimaryNavCurrent("/kids/catalog", "/kids"), true)
assert.equal(isPrimaryNavCurrent("/kids/catalog", "/catalog"), false)
assert.equal(isPrimaryNavCurrent("/about/materials", "/about"), true)
assert.equal(isPrimaryNavCurrent("/", "/bespoke"), false)

console.log("nav-current.fidelity: ok")
