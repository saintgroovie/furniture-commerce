/**
 * Guard: Woodright public-launch CORS validators (opt-in, fail-closed).
 *
 *   cd apps/backend && yarn dlx tsx src/lib/launch-cors.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  DEMO_CORS_HOSTS,
  PRIVATE_CANDIDATE_QA_ORIGIN,
  PRODUCTION_STORE_ORIGINS,
  assertKnownLaunchCorsProfile,
  assertProductionAdminCors,
  assertProductionAuthCors,
  assertProductionStoreCors,
  parseCorsList,
  parseCorsOrigins,
} from "./launch-cors"

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8")
}

// --- parseCorsOrigins / parseCorsList ---
assert.deepEqual(parseCorsOrigins("https://a.com,https://b.com"), ["https://a.com", "https://b.com"])
assert.deepEqual(parseCorsOrigins(" https://a.com , https://b.com "), ["https://a.com", "https://b.com"])
assert.deepEqual(parseCorsOrigins(""), [])
assert.deepEqual(parseCorsOrigins(undefined), [])
assert.equal(parseCorsList, parseCorsOrigins)

// --- assertProductionStoreCors: exact production origins ---
assert.doesNotThrow(() => assertProductionStoreCors([...PRODUCTION_STORE_ORIGINS]))
assert.doesNotThrow(() =>
  assertProductionStoreCors(["https://www.woodright.ru", "https://woodright.ru"])
)

// --- reject empty / wildcard / demo ---
assert.throws(() => assertProductionStoreCors([]), /must not be empty/)
assert.throws(() => assertProductionStoreCors(["*"]), /must not include "\*"/)
assert.throws(
  () => assertProductionStoreCors(["https://woodright-demo.ru"]),
  /demo host/
)
for (const demo of DEMO_CORS_HOSTS) {
  assert.throws(() => assertProductionStoreCors([`https://${demo}`]), /demo host/)
}

// --- reject partial / extra / wrong-scheme origins outside the private-candidate exception ---
assert.throws(
  () => assertProductionStoreCors(["https://woodright.ru"]),
  /must equal exactly/
)
assert.throws(
  () => assertProductionStoreCors([...PRODUCTION_STORE_ORIGINS, "https://evil.example"]),
  /must equal exactly/
)

// --- private production_candidate QA exception ---
assert.doesNotThrow(() =>
  assertProductionStoreCors([...PRODUCTION_STORE_ORIGINS, PRIVATE_CANDIDATE_QA_ORIGIN], {
    runtimeExposure: "private",
    runtimeRole: "production_candidate",
  })
)
assert.throws(
  () =>
    assertProductionStoreCors([...PRODUCTION_STORE_ORIGINS, PRIVATE_CANDIDATE_QA_ORIGIN], {
      runtimeExposure: "public",
      runtimeRole: "production_candidate",
    }),
  /must equal exactly/
)
assert.throws(
  () =>
    assertProductionStoreCors([PRIVATE_CANDIDATE_QA_ORIGIN], {
      runtimeExposure: "private",
      runtimeRole: "production_candidate",
    }),
  /must be exactly/
)

// --- assertProductionAdminCors ---
assert.doesNotThrow(() => assertProductionAdminCors(["http://127.0.0.1:9000", "http://localhost:5173"]))
assert.throws(() => assertProductionAdminCors([]), /must not be empty/)
assert.throws(() => assertProductionAdminCors(["*"]), /must not include "\*"/)
assert.throws(
  () => assertProductionAdminCors(["https://admin.woodright.ru"]),
  /public woodright\.ru admin host/
)
assert.throws(
  () => assertProductionAdminCors(["https://woodright.ru"]),
  /public woodright\.ru admin host/
)
assert.throws(
  () => assertProductionAdminCors(["https://admin.woodright-demo.ru"]),
  /demo host/
)
assert.throws(
  () => assertProductionAdminCors(["not a url"]),
  /valid absolute URL/
)

// --- assertProductionAuthCors ---
assert.doesNotThrow(() =>
  assertProductionAuthCors([...PRODUCTION_STORE_ORIGINS, "http://127.0.0.1:9000"])
)
assert.doesNotThrow(() =>
  assertProductionAuthCors([...PRODUCTION_STORE_ORIGINS, PRIVATE_CANDIDATE_QA_ORIGIN], {
    runtimeExposure: "private",
    runtimeRole: "production_candidate",
  })
)
assert.throws(() => assertProductionAuthCors(["https://woodright.ru"]), /missing/)
assert.throws(() => assertProductionAuthCors([...PRODUCTION_STORE_ORIGINS, "*"]), /must not include "\*"/)
assert.throws(
  () => assertProductionAuthCors([...PRODUCTION_STORE_ORIGINS, "https://admin.woodright.ru"]),
  /admin\.woodright\.ru/
)
assert.throws(() => assertKnownLaunchCorsProfile("staging_buyer"), /Unknown/)
assert.doesNotThrow(() => assertKnownLaunchCorsProfile(""))
assert.doesNotThrow(() => assertKnownLaunchCorsProfile("production_buyer"))

// --- Static wiring: medusa-config.ts must gate validation, not require it unconditionally ---
const config = read("medusa-config.ts")
assert.match(config, /WOODRIGHT_LAUNCH_CORS_PROFILE/, "medusa-config.ts must gate on WOODRIGHT_LAUNCH_CORS_PROFILE")
assert.match(config, /assertProductionStoreCors/, "medusa-config.ts must call assertProductionStoreCors")
assert.match(config, /assertProductionAdminCors/, "medusa-config.ts must call assertProductionAdminCors")
assert.match(config, /assertProductionAuthCors/, "medusa-config.ts must call assertProductionAuthCors")
assert.match(config, /assertKnownLaunchCorsProfile/, "medusa-config.ts must reject unknown CORS profiles")
assert.match(
  config,
  /launchCorsProfile === "production_buyer"/,
  "validation must be opt-in via production_buyer profile, not implied by role alone"
)

console.log("launch-cors.fidelity: ok")
