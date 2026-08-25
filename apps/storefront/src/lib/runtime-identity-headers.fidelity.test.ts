/**
 * Guard: storefront runtime identity header map (component-aware SHA).
 *
 *   yarn exec tsx src/lib/runtime-identity-headers.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  selectUnifiedReleaseSha,
  storefrontRuntimeIdentityHeaders,
} from "./runtime-identity-headers"

const BE = "caf82b048b9caefae30679342aec3d4fc42a8d89"
const SF = "dd304d1bf92d59c85795b5091ed0386365bcca6d"

assert.equal(
  selectUnifiedReleaseSha({ backendSha: BE, storefrontSha: SF, releaseSha: SF }),
  ""
)
assert.equal(
  selectUnifiedReleaseSha({ backendSha: BE, storefrontSha: BE, releaseSha: BE }),
  BE
)
assert.equal(
  selectUnifiedReleaseSha({ backendSha: "", storefrontSha: "", releaseSha: SF }),
  SF
)

const split = storefrontRuntimeIdentityHeaders({
  WOODRIGHT_RUNTIME_ROLE: "non_public_candidate",
  WOODRIGHT_EXPOSURE: "private",
  WOODRIGHT_BACKEND_SOURCE_SHA: BE,
  WOODRIGHT_STOREFRONT_SOURCE_SHA: SF,
  WOODRIGHT_RELEASE_SHA: SF,
})
assert.equal(split["x-woodright-backend-source-sha"], BE)
assert.equal(split["x-woodright-storefront-source-sha"], SF)
assert.equal(split["x-woodright-release-sha"], undefined)

const unified = storefrontRuntimeIdentityHeaders({
  WOODRIGHT_RUNTIME_ROLE: "non_public_candidate",
  WOODRIGHT_EXPOSURE: "private",
  WOODRIGHT_BACKEND_SOURCE_SHA: BE,
  WOODRIGHT_STOREFRONT_SOURCE_SHA: BE,
  WOODRIGHT_RELEASE_SHA: BE,
})
assert.equal(unified["x-woodright-release-sha"], BE)

const legacy = storefrontRuntimeIdentityHeaders({
  WOODRIGHT_RUNTIME_ROLE: "non_public_candidate",
  WOODRIGHT_EXPOSURE: "private",
  WOODRIGHT_RELEASE_SHA: SF,
})
assert.equal(legacy["x-woodright-release-sha"], SF)

console.log("runtime-identity-headers.fidelity.test.ts: ok")
