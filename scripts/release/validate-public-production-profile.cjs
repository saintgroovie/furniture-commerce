#!/usr/bin/env node
/**
 * Read-only validator for the repository public_production profile + SEO contract.
 * Does not imply launch_ready / deploy authorization.
 *
 * Usage:
 *   node scripts/release/validate-public-production-profile.cjs
 *   node scripts/release/validate-public-production-profile.cjs --repo-root /path
 *
 * Status token (last stdout line):
 *   STATUS PUBLIC_PRODUCTION_PROFILE_VALID_SEO_READY_LAUNCH_GATES_PENDING
 *   STATUS PUBLIC_PRODUCTION_PROFILE_INVALID
 */
const fs = require("fs")
const path = require("path")

function parseArgs(argv) {
  const out = { "repo-root": process.cwd() }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--repo-root") out["repo-root"] = argv[++i]
  }
  return out
}

function fail(errors, msg) {
  errors.push(msg)
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const root = path.resolve(args["repo-root"])
  const errors = []
  const blockers = []

  const profilePath = path.join(
    root,
    "ops/config/runtime-environments/public_production.conf"
  )
  if (!fs.existsSync(profilePath)) {
    fail(errors, "missing public_production.conf")
  } else {
    const conf = fs.readFileSync(profilePath, "utf8")
    const required = [
      ["WOODRIGHT_ENVIRONMENT", "public_production"],
      ["WOODRIGHT_ENVIRONMENT_CLASS", "PUBLIC_PRODUCTION"],
      ["WOODRIGHT_PUBLIC_EXPOSURE", "public"],
      ["WOODRIGHT_LAUNCH_MODE", "public_indexable"],
      ["WOODRIGHT_SEO_MODE", "public_indexable"],
      ["WOODRIGHT_CANONICAL_SITE_URL", "https://woodright.ru"],
      ["WOODRIGHT_PUBLIC_API_URL", "https://api.woodright.ru"],
      ["WOODRIGHT_REQUIRED_DB_ALIAS", "public_production_db"],
      ["WOODRIGHT_OWNER_APPROVAL_ENVIRONMENT", "public_production"],
      ["WOODRIGHT_ADMIN_EXPOSURE", "private"],
      ["WOODRIGHT_LEGAL_CONTENT_STATUS", "owner_review"],
      ["WOODRIGHT_PAYMENT_DECISION_STATUS", "pending"],
      ["WOODRIGHT_NOTIFICATION_DECISION_STATUS", "pending"],
      ["WOODRIGHT_ENVIRONMENT_PROVISIONED", "0"],
      ["WOODRIGHT_HOST_PUBLISH_POLICY", "deny"],
      ["WOODRIGHT_ALLOW_HOST_PUBLISH", "0"],
      ["WOODRIGHT_LAUNCH_GATE_OWNER_APPROVAL", "required"],
      ["WOODRIGHT_LAUNCH_GATE_LEGAL", "required"],
      ["WOODRIGHT_LAUNCH_GATE_PAYMENT_DECISION", "required"],
      ["WOODRIGHT_LAUNCH_GATE_NOTIFICATION_DECISION", "required"],
      ["WOODRIGHT_LAUNCH_GATE_MONITOR_BACKUP", "required"],
      ["WOODRIGHT_LAUNCH_GATE_DNS_TLS", "required"],
    ]
    for (const [key, expect] of required) {
      const re = new RegExp(`^${key}=(.*)$`, "m")
      const m = conf.match(re)
      if (!m) fail(errors, `missing ${key}`)
      else if (m[1].trim() !== expect) fail(errors, `${key} want=${expect} got=${m[1].trim()}`)
    }
    for (const banned of [
      "runtime-ownership-public-demo",
      "runtime-ownership-production/",
      "locks/public_demo/",
      "locks/production/",
      "woodright-demo.ru",
    ]) {
      // ownership-production without -public is candidate path; allow comment mentions only via exact path tokens
      if (banned === "runtime-ownership-production/" && conf.includes("runtime-ownership-public-production")) {
        // ok if only public-production path present
        if (conf.match(/WOODRIGHT_OWNERSHIP_DIR=.*runtime-ownership-production[^-]/)) {
          fail(errors, `shared ownership path leak: ${banned}`)
        }
        continue
      }
      if (conf.includes(banned) && !banned.includes("woodright-demo.ru")) {
        // forbidden domains line may include demo hosts intentionally
        if (banned.includes("woodright-demo")) continue
        fail(errors, `shared/banned path token: ${banned}`)
      }
    }
    if (!conf.includes("WOODRIGHT_FORBIDDEN_DOMAINS=") || !conf.includes("woodright-demo.ru")) {
      fail(errors, "FORBIDDEN_DOMAINS must list demo hosts")
    }
    if (!/WOODRIGHT_OWNERSHIP_DIR=\/srv\/woodright\/runtime-ownership-public-production/.test(conf)) {
      fail(errors, "ownership dir must be public-production scoped")
    }
    if (!/WOODRIGHT_MUTATION_LOCK_PATH=\/srv\/woodright\/locks\/public_production\//.test(conf)) {
      fail(errors, "lock path must be public-production scoped")
    }
    if (!/WOODRIGHT_BACKUP_ROOT=\/srv\/woodright\/backups\/automated\/public-production/.test(conf)) {
      fail(errors, "backup root must be public-production scoped")
    }
    if (!/WOODRIGHT_MONITOR_STATE_ROOT=\/srv\/woodright\/monitoring\/public-production\//.test(conf)) {
      fail(errors, "monitor state root must be public-production scoped")
    }
  }

  // Loader allowlist
  const loader = fs.readFileSync(
    path.join(root, "ops/lib/woodright-environment-profile.sh"),
    "utf8"
  )
  if (!loader.includes("public_production")) {
    fail(errors, "environment loader missing public_production")
  }

  // Installer/verifier allowlists
  for (const rel of [
    "ops/release/install-environment-governance.sh",
    "ops/release/verify-environment-governance-bundle.sh",
  ]) {
    const t = fs.readFileSync(path.join(root, rel), "utf8")
    if (!t.includes("public_production.conf")) {
      fail(errors, `${rel} missing public_production.conf allowlist entry`)
    }
  }

  // SEO wiring
  const seoMode = fs.readFileSync(
    path.join(root, "apps/storefront/src/lib/seo-mode.ts"),
    "utf8"
  )
  if (!seoMode.includes("isPublicProductionRuntime")) {
    fail(errors, "seo-mode missing public_production identity gate")
  }
  if (!seoMode.includes("isPublicDemoRuntime")) {
    fail(errors, "seo-mode missing demo identity gate")
  }
  const indexing = fs.readFileSync(
    path.join(root, "apps/storefront/src/lib/indexing-policy.ts"),
    "utf8"
  )
  if (!indexing.includes("Sitemap:")) fail(errors, "robotsTxtBody missing Sitemap line")
  if (!indexing.includes("resolveSeoMode")) {
    fail(errors, "indexing-policy must default via resolveSeoMode")
  }
  const sitemap = fs.readFileSync(
    path.join(root, "apps/storefront/src/app/sitemap.xml/route.ts"),
    "utf8"
  )
  if (!sitemap.includes("renderSitemapXml")) fail(errors, "sitemap route incomplete")
  if (!sitemap.includes("Array.isArray")) {
    fail(errors, "sitemap must fail-closed on malformed catalog.products")
  }
  const pdp = fs.readFileSync(
    path.join(root, "apps/storefront/src/app/product/[id]/page.tsx"),
    "utf8"
  )
  if (!pdp.includes("notFound(")) fail(errors, "PDP missing notFound()")
  if (/title:\s*"Товар"/.test(pdp)) fail(errors, "PDP still soft-titles missing products")
  if (!/throw e/.test(pdp)) {
    fail(errors, "PDP metadata must rethrow non-NOT_FOUND errors")
  }
  // Remaining launch gates (expected pending)
  blockers.push("LEGAL_CONTENT_STATUS!=approved")
  blockers.push("PAYMENT_DECISION_STATUS=pending")
  blockers.push("NOTIFICATION_DECISION_STATUS=pending")
  blockers.push("owner_approval_manifest_public_production_missing")
  blockers.push("monitor_backup_units_not_provisioned")
  blockers.push("dns_tls_not_proven")
  blockers.push("application_images_not_qualified_for_new_seo_sha")

  const report = {
    tool: "validate-public-production-profile.cjs",
    profile_valid: errors.length === 0,
    seo_contract_present: errors.length === 0,
    launch_ready: false,
    errors,
    pending_launch_gates: blockers,
  }
  console.log(JSON.stringify(report, null, 2))
  if (errors.length) {
    console.log("STATUS PUBLIC_PRODUCTION_PROFILE_INVALID")
    process.exit(2)
  }
  console.log("STATUS PUBLIC_PRODUCTION_PROFILE_VALID_SEO_READY_LAUNCH_GATES_PENDING")
  process.exit(0)
}

main()
