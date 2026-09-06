/**
 * Guard: runtime identity headers module + middleware wiring.
 *
 *   yarn exec tsx src/api/runtime-identity-headers.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  runtimeIdentityHeaderMap,
  selectUnifiedReleaseSha,
} from "./runtime-identity-headers"

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8")
}

const middlewareSrc = read("src/api/middlewares.ts")
assert.match(middlewareSrc, /attachRuntimeIdentityHeaders/)
assert.match(middlewareSrc, /matcher:\s*["']\/store\*/)
assert.match(middlewareSrc, /matcher:\s*["']\/health["']/)

const hdrSrc = read("src/api/runtime-identity-headers.ts")
assert.match(hdrSrc, /x-woodright-runtime-role/)
assert.match(hdrSrc, /x-woodright-exposure/)
assert.match(hdrSrc, /x-woodright-release-sha/)
assert.match(hdrSrc, /x-woodright-backend-source-sha/)
assert.match(hdrSrc, /x-woodright-storefront-source-sha/)
assert.match(hdrSrc, /x-woodright-database-identity/)
assert.match(hdrSrc, /WOODRIGHT_RUNTIME_ROLE/)
assert.match(hdrSrc, /WOODRIGHT_DATABASE_IDENTITY/)
assert.match(hdrSrc, /WOODRIGHT_BACKEND_SOURCE_SHA/)
assert.match(hdrSrc, /WOODRIGHT_STOREFRONT_SOURCE_SHA/)
assert.match(hdrSrc, /public_demo_db/)
assert.match(hdrSrc, /non_public_candidate_db/)
assert.match(hdrSrc, /Intentionally ignore request headers/)
assert.doesNotMatch(hdrSrc, /DATABASE_URL/)
assert.doesNotMatch(hdrSrc, /password/i)
assert.doesNotMatch(hdrSrc, /req\.headers/)

const BE = "caf82b048b9caefae30679342aec3d4fc42a8d89"
const SF = "dd304d1bf92d59c85795b5091ed0386365bcca6d"

assert.equal(
  selectUnifiedReleaseSha({ backendSha: BE, storefrontSha: SF, releaseSha: SF }),
  "",
  "split pair must not emit a global SHA"
)
assert.equal(
  selectUnifiedReleaseSha({ backendSha: BE, storefrontSha: BE, releaseSha: BE }),
  BE,
  "unified pair may emit the global SHA"
)
assert.equal(
  selectUnifiedReleaseSha({ backendSha: "", storefrontSha: "", releaseSha: SF }),
  SF,
  "legacy global-only env still emits x-woodright-release-sha"
)
assert.equal(
  selectUnifiedReleaseSha({ backendSha: BE, storefrontSha: "", releaseSha: BE }),
  "",
  "incomplete pair must not imply global identity"
)

const split = runtimeIdentityHeaderMap({
  WOODRIGHT_RUNTIME_ROLE: "non_public_candidate",
  WOODRIGHT_EXPOSURE: "private",
  WOODRIGHT_BACKEND_SOURCE_SHA: BE,
  WOODRIGHT_STOREFRONT_SOURCE_SHA: SF,
  WOODRIGHT_RELEASE_SHA: SF,
  WOODRIGHT_DATABASE_IDENTITY: "non_public_candidate_db",
})
assert.equal(split["x-woodright-backend-source-sha"], BE)
assert.equal(split["x-woodright-storefront-source-sha"], SF)
assert.equal(split["x-woodright-release-sha"], undefined)
assert.equal(split["x-woodright-runtime-role"], "non_public_candidate")

const unified = runtimeIdentityHeaderMap({
  WOODRIGHT_RUNTIME_ROLE: "non_public_candidate",
  WOODRIGHT_EXPOSURE: "private",
  WOODRIGHT_BACKEND_SOURCE_SHA: BE,
  WOODRIGHT_STOREFRONT_SOURCE_SHA: BE,
  WOODRIGHT_RELEASE_SHA: BE,
})
assert.equal(unified["x-woodright-release-sha"], BE)

const legacy = runtimeIdentityHeaderMap({
  WOODRIGHT_RUNTIME_ROLE: "non_public_candidate",
  WOODRIGHT_EXPOSURE: "private",
  WOODRIGHT_RELEASE_SHA: SF,
})
assert.equal(legacy["x-woodright-release-sha"], SF)
assert.equal(legacy["x-woodright-backend-source-sha"], undefined)
assert.equal(legacy["x-woodright-storefront-source-sha"], undefined)

const malformed = runtimeIdentityHeaderMap({
  WOODRIGHT_BACKEND_SOURCE_SHA: "not-a-sha",
  WOODRIGHT_STOREFRONT_SOURCE_SHA: "also-bad",
  WOODRIGHT_RELEASE_SHA: "zzzz",
})
assert.equal(malformed["x-woodright-backend-source-sha"], undefined)
assert.equal(malformed["x-woodright-storefront-source-sha"], undefined)
assert.equal(malformed["x-woodright-release-sha"], undefined)

console.log("runtime-identity-headers.fidelity.test.ts: ok")
