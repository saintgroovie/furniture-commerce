import assert from "node:assert/strict"
import { subscribeCatalogFreshness } from "./catalog-freshness-events"

const windowTarget = new EventTarget(), documentTarget = new EventTarget()
let now=10000, visible=true, refreshes=0
const unsubscribe=subscribeCatalogFreshness({windowTarget,documentTarget,isVisible:()=>visible,refresh:()=>refreshes++,now:()=>now})
assert.equal(refreshes,0,"fresh SSR does not cause another catalog request")
now+=6000
windowTarget.dispatchEvent(new Event("focus"))
assert.equal(refreshes,1,"return from editing re-reads the route")
documentTarget.dispatchEvent(new Event("visibilitychange"))
assert.equal(refreshes,1,"paired focus/visibility events are coalesced")
visible=false; now+=6000
windowTarget.dispatchEvent(new Event("focus"))
assert.equal(refreshes,1,"hidden tabs do not request a full catalog")
visible=true
documentTarget.dispatchEvent(new Event("visibilitychange"))
assert.equal(refreshes,2)
now+=6000
windowTarget.dispatchEvent(new Event("pageshow"))
assert.equal(refreshes,3,"restored browser pages get fresh cards")
now+=6000
windowTarget.dispatchEvent(new Event("popstate"))
assert.equal(refreshes,4,"back/forward navigation re-reads fresh cards")
unsubscribe(); now+=6000
windowTarget.dispatchEvent(new Event("focus"))
documentTarget.dispatchEvent(new Event("visibilitychange"))
assert.equal(refreshes,4,"unmount removes both sets of subscriptions")
console.log("catalog-freshness.fidelity.test.ts: ok")
