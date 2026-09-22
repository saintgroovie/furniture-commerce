/**
 *   yarn dlx tsx src/lib/legacy-buyer-redirects.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { legacyBuyerRedirectDestination } from "./legacy-buyer-redirects"
import { isProductionQaPathBlocked } from "./production-qa-exposure"

assert.equal(legacyBuyerRedirectDestination("/kollekcii"), "/catalog")
assert.equal(legacyBuyerRedirectDestination("/kollekcii/"), "/catalog")
assert.equal(legacyBuyerRedirectDestination("/kollekcii/page-9"), "/catalog")
assert.equal(legacyBuyerRedirectDestination("/vzroslie-kollekcii"), "/catalog")
assert.equal(legacyBuyerRedirectDestination("/detskie-kollekcii/"), "/kids/catalog")
assert.equal(legacyBuyerRedirectDestination("/o-nas"), "/about")
assert.equal(legacyBuyerRedirectDestination("/oferta"), "/offer")
assert.equal(
  legacyBuyerRedirectDestination("/kollekcii/greenwich"),
  "/catalog?collection=greenwich"
)
assert.equal(
  legacyBuyerRedirectDestination("/kollekcii/willie-winkie/"),
  "/kids/catalog?collection=willie-winkie"
)
assert.equal(legacyBuyerRedirectDestination("/catalog"), null)
assert.equal(
  legacyBuyerRedirectDestination("/kollekcii/oliver/komod-oliver"),
  "/product/prod_01KNTBXADDACBVH2BM1JSB2MWH"
)
assert.equal(
  legacyBuyerRedirectDestination("/kollekcii/oliver/tumbochka-prikrovatnaya-oliver/"),
  "/product/prod_01KNTBXADE04TT9T88M1SRC2T7"
)
assert.equal(legacyBuyerRedirectDestination("/kollekcii/greenwich/komod-scale-ru-16"), null)
assert.equal(legacyBuyerRedirectDestination("/"), null)

assert.equal(
  isProductionQaPathBlocked({
    pathname: "/qa/legacy-site-media-approval-board",
    host: "woodright.ru",
    runtimeRole: "public_demo",
  }),
  true
)
assert.equal(
  isProductionQaPathBlocked({
    pathname: "/qa/legacy-media-assignment-board-v2",
    host: "www.woodright.ru",
  }),
  true
)
assert.equal(
  isProductionQaPathBlocked({
    pathname: "/qa/source-media-orphan-review",
    host: "woodright-demo.ru",
    runtimeRole: "public_demo",
  }),
  false
)
assert.equal(
  isProductionQaPathBlocked({
    pathname: "/qa/legacy-site-media-approval-board",
    host: "127.0.0.1:3300",
    runtimeRole: "public_production",
  }),
  true
)
assert.equal(
  isProductionQaPathBlocked({
    pathname: "/catalog",
    host: "woodright.ru",
    runtimeRole: "public_production",
  }),
  false
)

console.log("legacy-buyer-redirects.fidelity.test.ts ok")
