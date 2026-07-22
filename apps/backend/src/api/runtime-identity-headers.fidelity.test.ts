/**
 * Guard: runtime identity headers module + middleware wiring (static).
 *
 *   yarn exec tsx src/api/runtime-identity-headers.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

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
assert.match(hdrSrc, /x-woodright-database-identity/)
assert.match(hdrSrc, /WOODRIGHT_RUNTIME_ROLE/)
assert.match(hdrSrc, /public_demo_db/)
assert.match(hdrSrc, /non_public_candidate_db/)
assert.match(hdrSrc, /production_candidate/)
assert.doesNotMatch(hdrSrc, /DATABASE_URL/)
assert.doesNotMatch(hdrSrc, /password/i)

console.log("runtime-identity-headers.fidelity.test.ts: ok")
