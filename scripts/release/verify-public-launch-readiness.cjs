#!/usr/bin/env node
/**
 * Static prep artifact check + optional profile fixture checks.
 * This is NOT cutover authorization.
 *
 *   node scripts/release/verify-public-launch-readiness.cjs --check-static
 *   node scripts/release/verify-public-launch-readiness.cjs --fixture pass|fail-legal|fail-admin|fail-psp
 *
 * Exit 0 for prep-artifact success does not mean public_launch_ready.
 */
"use strict"

const fs = require("fs")
const path = require("path")

const ROOT = path.resolve(__dirname, "../..")

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8")
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel))
}

function fail(msg) {
  console.error(`FAIL: ${msg}`)
  process.exitCode = 1
}

function ok(msg) {
  console.log(`OK: ${msg}`)
}

function parseArgs(argv) {
  const out = { fixture: null, checkStatic: false }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--check-static") out.checkStatic = true
    else if (a === "--fixture") out.fixture = argv[++i]
    else fail(`unknown argument: ${a}`)
  }
  return out
}

function assertStaticArtifacts() {
  console.log(
    "NOTE: --check-static verifies prep artifacts only; it does NOT authorize DNS/TLS cutover"
  )
  const required = [
    "apps/storefront/src/lib/launch-config.ts",
    "apps/storefront/src/lib/csp-policy.ts",
    "apps/storefront/src/lib/legal/owner-inputs.ts",
    "apps/storefront/src/lib/legal/legal-content.ts",
    "apps/storefront/src/app/privacy/page.tsx",
    "apps/storefront/src/app/offer/page.tsx",
    "apps/storefront/src/app/delivery/page.tsx",
    "apps/storefront/src/app/payment/page.tsx",
    "apps/storefront/src/app/returns/page.tsx",
    "apps/storefront/src/app/warranty/page.tsx",
    "apps/backend/src/lib/cors-origin-policy.ts",
    "apps/backend/src/lib/payment-launch-mode.ts",
    "docs/operator/traefik-woodright-production.INACTIVE.yml",
    "docs/operator/production-admin-bootstrap.md",
    "docs/operator/production-admin-private-access.md",
    "docs/operator/env/production-public-private-noindex.env.template",
    "docs/operator/env/production-public-indexable.env.overlay.template",
    "ops/launch/legacy-redirect-map.json",
    "scripts/ops/admin-bootstrap-dry-run.sh",
  ]
  for (const rel of required) {
    if (!exists(rel)) fail(`missing artifact ${rel}`)
    else ok(`artifact ${rel}`)
  }

  const inactive = read("docs/operator/traefik-woodright-production.INACTIVE.yml")
  if (!/DO NOT apply/i.test(inactive)) fail("production Traefik template must be marked inactive")
  else ok("traefik template inactive marker")
  if (/admin\.woodright\.ru/.test(inactive)) {
    fail("production Traefik template must not publish admin.woodright.ru")
  } else ok("no admin public host in traefik template")

  const map = JSON.parse(read("ops/launch/legacy-redirect-map.json"))
  if (map.security?.preserve_query !== false) fail("redirect map must not preserve query by default")
  else ok("redirect map strips sensitive query")
  if (!Array.isArray(map.security?.strip_params) || !map.security.strip_params.includes("token")) {
    fail("redirect map must strip token params")
  } else ok("redirect map strips token")

  const mw = read("apps/storefront/src/middleware.ts")
  if (!/buildConnectSrcDirective/.test(mw)) fail("middleware must use CSP connect builder")
  else ok("middleware CSP connect builder")

  const indexing = read("apps/storefront/src/lib/indexing-policy.ts")
  if (/public_indexable/.test(indexing) && /return "index"/.test(indexing)) {
    // Allow comments mentioning the alias, but not mapping it to index.
    if (/v === "public_indexable"/.test(indexing)) {
      fail("indexing-policy must not map public_indexable → index at runtime")
    }
  }
  ok("indexing-policy does not auto-index public_indexable alias")

  const footer = read("apps/storefront/src/lib/woodright-copy.ts")
  // Public-launch-blockers merge (2026-07-30) resolution: the 5 buyer legal
  // pages (privacy/terms/delivery/payment/returns) are explicitly footer-linked
  // even while `incompleteForPublicLaunch` is true - each renders confirmed
  // showroom/checkout facts only, with a neutral "готовится" note, never a
  // finished legal document. /offer and /warranty (oferta / warranty
  // commitments) stay unlinked until owner input completes them.
  if (/href: "\/offer"/.test(footer) || /href: "\/warranty"/.test(footer)) {
    fail("footer must not link oferta/warranty pages until owner inputs complete")
  } else ok("footer does not advertise oferta/warranty ahead of owner approval")
}

function evaluateFixture(name) {
  const allowed = new Set(["pass", "fail-legal", "fail-admin", "fail-psp"])
  if (!allowed.has(name)) {
    fail(`unknown fixture: ${name}`)
    return
  }
  const state = {
    legalComplete: true,
    adminUsers: 1,
    paymentMode: "manager_payment_link",
    onlinePspCreds: false,
  }
  if (name === "fail-legal") state.legalComplete = false
  if (name === "fail-admin") state.adminUsers = 0
  if (name === "fail-psp") {
    state.paymentMode = "online_psp"
    state.onlinePspCreds = false
  }

  const prepBlockers = []
  if (!state.legalComplete) prepBlockers.push("legal_inputs_incomplete")
  if (state.adminUsers < 1) prepBlockers.push("admin_users_zero")
  if (state.paymentMode === "online_psp" && !state.onlinePspCreds) {
    prepBlockers.push("online_psp_credentials_missing")
  }
  const ownerGates = ["dns_cutover_not_authorized", "tls_activation_not_authorized"]

  console.log(
    JSON.stringify(
      {
        fixture: name,
        note: "Synthetic prep fixture - not live cutover evidence",
        state,
        prepBlockers,
        ownerGates,
      },
      null,
      2
    )
  )

  if (name === "pass") {
    if (prepBlockers.length === 0) {
      ok("prep dimensions clear in fixture; DNS/TLS still require separate owner approval")
      return
    }
    fail(`unexpected prep blockers: ${prepBlockers.join(",")}`)
    return
  }
  if (prepBlockers.length === 0) {
    fail(`fixture ${name} expected prep blockers`)
    return
  }
  ok(`fixture ${name} blocked as expected: ${prepBlockers.join(",")}`)
}

function main() {
  const args = parseArgs(process.argv)
  if (process.exitCode) {
    console.error("verify-public-launch-readiness: FAILED")
    process.exit(process.exitCode)
  }
  if (!args.checkStatic && !args.fixture) {
    fail("specify --check-static and/or --fixture <name>")
  }
  if (args.checkStatic) assertStaticArtifacts()
  if (args.fixture) evaluateFixture(args.fixture)
  if (process.exitCode) {
    console.error("verify-public-launch-readiness: FAILED (prep artifacts/fixtures)")
    process.exit(process.exitCode)
  }
  console.log(
    "verify-public-launch-readiness: OK (prep only - not cutover authorization)"
  )
}

main()
