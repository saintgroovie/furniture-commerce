/**
 * Guard: public_demo vs production site-URL bake gate (PASS A rebake unblocker).
 *
 *   yarn dlx tsx src/lib/public-demo-bake-gate.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  PUBLIC_DEMO_BUYER_HOSTS,
  PUBLIC_DEMO_BUYER_ORIGINS,
  assertProductionLikeSiteUrl,
  assertPublicDemoSiteUrl,
  isPublicDemoRuntime,
} from "./launch-contract"
import { getSiteUrl } from "./api/base"

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8")
}

const ENV_KEYS = [
  "NEXT_PUBLIC_SITE_URL",
  "WOODRIGHT_RUNTIME_ROLE",
  "WOODRIGHT_IMAGE_BUILD_PROFILE",
  "WOODRIGHT_LAUNCH_MODE",
  "NODE_ENV",
] as const

type EnvSnapshot = Record<(typeof ENV_KEYS)[number], string | undefined>

function snapshotEnv(): EnvSnapshot {
  const out = {} as EnvSnapshot
  for (const k of ENV_KEYS) out[k] = process.env[k]
  return out
}

function restoreEnv(snap: EnvSnapshot): void {
  for (const k of ENV_KEYS) {
    const v = snap[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}

function withEnv(patch: Partial<EnvSnapshot>, fn: () => void): void {
  const snap = snapshotEnv()
  try {
    for (const k of ENV_KEYS) {
      if (!(k in patch)) continue
      const v = patch[k]
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    fn()
  } finally {
    restoreEnv(snap)
  }
}

// --- constants / identity helpers ---
assert.deepEqual(PUBLIC_DEMO_BUYER_ORIGINS, [
  "https://woodright-demo.ru",
  "https://www.woodright-demo.ru",
])
assert.deepEqual(PUBLIC_DEMO_BUYER_HOSTS, ["woodright-demo.ru", "www.woodright-demo.ru"])
assert.equal(isPublicDemoRuntime("public_demo"), true)
assert.equal(isPublicDemoRuntime(undefined, "public_demo"), true)
assert.equal(isPublicDemoRuntime("production"), false)
assert.equal(isPublicDemoRuntime("production_candidate", "production_candidate"), false)
assert.equal(isPublicDemoRuntime("public_demo_extra"), false)
assert.equal(isPublicDemoRuntime(undefined, "Public_Demo"), false)

// --- assertPublicDemoSiteUrl ---
assert.equal(assertPublicDemoSiteUrl("https://woodright-demo.ru"), "https://woodright-demo.ru")
assert.equal(assertPublicDemoSiteUrl("https://woodright-demo.ru/"), "https://woodright-demo.ru")
assert.equal(
  assertPublicDemoSiteUrl("https://www.woodright-demo.ru"),
  "https://www.woodright-demo.ru"
)
assert.throws(() => assertPublicDemoSiteUrl(undefined), /required/)
assert.throws(() => assertPublicDemoSiteUrl(""), /required/)
assert.throws(() => assertPublicDemoSiteUrl("http://woodright-demo.ru"), /must be https/)
assert.throws(() => assertPublicDemoSiteUrl("https://woodright.ru"), /must not be a production host/)
assert.throws(() => assertPublicDemoSiteUrl("https://www.woodright.ru"), /must not be a production host/)
assert.throws(() => assertPublicDemoSiteUrl("https://localhost:8000"), /loopback/)
assert.throws(() => assertPublicDemoSiteUrl("https://127.0.0.1:8000"), /loopback/)
assert.throws(() => assertPublicDemoSiteUrl("https://api.woodright-demo.ru"), /woodright-demo\.ru/)
assert.throws(() => assertPublicDemoSiteUrl("https://evil.example"), /woodright-demo\.ru/)
assert.throws(() => assertPublicDemoSiteUrl("not a url"), /valid absolute URL/)

// --- production assert still rejects demo (not weakened) ---
assert.equal(assertProductionLikeSiteUrl("https://woodright.ru"), "https://woodright.ru")
assert.throws(() => assertProductionLikeSiteUrl("https://woodright-demo.ru"), /demo host/)
assert.throws(() => assertProductionLikeSiteUrl("https://localhost:8000"), /loopback/)
assert.throws(() => assertProductionLikeSiteUrl(undefined), /required/)
assert.throws(() => assertProductionLikeSiteUrl("https://not-a-valid%%"), /valid absolute URL/)

// --- getSiteUrl matrix ---
// 1. public_demo + canonical demo host → PASS (bake-shaped)
withEnv(
  {
    NODE_ENV: "production",
    NEXT_PUBLIC_SITE_URL: "https://woodright-demo.ru",
    WOODRIGHT_LAUNCH_MODE: "private_noindex",
    WOODRIGHT_RUNTIME_ROLE: "public_demo",
    WOODRIGHT_IMAGE_BUILD_PROFILE: "public_demo",
  },
  () => {
    assert.equal(getSiteUrl(), "https://woodright-demo.ru")
  }
)

// 2. public_demo + production host → FAIL
withEnv(
  {
    NODE_ENV: "production",
    NEXT_PUBLIC_SITE_URL: "https://woodright.ru",
    WOODRIGHT_LAUNCH_MODE: "private_noindex",
    WOODRIGHT_RUNTIME_ROLE: "public_demo",
    WOODRIGHT_IMAGE_BUILD_PROFILE: "public_demo",
  },
  () => {
    assert.throws(() => getSiteUrl(), /must not be a production host/)
  }
)

// 3. public_demo + unknown host → FAIL
withEnv(
  {
    NODE_ENV: "production",
    NEXT_PUBLIC_SITE_URL: "https://example.com",
    WOODRIGHT_RUNTIME_ROLE: "public_demo",
    WOODRIGHT_LAUNCH_MODE: "private_noindex",
  },
  () => {
    assert.throws(() => getSiteUrl(), /woodright-demo\.ru/)
  }
)

// 4. production + canonical production host → PASS
withEnv(
  {
    NODE_ENV: "production",
    NEXT_PUBLIC_SITE_URL: "https://woodright.ru",
    WOODRIGHT_LAUNCH_MODE: "private_noindex",
    WOODRIGHT_RUNTIME_ROLE: "production",
    WOODRIGHT_IMAGE_BUILD_PROFILE: undefined,
  },
  () => {
    assert.equal(getSiteUrl(), "https://woodright.ru")
  }
)

// 5. production + woodright-demo.ru → FAIL
withEnv(
  {
    NODE_ENV: "production",
    NEXT_PUBLIC_SITE_URL: "https://woodright-demo.ru",
    WOODRIGHT_LAUNCH_MODE: "private_noindex",
    WOODRIGHT_RUNTIME_ROLE: "production",
  },
  () => {
    assert.throws(() => getSiteUrl(), /demo host/)
  }
)

// 6. production_candidate + localhost → FAIL
withEnv(
  {
    NODE_ENV: "production",
    NEXT_PUBLIC_SITE_URL: "https://localhost:8000",
    WOODRIGHT_LAUNCH_MODE: "private_noindex",
    WOODRIGHT_RUNTIME_ROLE: "production_candidate",
  },
  () => {
    assert.throws(() => getSiteUrl(), /loopback/)
  }
)

// 7. production + missing URL → FAIL
withEnv(
  {
    NODE_ENV: "production",
    NEXT_PUBLIC_SITE_URL: undefined,
    WOODRIGHT_LAUNCH_MODE: "private_noindex",
    WOODRIGHT_RUNTIME_ROLE: "production",
  },
  () => {
    assert.throws(() => getSiteUrl(), /required/)
  }
)

// 8. production + malformed URL → FAIL
withEnv(
  {
    NODE_ENV: "production",
    NEXT_PUBLIC_SITE_URL: "not a url",
    WOODRIGHT_LAUNCH_MODE: "private_noindex",
    WOODRIGHT_RUNTIME_ROLE: "production",
  },
  () => {
    assert.throws(() => getSiteUrl(), /valid absolute URL/)
  }
)

// 9. local/private DX fallback remains
withEnv(
  {
    NODE_ENV: "development",
    NEXT_PUBLIC_SITE_URL: undefined,
    WOODRIGHT_LAUNCH_MODE: undefined,
    WOODRIGHT_RUNTIME_ROLE: undefined,
    WOODRIGHT_IMAGE_BUILD_PROFILE: undefined,
  },
  () => {
    assert.equal(getSiteUrl(), "http://localhost:8000")
  }
)

// 10. launch mode set WITHOUT public_demo identity + demo host → still FAIL
withEnv(
  {
    NODE_ENV: "production",
    NEXT_PUBLIC_SITE_URL: "https://woodright-demo.ru",
    WOODRIGHT_LAUNCH_MODE: "private_noindex",
    WOODRIGHT_RUNTIME_ROLE: undefined,
    WOODRIGHT_IMAGE_BUILD_PROFILE: undefined,
  },
  () => {
    assert.throws(() => getSiteUrl(), /demo host/)
  }
)

// 11. CI-shaped: NODE_ENV=production + demo URL, no launch mode → PASS (unchanged)
withEnv(
  {
    NODE_ENV: "production",
    NEXT_PUBLIC_SITE_URL: "https://woodright-demo.ru",
    WOODRIGHT_LAUNCH_MODE: undefined,
    WOODRIGHT_RUNTIME_ROLE: undefined,
    WOODRIGHT_IMAGE_BUILD_PROFILE: undefined,
  },
  () => {
    assert.equal(getSiteUrl(), "https://woodright-demo.ru")
  }
)

// 12. profile-only public_demo (no role) still uses demo allowlist
withEnv(
  {
    NODE_ENV: "production",
    NEXT_PUBLIC_SITE_URL: "https://woodright-demo.ru",
    WOODRIGHT_LAUNCH_MODE: "private_noindex",
    WOODRIGHT_RUNTIME_ROLE: undefined,
    WOODRIGHT_IMAGE_BUILD_PROFILE: "public_demo",
  },
  () => {
    assert.equal(getSiteUrl(), "https://woodright-demo.ru")
  }
)

// 13. conflicting production-like role + public_demo profile → FAIL
withEnv(
  {
    NODE_ENV: "production",
    NEXT_PUBLIC_SITE_URL: "https://woodright-demo.ru",
    WOODRIGHT_LAUNCH_MODE: "private_noindex",
    WOODRIGHT_RUNTIME_ROLE: "production_candidate",
    WOODRIGHT_IMAGE_BUILD_PROFILE: "public_demo",
  },
  () => {
    assert.throws(() => getSiteUrl(), /Conflicting public_demo identity/)
  }
)

// --- static wiring / no bypass markers ---
const base = read("src/lib/api/base.ts")
assert.match(base, /assertPublicDemoSiteUrl/, "base.ts must use public-demo site assert")
assert.match(base, /assertProductionLikeSiteUrl/, "base.ts must keep production-like assert")
assert.match(base, /isPublicDemoRuntime/, "base.ts must detect public_demo identity")
assert.doesNotMatch(base, /\|\|\s*true/, "base.ts must not contain || true bypass")
assert.doesNotMatch(base, /wildcard/, "base.ts must not mention wildcard bypass")

const contract = read("src/lib/launch-contract.ts")
assert.match(contract, /export function assertPublicDemoSiteUrl/)
assert.match(contract, /PUBLIC_DEMO_BUYER_HOSTS/)
assert.doesNotMatch(contract, /\|\|\s*true/)

console.log("public-demo-bake-gate.fidelity: ok")
