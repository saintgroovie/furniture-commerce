import assert from "node:assert/strict"
import {verifiedHingeSideMedia, resolveHingeSideMedia} from "./pdp-hinge-side-media"
const left="/static/imports/WR-ATTACH-20261020/OL-08-2_closed_front_door_left_01.jpeg"
const right="/static/imports/WR-ATTACH-20261020/OL-08-2_closed_front_door_right_01.jpeg"
const product={handle:"ol-08-2",status:"published",metadata:{product_code_normalized:"OL-08-2"},images:[{url:left},{url:right}],variants:[{sku:"OL-08-2"}]}
const before=JSON.stringify(product)
const media=verifiedHingeSideMedia(product)!
assert.ok(media)
assert.deepEqual(resolveHingeSideMedia(media,null),{mainSrc:left.replace("/static/","/product-static/"),extraSrcs:[right.replace("/static/","/product-static/")]})
assert.deepEqual(resolveHingeSideMedia(media,"left"),{mainSrc:left.replace("/static/","/product-static/"),extraSrcs:[]})
assert.deepEqual(resolveHingeSideMedia(media,"right"),{mainSrc:right.replace("/static/","/product-static/"),extraSrcs:[]})
assert.equal(verifiedHingeSideMedia({...product,images:[{url:left}]}),null)
assert.equal(verifiedHingeSideMedia({...product,handle:"ol-08-1"}),null)
assert.equal(verifiedHingeSideMedia({...product,status:"draft"}),null)
assert.equal(verifiedHingeSideMedia({...product,metadata:{product_code_normalized:"OTHER"}}),null)
assert.deepEqual(resolveHingeSideMedia({left:[left],right:[]},"right"),{mainSrc:"",extraSrcs:[]})
assert.equal(JSON.stringify(product),before)
console.log("pdp-hinge-side-media.fidelity.test.ts: ok")
