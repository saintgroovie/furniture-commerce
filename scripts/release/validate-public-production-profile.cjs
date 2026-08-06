#!/usr/bin/env node
/**
 * Read-only validator for the repository public_production profile + SEO +
 * monitor/backup/recovery contracts.
 * Does not imply launch_ready / deploy authorization / VM install.
 *
 * Usage:
 *   node scripts/release/validate-public-production-profile.cjs
 *   node scripts/release/validate-public-production-profile.cjs --repo-root /path
 *
 * Status token (last stdout line):
 *   STATUS PUBLIC_PRODUCTION_PROFILE_VALID_SEO_MONITOR_BACKUP_CONTRACTS_READY_RUNTIME_GATES_PENDING
 *   STATUS PUBLIC_PRODUCTION_PROFILE_INVALID
 */
const fs = require("fs")
const path = require("path")
const {
  evaluatePublicPaymentReady,
  parsePaymentDecisionStatus,
  PUBLIC_READY_PAYMENT_DECISION,
} = require("./lib/payment-readiness.cjs")

function parseArgs(argv) {
  const out = { "repo-root": process.cwd(), "profile-path": null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--repo-root") out["repo-root"] = argv[++i]
    if (a === "--profile-path") out["profile-path"] = argv[++i]
  }
  return out
}

function fail(errors, msg) {
  errors.push(msg)
}

