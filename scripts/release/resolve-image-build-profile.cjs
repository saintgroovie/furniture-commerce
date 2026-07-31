#!/usr/bin/env node
/**
 * Fail-closed resolver + validator for Woodright image build profiles.
 *
 * RCA (fixed by this tool): .github/workflows/build-staging-images.yml used to
 * bake NEXT_PUBLIC_SITE_URL from a single `environment: staging` secret
 * (STAGING_NEXT_PUBLIC_SITE_URL = https://woodright-demo.ru) for every build,
 * with no WOODRIGHT_LAUNCH_MODE bake at all - so the launch-contract gate in
 * apps/storefront/Dockerfile was silently skipped, and the resulting images
 * were incorrectly reused as "production-candidate" images. Profiles under
 * ops/config/image-build-profiles/*.conf are now the only source of truth for
 * what gets baked; this resolver is the only code path allowed to read them.
 *
 * Usage:
 *   node scripts/release/resolve-image-build-profile.cjs \
 *     --profile public_demo|production_candidate \
 *     [--print-env] [--checksum] [--validate]
 *   node scripts/release/resolve-image-build-profile.cjs --self-test
 *
 * --print-env   emit KEY=value lines (safe to append to $GITHUB_OUTPUT or
 *               source into a shell) instead of the default JSON dump.
 * --checksum    include a sha256 checksum of the raw profile file contents.
 * --validate    explicit alias; validation always runs regardless of this
 *               flag (this tool is a safety gate, not a diagnostic-only
 *               dump) - kept for CLI clarity / workflow readability.
 *
 * Exit codes: 0 ok | 1 missing/unknown profile or profile failed validation
 *             | 2 usage error
 */
"use strict"

const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

const PROFILE_DIR = path.join(__dirname, "..", "..", "ops", "config", "image-build-profiles")
const ALLOWED_PROFILES = new Set(["public_demo", "production_candidate"])
const SECRET_KEY_RE = /(SECRET|TOKEN|PASSWORD|PUBLISHABLE_KEY|API[_-]?KEY|PRIVATE[_-]?KEY)/i
const SECRET_VALUE_RE = /^ghp_|^gho_|^sk_live_|-----BEGIN /i