function mustExist(errors, root, rel) {
  const p = path.join(root, rel)
  if (!fs.existsSync(p)) fail(errors, `missing ${rel}`)
  return p
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const root = path.resolve(args["repo-root"])
  const errors = []
  const blockers = []
  const contractReady = []

  const profilePath = args["profile-path"]
    ? path.resolve(args["profile-path"])
    : path.join(root, "ops/config/runtime-environments/public_production.conf")
  let paymentDecisionRaw = ""
  let paymentModeRaw = ""
  if (!fs.existsSync(profilePath)) {
    fail(errors, `missing profile at ${path.relative(root, profilePath) || profilePath}`)
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
      ["WOODRIGHT_LEGAL_CONTENT_STATUS", "draft"],
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
      ["WOODRIGHT_MONITOR_BACKUP_CONTRACT", "repository_ready"],
      ["WOODRIGHT_MONITOR_BACKUP_RUNTIME_PROVISIONED", "0"],
      ["WOODRIGHT_ALERT_DESTINATION_REQUIRED", "1"],
    ]
    for (const [key, expect] of required) {
      const re = new RegExp(`^${key}=(.*)$`, "m")
      const m = conf.match(re)
      if (!m) fail(errors, `missing ${key}`)
      else if (m[1].trim() !== expect) fail(errors, `${key} want=${expect} got=${m[1].trim()}`)
    }
    const payModeMatch = conf.match(/^WOODRIGHT_PAYMENT_MODE=(.*)$/m)
    if (!payModeMatch) fail(errors, "missing WOODRIGHT_PAYMENT_MODE")
    else {
      paymentModeRaw = payModeMatch[1].trim()
      if (paymentModeRaw !== "manual_invoice") {
        fail(errors, `WOODRIGHT_PAYMENT_MODE want=manual_invoice got=${paymentModeRaw}`)
      }
    }
    const payDecMatch = conf.match(/^WOODRIGHT_PAYMENT_DECISION_STATUS=(.*)$/m)
    if (!payDecMatch) fail(errors, "missing WOODRIGHT_PAYMENT_DECISION_STATUS")
    else {
      paymentDecisionRaw = payDecMatch[1].trim()
      const parsed = parsePaymentDecisionStatus(paymentDecisionRaw)
      if (parsed.kind !== "pending" && parsed.kind !== "accepted_manual") {
        fail(
          errors,
          `WOODRIGHT_PAYMENT_DECISION_STATUS must be pending|accepted_manual (got ${paymentDecisionRaw})`
        )
      }
    }
    for (const banned of [
      "runtime-ownership-public-demo",
      "runtime-ownership-production/",
      "locks/public_demo/",
      "locks/production/",
      "woodright-demo.ru",
    ]) {
      if (banned === "runtime-ownership-production/" && conf.includes("runtime-ownership-public-production")) {
        if (conf.match(/WOODRIGHT_OWNERSHIP_DIR=.*runtime-ownership-production[^-]/)) {
          fail(errors, `shared ownership path leak: ${banned}`)
        }
        continue
      }
      if (conf.includes(banned) && !banned.includes("woodright-demo.ru")) {
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
    if (!/WOODRIGHT_MONITOR_HISTORY_ROOT=\/srv\/woodright\/monitoring\/public-production\/history/.test(conf)) {
      fail(errors, "monitor history root must be public-production scoped")
    }
    if (!/WOODRIGHT_ALERT_DESTINATION_PATH=\/srv\/woodright\/monitoring\/public-production\//.test(conf)) {
      fail(errors, "alert destination path must be public-production scoped")
    }
  }

  const loader = fs.readFileSync(
    path.join(root, "ops/lib/woodright-environment-profile.sh"),
    "utf8"
  )
  if (!loader.includes("public_production")) {
    fail(errors, "environment loader missing public_production")
  }
  if (!loader.includes("WOODRIGHT_MONITOR_STATE_ROOT")) {
    fail(errors, "environment loader must rebind MONITOR_STATE_ROOT")
  }

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

  // Monitor/backup/recovery contract files
  const contractFiles = [
    "ops/lib/woodright-ops-path-isolation.sh",
    "ops/lib/woodright-alert-contract.sh",
    "ops/lib/woodright-recovery-point.sh",
    "ops/backup/woodright-public-production-backup-run.sh",
    "ops/backup/woodright-public-production-restore-rehearsal.sh",
    "ops/systemd/woodright-monitor-public-production.service",
    "ops/systemd/woodright-monitor-public-production.timer",
    "ops/systemd/woodright-backup-public-production.service",
    "ops/systemd/woodright-backup-public-production.timer",
    "ops/systemd/woodright-restore-rehearsal-public-production.service",
    "docs/operator/public-production-monitor-backup-recovery.md",
  ]
  for (const rel of contractFiles) {
    mustExist(errors, root, rel)
    contractReady.push(rel)
  }

  // Unit templates must pin public-production paths and not auto-enable semantics in comments
  const monUnit = fs.readFileSync(
    path.join(root, "ops/systemd/woodright-monitor-public-production.service"),
    "utf8"
  )
  if (!monUnit.includes("--environment public_production")) {
    fail(errors, "monitor unit must pass --environment public_production")
  }
  if (!monUnit.includes("/monitoring/public-production/")) {
    fail(errors, "monitor unit must pin public-production state path")
  }
  if (!monUnit.includes("do NOT enable automatically")) {
    fail(errors, "monitor unit must document no auto-enable")
  }
  const bakUnit = fs.readFileSync(
    path.join(root, "ops/systemd/woodright-backup-public-production.service"),
    "utf8"
  )
  if (!bakUnit.includes("woodright-public-production-backup-run.sh")) {
    fail(errors, "backup unit must call public-production backup helper")
  }
  if (!bakUnit.includes("/backups/automated/public-production")) {
    fail(errors, "backup unit must pin public-production backup root")
  }
  for (const dep of [
    "ops/backup/lib/woodright-backup-root.sh",
    "ops/backup/woodright-postgres-backup.sh",
    "ops/backup/woodright-media-backup.sh",
    "ops/backup/woodright-backup-retention.sh",
  ]) {
    mustExist(errors, root, dep)
  }
  const installSrc = fs.readFileSync(
    path.join(root, "ops/release/install-environment-governance.sh"),
    "utf8"
  )
  if (!installSrc.includes("ops/backup/lib/woodright-backup-root.sh")) {
    fail(errors, "installer must ship backup-root lib")
  }
  if (!installSrc.includes("ops/backup/woodright-postgres-backup.sh")) {
    fail(errors, "installer must ship postgres backup helper")
  }
  // Live /etc install loop must NOT auto-install public-production units
  if (/for unit_rel in[^;]*public-production/.test(installSrc.replace(/\n/g, " "))) {
    fail(errors, "installer must not auto-install public-production units to /etc")
  }
  const restoreUnit = fs.readFileSync(
    path.join(root, "ops/systemd/woodright-restore-rehearsal-public-production.service"),
    "utf8"
  )
  if (fs.existsSync(path.join(root, "ops/systemd/woodright-restore-rehearsal-public-production.timer"))) {
    fail(errors, "restore rehearsal must not ship an auto timer")
  }
  if (!restoreUnit.includes("No companion timer")) {
    fail(errors, "restore unit must document no companion timer")
  }

  // Health-check must consume MONITOR_STATE_ROOT / fail-closed unprovisioned
  const health = fs.readFileSync(
    path.join(root, "ops/monitoring/woodright-health-check.sh"),
    "utf8"
  )
  if (!health.includes("WOODRIGHT_MONITOR_STATE_ROOT")) {
    fail(errors, "health-check must honor MONITOR_STATE_ROOT")
  }
  if (!health.includes("unprovisioned_fail_closed")) {
    fail(errors, "health-check must fail-closed when public_production unprovisioned")
  }
  if (!health.includes("wr_assert_public_production_path_isolation")) {
    fail(errors, "health-check must assert path isolation for public_production")
  }
  if (!health.includes("accepted_manual")) {
    fail(errors, "health-check must require accepted_manual for payment decision pass")
  }
  if (!/WOODRIGHT_PAYMENT_MODE.*manual_invoice/.test(health)) {
    fail(errors, "health-check must require WOODRIGHT_PAYMENT_MODE=manual_invoice with accepted_manual")
  }

  // Backup helper must refuse wrong env / demo DB
  const bak = fs.readFileSync(
    path.join(root, "ops/backup/woodright-public-production-backup-run.sh"),
    "utf8"
  )
  if (!bak.includes("public_production")) fail(errors, "backup helper missing env gate")
  if (!bak.includes("woodright_staging")) fail(errors, "backup helper must refuse staging DB")
  if (!bak.includes("WOODRIGHT_BACKUP_PLAN_ONLY")) {
    fail(errors, "backup helper must support plan-only mode")
  }

  // Remaining launch / runtime gates (expected pending on real profile).
  // Payment gate clears only when owner-attested accepted_manual + manual_invoice;
  // that never alone makes launch_ready true.
  blockers.push("LEGAL_CONTENT_STATUS!=approved")
  const paymentReady = evaluatePublicPaymentReady({
    paymentMode: paymentModeRaw,
    paymentDecisionStatus: paymentDecisionRaw,
  })
  if (paymentReady.ready) {
    contractReady.push(`payment_contract_ready:${PUBLIC_READY_PAYMENT_DECISION}`)
  } else if (paymentReady.conflict) {
    blockers.push(`PAYMENT_DECISION_STATUS=conflict:${paymentReady.reason}`)
  } else if (paymentReady.decisionKind === "pending") {
    blockers.push("PAYMENT_DECISION_STATUS=pending")
  } else if (paymentReady.decisionKind === "missing") {
    blockers.push("PAYMENT_DECISION_STATUS=missing")
  } else if (paymentReady.decisionKind === "rejected") {
    blockers.push("PAYMENT_DECISION_STATUS=rejected")
  } else if (!paymentReady.paymentModeOk) {
    blockers.push(`PAYMENT_MODE_NOT_PUBLIC_READY:${paymentReady.reason}`)
  } else {
    blockers.push(`PAYMENT_DECISION_STATUS=unsupported:${paymentDecisionRaw || "<empty>"}`)
  }
  blockers.push("NOTIFICATION_DECISION_STATUS=pending")
  blockers.push("owner_approval_manifest_public_production_missing")
  blockers.push("monitor_backup_runtime_not_provisioned")
  blockers.push("alert_destination_not_provisioned_on_vm")
  blockers.push("restore_rehearsal_not_fresh")
  blockers.push("dns_tls_not_proven")
  blockers.push("application_images_not_qualified")

  const report = {
    tool: "validate-public-production-profile.cjs",
    profile_valid: errors.length === 0,
    seo_contract_present: errors.length === 0,
    monitor_backup_contracts_present: errors.length === 0,
    payment_contract_ready: paymentReady.ready,
    payment_contract_detail: paymentReady.reason,
    launch_ready: false,
    runtime_provisioned: false,
    errors,
    contract_files: contractReady,
    pending_launch_gates: blockers,
  }
  console.log(JSON.stringify(report, null, 2))
  if (errors.length) {
    console.log("STATUS PUBLIC_PRODUCTION_PROFILE_INVALID")
    process.exit(2)
  }
  console.log(
    "STATUS PUBLIC_PRODUCTION_PROFILE_VALID_SEO_MONITOR_BACKUP_CONTRACTS_READY_RUNTIME_GATES_PENDING"
  )
  process.exit(0)
}

main()