function parseConf(text) {
  const out = {}
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const idx = line.indexOf("=")
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

function sha256Hex(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex")
}

/** Throws on missing/unknown profile (fail-closed by construction). */
function loadProfile(name) {
  if (!name) throw new Error("profile name required")
  if (!ALLOWED_PROFILES.has(name)) {
    throw new Error(`unknown profile "${name}" (allowed: ${[...ALLOWED_PROFILES].join("|")})`)
  }
  const file = path.join(PROFILE_DIR, `${name}.conf`)
  if (!fs.existsSync(file)) {
    throw new Error(`profile file missing: ${file}`)
  }
  const text = fs.readFileSync(file, "utf8")
  const values = parseConf(text)
  return { name, file, text, values, checksum: sha256Hex(text) }
}

function assertNoSecrets(values, errors) {
  for (const [k, v] of Object.entries(values)) {
    if (SECRET_KEY_RE.test(k)) errors.push(`profile must not declare secret-looking key: ${k}`)
    if (typeof v === "string" && SECRET_VALUE_RE.test(v)) {
      errors.push(`profile value for ${k} looks like a secret and is forbidden in a tracked .conf file`)
    }
  }
}

const REQUIRED_COMMON_KEYS = [
  "WOODRIGHT_IMAGE_BUILD_PROFILE",
  "WOODRIGHT_ENVIRONMENT_AUTHORITY",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_MEDUSA_BACKEND_URL",
  "MEDUSA_BACKEND_URL",
  "MEDUSA_BACKEND_INTERNAL_URL",
  "WOODRIGHT_LAUNCH_MODE",
  "WOODRIGHT_PAYMENT_MODE",
  "WOODRIGHT_ADMIN_EXPOSURE",
  "WOODRIGHT_RUNTIME_ROLE",
  "WOODRIGHT_RUNTIME_EXPOSURE",
  "WOODRIGHT_DB_ALIAS",
]

function forbiddenSubstringsFor(values) {
  return (values.WOODRIGHT_FORBIDDEN_SITE_SUBSTRINGS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

function assertNoForbiddenSubstrings(values, errors) {
  const forbidden = forbiddenSubstringsFor(values)
  for (const key of ["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_MEDUSA_BACKEND_URL"]) {
    const val = String(values[key] || "").toLowerCase()
    for (const bad of forbidden) {
      if (bad && val.includes(bad.toLowerCase())) {
        errors.push(`${key}="${values[key]}" contains forbidden substring "${bad}"`)
      }
    }
  }
}

function validateCommon(values, errors) {
  for (const key of REQUIRED_COMMON_KEYS) {
    if (!values[key]) errors.push(`missing required key: ${key}`)
  }
  if (values.WOODRIGHT_LAUNCH_MODE && values.WOODRIGHT_LAUNCH_MODE !== "private_noindex") {
    errors.push(`WOODRIGHT_LAUNCH_MODE must be private_noindex (got "${values.WOODRIGHT_LAUNCH_MODE}")`)
  }
  if (values.WOODRIGHT_PAYMENT_MODE && values.WOODRIGHT_PAYMENT_MODE !== "manual_invoice") {
    errors.push(`WOODRIGHT_PAYMENT_MODE must be manual_invoice (got "${values.WOODRIGHT_PAYMENT_MODE}")`)
  }
  if (values.WOODRIGHT_ADMIN_EXPOSURE && values.WOODRIGHT_ADMIN_EXPOSURE !== "private") {
    errors.push(`WOODRIGHT_ADMIN_EXPOSURE must be private (got "${values.WOODRIGHT_ADMIN_EXPOSURE}")`)
  }
  assertNoForbiddenSubstrings(values, errors)
}

function validateProductionCandidate(values, errors) {
  if (values.WOODRIGHT_IMAGE_BUILD_PROFILE !== "production_candidate") {
    errors.push(`WOODRIGHT_IMAGE_BUILD_PROFILE must equal "production_candidate" (got "${values.WOODRIGHT_IMAGE_BUILD_PROFILE}")`)
  }
  if (values.NEXT_PUBLIC_SITE_URL !== "https://woodright.ru") {
    errors.push(`production_candidate requires NEXT_PUBLIC_SITE_URL=https://woodright.ru (got "${values.NEXT_PUBLIC_SITE_URL}")`)
  }
  if (values.NEXT_PUBLIC_MEDUSA_BACKEND_URL !== "https://api.woodright.ru") {
    errors.push(
      `production_candidate requires NEXT_PUBLIC_MEDUSA_BACKEND_URL=https://api.woodright.ru (got "${values.NEXT_PUBLIC_MEDUSA_BACKEND_URL}")`
    )
  }
  if (values.WOODRIGHT_RUNTIME_ROLE !== "production_candidate") {
    errors.push(`production_candidate requires WOODRIGHT_RUNTIME_ROLE=production_candidate (got "${values.WOODRIGHT_RUNTIME_ROLE}")`)
  }
  if (values.WOODRIGHT_RUNTIME_EXPOSURE !== "private") {
    errors.push(`production_candidate requires WOODRIGHT_RUNTIME_EXPOSURE=private (got "${values.WOODRIGHT_RUNTIME_EXPOSURE}")`)
  }
  if (values.WOODRIGHT_DB_ALIAS !== "non_public_candidate_db") {
    errors.push(`production_candidate requires WOODRIGHT_DB_ALIAS=non_public_candidate_db (got "${values.WOODRIGHT_DB_ALIAS}")`)
  }
  // Cross-contamination gate: must never mutate into (or ship with) the demo host.
  const site = String(values.NEXT_PUBLIC_SITE_URL || "").toLowerCase()
  const api = String(values.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "").toLowerCase()
  if (site.includes("woodright-demo.ru") || api.includes("woodright-demo.ru")) {
    errors.push("production_candidate rejects any woodright-demo.ru value (public_demo/production_candidate cross-contamination)")
  }
}

function validatePublicDemo(values, errors) {
  if (values.WOODRIGHT_IMAGE_BUILD_PROFILE !== "public_demo") {
    errors.push(`WOODRIGHT_IMAGE_BUILD_PROFILE must equal "public_demo" (got "${values.WOODRIGHT_IMAGE_BUILD_PROFILE}")`)
  }
  if (values.NEXT_PUBLIC_SITE_URL !== "https://woodright-demo.ru") {
    errors.push(`public_demo requires NEXT_PUBLIC_SITE_URL=https://woodright-demo.ru (got "${values.NEXT_PUBLIC_SITE_URL}")`)
  }
  if (values.NEXT_PUBLIC_MEDUSA_BACKEND_URL !== "https://api.woodright-demo.ru") {
    errors.push(
      `public_demo requires NEXT_PUBLIC_MEDUSA_BACKEND_URL=https://api.woodright-demo.ru (got "${values.NEXT_PUBLIC_MEDUSA_BACKEND_URL}")`
    )
  }
  if (values.WOODRIGHT_RUNTIME_ROLE !== "public_demo") {
    errors.push(`public_demo requires WOODRIGHT_RUNTIME_ROLE=public_demo (got "${values.WOODRIGHT_RUNTIME_ROLE}")`)
  }
  if (values.WOODRIGHT_RUNTIME_EXPOSURE !== "public") {
    errors.push(`public_demo requires WOODRIGHT_RUNTIME_EXPOSURE=public (got "${values.WOODRIGHT_RUNTIME_EXPOSURE}")`)
  }
  if (values.WOODRIGHT_DB_ALIAS !== "public_demo_db") {
    errors.push(`public_demo requires WOODRIGHT_DB_ALIAS=public_demo_db (got "${values.WOODRIGHT_DB_ALIAS}")`)
  }
  // Cross-contamination gate: must never mutate into (or ship with) the production apex.
  const site = String(values.NEXT_PUBLIC_SITE_URL || "").toLowerCase()
  const api = String(values.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "").toLowerCase()
  if (site === "https://woodright.ru" || site === "https://www.woodright.ru" || api === "https://api.woodright.ru") {
    errors.push("public_demo rejects the production apex host (public_demo/production_candidate cross-contamination)")
  }
}

/** Pure function: values -> errors[]. Never touches disk. Used by resolver + fixture tests. */
function validateProfileValues(name, values) {
  const errors = []
  assertNoSecrets(values, errors)
  validateCommon(values, errors)
  if (name === "production_candidate") validateProductionCandidate(values, errors)
  else if (name === "public_demo") validatePublicDemo(values, errors)
  else errors.push(`unknown profile "${name}"`)
  return errors
}

function resolveProfile(name) {
  const profile = loadProfile(name)
  const errors = validateProfileValues(name, profile.values)
  return { ...profile, errors, ok: errors.length === 0 }
}

function printEnv(resolved) {
  const lines = []
  for (const [k, v] of Object.entries(resolved.values)) {
    lines.push(`${k}=${v}`)
  }
  lines.push(`WOODRIGHT_RESOLVED_PROFILE=${resolved.name}`)
  if (resolved.checksum) lines.push(`WOODRIGHT_PROFILE_CHECKSUM=${resolved.checksum}`)
  process.stdout.write(lines.join("\n") + "\n")
}

function printJson(resolved, includeChecksum) {
  const doc = {
    profile: resolved.name,
    file: resolved.file,
    ok: resolved.ok,
    errors: resolved.errors,
    values: resolved.values,
  }
  if (includeChecksum) doc.checksum = resolved.checksum
  process.stdout.write(JSON.stringify(doc, null, 2) + "\n")
}

// ---------------------------------------------------------------------------
// Self-test
// ---------------------------------------------------------------------------

function runSelfTest() {
  const cases = []
  const record = (name, ok) => cases.push([name, !!ok])

  // 1. Missing profile name -> throws.
  try {
    loadProfile("")
    record("missing profile name throws", false)
  } catch {
    record("missing profile name throws", true)
  }

  // 2. Unknown profile -> throws.
  try {
    loadProfile("staging")
    record("unknown profile throws", false)
  } catch {
    record("unknown profile throws", true)
  }

  // 3/4. Real profiles on disk resolve clean.
  let prod, demo
  try {
    prod = resolveProfile("production_candidate")
    record("production_candidate resolves", true)
    record("production_candidate valid on disk", prod.ok)
  } catch (e) {
    record("production_candidate resolves", false)
    console.error("  " + e.message)
  }
  try {
    demo = resolveProfile("public_demo")
    record("public_demo resolves", true)
    record("public_demo valid on disk", demo.ok)
  } catch (e) {
    record("public_demo resolves", false)
    console.error("  " + e.message)
  }

  // 5. Checksum is stable and non-empty.
  if (prod) {
    const again = loadProfile("production_candidate")
    record("checksum stable across loads", prod.checksum === again.checksum && prod.checksum.length === 64)
  }

  // 6. Missing required key -> rejected.
  if (prod) {
    const mutated = { ...prod.values }
    delete mutated.WOODRIGHT_LAUNCH_MODE
    const errors = validateProfileValues("production_candidate", mutated)
    record("missing required key rejected", errors.length > 0)
  }

  // 7. Cross-contamination: production_candidate mutated to demo host -> rejected.
  if (prod) {
    const mutated = { ...prod.values, NEXT_PUBLIC_SITE_URL: "https://woodright-demo.ru" }
    const errors = validateProfileValues("production_candidate", mutated)
    record("production_candidate + demo site url rejected", errors.length > 0)
  }

  // 8. Cross-contamination: public_demo mutated to production apex -> rejected.
  if (demo) {
    const mutated = { ...demo.values, NEXT_PUBLIC_SITE_URL: "https://woodright.ru" }
    const errors = validateProfileValues("public_demo", mutated)
    record("public_demo + production site url rejected", errors.length > 0)
  }

  // 9. public_demo's own demo host must NOT be flagged as forbidden (no false positive
  //    from the "woodright.ru" substring check against "woodright-demo.ru").
  if (demo) {
    const errors = validateProfileValues("public_demo", demo.values)
    record("public_demo demo host is not a false-positive forbidden hit", errors.length === 0)
  }

  // 10. Loopback leak into either profile is rejected.
  if (prod) {
    const mutated = { ...prod.values, NEXT_PUBLIC_MEDUSA_BACKEND_URL: "http://127.0.0.1:9000" }
    const errors = validateProfileValues("production_candidate", mutated)
    record("production_candidate + loopback API URL rejected", errors.length > 0)
  }

  // 11. WOODRIGHT_LAUNCH_MODE=public_indexable rejected (only private_noindex allowed today).
  if (prod) {
    const mutated = { ...prod.values, WOODRIGHT_LAUNCH_MODE: "public_indexable" }
    const errors = validateProfileValues("production_candidate", mutated)
    record("production_candidate + public_indexable rejected", errors.length > 0)
  }

  // 12. Secret-looking key in profile is rejected.
  if (demo) {
    const mutated = { ...demo.values, NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: "pk_test_something" }
    const errors = validateProfileValues("public_demo", mutated)
    record("secret-looking key rejected", errors.length > 0)
  }

  let failed = 0
  for (const [name, ok] of cases) {
    console.log(`${ok ? "PASS" : "FAIL"} ${name}`)
    if (!ok) failed++
  }
  return failed === 0 ? 0 : 1
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2)
  if (args.includes("--self-test")) {
    process.exit(runSelfTest())
  }

  const idx = args.indexOf("--profile")
  const profileName = idx !== -1 ? args[idx + 1] : undefined
  const wantEnv = args.includes("--print-env")
  const wantChecksum = args.includes("--checksum")
  // --validate is accepted for CLI/workflow readability; validation always
  // runs (this is a safety gate, not an optional diagnostic).
  void args.includes("--validate")

  if (!profileName) {
    console.error("usage: resolve-image-build-profile.cjs --profile <public_demo|production_candidate> [--print-env] [--checksum] [--validate]")
    console.error("       resolve-image-build-profile.cjs --self-test")
    process.exit(2)
  }

  let resolved
  try {
    resolved = resolveProfile(profileName)
  } catch (e) {
    console.error(`FAIL_CLOSED ${e.message}`)
    process.exit(1)
  }

  if (!resolved.ok) {
    console.error(`FAIL_CLOSED profile "${profileName}" failed validation:`)
    for (const err of resolved.errors) console.error(`  - ${err}`)
    process.exit(1)
  }

  if (wantEnv) {
    printEnv(resolved)
  } else {
    printJson(resolved, wantChecksum)
  }
  process.exit(0)
}

if (require.main === module) main()

module.exports = {
  PROFILE_DIR,
  ALLOWED_PROFILES,
  parseConf,
  sha256Hex,
  loadProfile,
  resolveProfile,
  validateProfileValues,
  forbiddenSubstringsFor,
}
