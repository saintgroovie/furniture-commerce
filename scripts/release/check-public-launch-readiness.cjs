#!/usr/bin/env node
/**
 * Woodright public-launch readiness gate (fail-closed, read-only).
 *
 * Does not touch DNS, Traefik, or the database - it only validates the
 * launch contract inputs + the presence/shape of required evidence files
 * and prints a status token.
 *
 * Usage:
 *   node scripts/release/check-public-launch-readiness.cjs \
 *     --environment production \
 *     --launch-mode private_noindex \
 *     --site-url https://woodright.ru \
 *     --api-url https://api.woodright.ru \
 *     --admin-exposure private \
 *     --payment-mode manual_invoice \
 *     --payment-decision-status pending|accepted_manual \
 *     --legal-manifest path/to/legal-manifest.json \
 *     --duplicate-handle-report path/to/duplicate-handle-report.json \
 *     --route-config path/to/route-config.json \
 *     --dns-snapshot path/to/dns-snapshot.json \
 *     --tls-plan path/to/tls-plan.md \
 *     --rollback-packet path/to/rollback-packet.md
 *
 *   node scripts/release/check-public-launch-readiness.cjs --self-test
 *
 * Status tokens (last stdout line, `STATUS <token>`):
 *   not_ready                                   - technical/contract inputs failed validation
 *   public_launch_blocked                       - public_indexable requested, not owner/technically ready
 *   private_candidate_ready_for_deploy_approval  - private_noindex + all technical checks pass
 *   public_indexable_ready_for_cutover_approval  - public_indexable + approved legal +
 *                                                  manual_invoice + accepted_manual + technical evidence
 *
 * Payment public-ready requires BOTH:
 *   --payment-mode manual_invoice
 *   --payment-decision-status accepted_manual
 * Status-only flips or bare `accepted` do not unlock. No online PSP exists.
 * This gate does not authorize deploy or DNS cutover.
 * `--environment` must be exactly "production" for this gate - "public_demo"
 * (or any other value) is rejected, never silently treated as production.
 *
 * `--payment-mode` mapping (avoid drift between the two payment-mode
 * contracts that exist after the 2026-07-30 public-launch-blockers merge):
 *   this flag                          | storefront contract        | backend contract
 *   --payment-mode manual_invoice      | WOODRIGHT_PAYMENT_MODE      | WOODRIGHT_PAYMENT_LAUNCH_MODE
 *                                      | =manual_invoice (only mode, | =manager_payment_link (default)
 *                                      | see apps/storefront/src/lib/| see apps/backend/src/lib/
 *                                      | payment-mode.ts)            | payment-launch-mode.ts
 * Both describe the same operational scenario (no online PSP; manager sends
 * a payment link after order confirmation) under different env-var names in
 * different apps. This gate only validates the flag value passed by the
 * operator - it does not read either app's live env - so keep the operator
 * runbook honest that setting one env var does not set the other.
 */
const fs = require("fs")
const {
  evaluatePublicPaymentReady,
} = require("./lib/payment-readiness.cjs")

const DEMO_HOSTS = ["woodright-demo.ru", "www.woodright-demo.ru", "api.woodright-demo.ru"]
const LOOPBACK_RE = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|::1)(:\d+)?$/i
const PRODUCTION_API_HOST = "api.woodright.ru"
const REQUIRED_LEGAL_SLUGS = ["privacy", "terms", "delivery", "payment", "returns"]
const EVIDENCE_FLAGS = [
  ["duplicate-handle-report", "--duplicate-handle-report"],
  ["route-config", "--route-config"],
  ["dns-snapshot", "--dns-snapshot"],
  ["tls-plan", "--tls-plan"],
  ["rollback-packet", "--rollback-packet"],
]

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith("--")) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith("--")) {
      out[key] = true
    } else {
      out[key] = next
      i++
    }
  }
  return out
}

function hostOf(raw) {
  try {
    return new URL(raw).hostname.toLowerCase()
  } catch {
    return null
  }
}

function isDemoHost(host) {
  if (!host) return false
  return DEMO_HOSTS.some((demo) => host === demo || host.endsWith(`.${demo}`))
}

function checkAbsoluteUrl(raw, label, errors) {
  if (!raw || typeof raw !== "string") {
    errors.push(`${label} is required`)
    return
  }
  let url
  try {
    url = new URL(raw)
  } catch {
    errors.push(`${label} is not a valid absolute URL: "${raw}"`)
    return
  }
  if (url.protocol !== "https:") errors.push(`${label} must be https: "${raw}"`)
  if (LOOPBACK_RE.test(url.hostname) || LOOPBACK_RE.test(url.host)) {
    errors.push(`${label} must not be loopback/localhost: "${raw}"`)
  }
  if (isDemoHost(url.hostname)) errors.push(`${label} must not be a demo host: "${raw}"`)
}

function readJson(p) {
  const raw = fs.readFileSync(p, "utf8")
  return JSON.parse(raw)
}

/** Pure check - takes an already-parsed args object, returns { ok, status, errors, warnings }. */
function evaluate(args) {
  const errors = []
  const warnings = []

  const environment = args.environment
  if (!environment) {
    return { ok: false, status: "not_ready", errors: ["--environment is required"], warnings }
  }
  if (environment !== "production") {
    return {
      ok: false,
      status: "not_ready",
      errors: [`--environment must be "production" for this gate, got "${environment}"`],
      warnings,
    }
  }

  const launchMode = args["launch-mode"]
  if (launchMode !== "private_noindex" && launchMode !== "public_indexable") {
    errors.push(
      `--launch-mode must be "private_noindex" or "public_indexable", got "${launchMode}"`
    )
  }

  checkAbsoluteUrl(args["site-url"], "--site-url", errors)
  checkAbsoluteUrl(args["api-url"], "--api-url", errors)

  const apiHost = hostOf(args["api-url"])
  if (apiHost && apiHost !== PRODUCTION_API_HOST) {
    warnings.push(`--api-url host "${apiHost}" differs from recommended "${PRODUCTION_API_HOST}"`)
  }

  const adminExposure = args["admin-exposure"]
  if (!["private", "restricted", "public"].includes(adminExposure)) {
    errors.push(`--admin-exposure must be private|restricted|public, got "${adminExposure}"`)
  } else if (adminExposure === "public") {
    errors.push("--admin-exposure public is not allowed by the production template")
  } else if (adminExposure === "restricted") {
    warnings.push(
      "--admin-exposure restricted is documented but private is the recommended production default"
    )
  }

  const paymentMode = args["payment-mode"]
  if (paymentMode !== "manual_invoice") {
    errors.push(
      `--payment-mode must be "manual_invoice" (only supported mode today), got "${paymentMode}"`
    )
  }

  const paymentDecisionStatus =
    args["payment-decision-status"] === true
      ? ""
      : args["payment-decision-status"]

  for (const [key, flag] of EVIDENCE_FLAGS) {
    const p = args[key]
    if (!p || typeof p !== "string") {
      errors.push(`${flag} is required`)
      continue
    }
    if (!fs.existsSync(p)) {
      errors.push(`${flag} file does not exist: ${p}`)
    }
  }

  // Optional CORS contract inputs (required for private_candidate_ready token trust).
  // Mirror apps/backend/src/lib/launch-cors.ts production_buyer rules (exact sets).
  const storeCors = args["store-cors"]
  const authCors = args["auth-cors"]
  const adminCors = args["admin-cors"]
  const PRODUCTION_STORE = ["https://woodright.ru", "https://www.woodright.ru"]
  const PRIVATE_QA = "http://127.0.0.1:3200"

  function parseCsv(raw) {
    return String(raw || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  }
  function isDemoOrigin(origin) {
    try {
      const h = new URL(origin).hostname.toLowerCase()
      return h === "woodright-demo.ru" || h.endsWith(".woodright-demo.ru")
    } catch {
      return false
    }
  }
  function isLoopbackOrigin(origin) {
    try {
      const h = new URL(origin).hostname.toLowerCase()
      return h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || h === "::1" || h === "[::1]"
    } catch {
      return false
    }
  }

  if (!storeCors || typeof storeCors !== "string") {
    errors.push("--store-cors is required (exact CSV origins)")
  } else {
    const origins = parseCsv(storeCors)
    if (!origins.length) errors.push("--store-cors must not be empty")
    if (origins.includes("*")) errors.push("--store-cors must not include *")
    if (origins.some(isDemoOrigin)) errors.push("--store-cors must not include demo hosts")
    const exactPublic =
      origins.length === PRODUCTION_STORE.length &&
      PRODUCTION_STORE.every((o) => origins.includes(o))
    const exactPrivateCandidate =
      origins.length === PRODUCTION_STORE.length + 1 &&
      PRODUCTION_STORE.every((o) => origins.includes(o)) &&
      origins.includes(PRIVATE_QA) &&
      origins.every((o) => PRODUCTION_STORE.includes(o) || o === PRIVATE_QA)
    if (!exactPublic && !exactPrivateCandidate) {
      errors.push(
        `--store-cors must be exactly [${PRODUCTION_STORE.join(", ")}] or the same plus ${PRIVATE_QA} for private candidate QA`
      )
    }
  }
  if (!authCors || typeof authCors !== "string") {
    errors.push("--auth-cors is required")
  } else {
    const origins = parseCsv(authCors)
    if (!origins.length) errors.push("--auth-cors must not be empty")
    if (origins.includes("*")) errors.push("--auth-cors must not include *")
    if (origins.some(isDemoOrigin)) errors.push("--auth-cors must not include demo hosts")
    for (const r of PRODUCTION_STORE) {
      if (!origins.includes(r)) errors.push(`--auth-cors missing required origin ${r}`)
    }
    for (const origin of origins) {
      if (PRODUCTION_STORE.includes(origin) || origin === PRIVATE_QA || isLoopbackOrigin(origin)) {
        continue
      }
      try {
        const h = new URL(origin).hostname.toLowerCase()
        if (h === "admin.woodright.ru" || h.endsWith(".woodright.ru")) {
          errors.push(`--auth-cors must not expose public woodright host: ${origin}`)
        } else {
          errors.push(`--auth-cors extra origin not allowed: ${origin}`)
        }
      } catch {
        errors.push(`--auth-cors origin is not a valid absolute URL: ${origin}`)
      }
    }
  }
  if (!adminCors || typeof adminCors !== "string") {
    errors.push("--admin-cors is required")
  } else {
    const origins = parseCsv(adminCors)
    if (!origins.length) errors.push("--admin-cors must not be empty")
    if (origins.includes("*")) errors.push("--admin-cors must not include *")
    if (origins.some(isDemoOrigin)) errors.push("--admin-cors must not include demo hosts")
    for (const origin of origins) {
      try {
        const url = new URL(origin)
        const h = url.hostname.toLowerCase()
        if (h === "admin.woodright.ru" || h === "woodright.ru" || h === "www.woodright.ru" || h.endsWith(".woodright.ru")) {
          errors.push(`--admin-cors must not publish public woodright host: ${origin}`)
        }
      } catch {
        errors.push(`--admin-cors origin is not a valid absolute URL: ${origin}`)
      }
    }
  }

  let allLegalApproved = false
  const legalManifestPath = args["legal-manifest"]
  if (!legalManifestPath || typeof legalManifestPath !== "string") {
    errors.push("--legal-manifest is required")
  } else if (!fs.existsSync(legalManifestPath)) {
    errors.push(`--legal-manifest file does not exist: ${legalManifestPath}`)
  } else {
    try {
      const legalStatuses = readJson(legalManifestPath)
      if (!legalStatuses || typeof legalStatuses !== "object") {
        errors.push("--legal-manifest must be a JSON object of slug -> status")
      } else {
        const missing = REQUIRED_LEGAL_SLUGS.filter((slug) => !(slug in legalStatuses))
        if (missing.length) {
          errors.push(`--legal-manifest missing slugs: ${missing.join(", ")}`)
        }
        allLegalApproved = REQUIRED_LEGAL_SLUGS.every((slug) => legalStatuses[slug] === "approved")
      }
    } catch (err) {
      errors.push(`--legal-manifest is not valid JSON: ${err.message}`)
    }
  }

  const dupPath = args["duplicate-handle-report"]
  if (dupPath && typeof dupPath === "string" && fs.existsSync(dupPath)) {
    try {
      const report = readJson(dupPath)
      if (!report || typeof report.ok !== "boolean") {
        errors.push('--duplicate-handle-report must include a boolean "ok" field')
      } else if (!report.ok) {
        errors.push("--duplicate-handle-report reports unresolved duplicate handles")
      } else if (report.published_buyer_visible_collision === true) {
        errors.push("--duplicate-handle-report: published buyer-visible collision is a blocker")
      } else if (Array.isArray(report.duplicates) && report.duplicates.length > 0) {
        errors.push("--duplicate-handle-report: duplicates[] must be empty when ok=true")
      } else if (typeof report.checked_handle !== "string" || !report.checked_handle) {
        errors.push('--duplicate-handle-report must include checked_handle')
      }
    } catch (err) {
      errors.push(`--duplicate-handle-report is not valid JSON: ${err.message}`)
    }
  }

  const routePath = args["route-config"]
  if (routePath && typeof routePath === "string" && fs.existsSync(routePath)) {
    try {
      const routes = readJson(routePath)
      if (Object.keys(routes || {}).length === 0) {
        errors.push("--route-config must not be an empty object")
      }
      if (routes.activated !== false) {
        errors.push('--route-config.activated must be explicitly false (template not live)')
      }
      if (!routes.hosts || routes.hosts.apex !== "woodright.ru" || routes.hosts.www !== "www.woodright.ru" || routes.hosts.api !== "api.woodright.ru") {
        errors.push("--route-config.hosts must set apex/www/api to woodright production hostnames")
      }
      if (routes.hosts && routes.hosts.admin) {
        errors.push("--route-config must not publish an admin host")
      }
      if (!routes.rules || routes.rules.admin_router !== "absent") {
        errors.push("--route-config.rules.admin_router must be absent")
      }
      if (routes.rules && routes.rules.demo_hosts_in_template !== false) {
        errors.push("--route-config.rules.demo_hosts_in_template must be false")
      }
      if (typeof routes.template !== "string" || !routes.template.includes("traefik-production.template.yml")) {
        errors.push("--route-config.template must point at traefik-production.template.yml")
      } else {
        const cand = [
          routes.template,
          require("path").join(process.cwd(), routes.template),
          pathResolveMaybe(routes.template),
        ]
        const tplPath = cand.find((p) => p && fs.existsSync(p))
        if (!tplPath) {
          errors.push(`--route-config.template file missing: ${routes.template}`)
        } else {
          const tpl = fs.readFileSync(tplPath, "utf8")
          if (!/Host\(`woodright\.ru`\)/.test(tpl)) errors.push("Traefik template missing apex Host rule")
          if (!/Host\(`www\.woodright\.ru`\)/.test(tpl)) errors.push("Traefik template missing www Host rule")
          if (!/Host\(`api\.woodright\.ru`\)/.test(tpl)) errors.push("Traefik template missing api Host rule")
          if (/Host\(`admin\.woodright\.ru`\)/.test(tpl)) errors.push("Traefik template must not define admin Host")
          if (/Host\(`[^`]*woodright-demo\.ru`\)/.test(tpl)) {
            errors.push("Traefik template must not define demo Host rules")
          }
          if (!/NOT ACTIVATED|not activated|not referenced by any live/i.test(tpl)) {
            warnings.push("Traefik template should clearly state it is not activated")
          }
        }
      }
    } catch (err) {
      errors.push(`--route-config is not valid JSON: ${err.message}`)
    }
  }

  const dnsPath = args["dns-snapshot"]
  if (dnsPath && typeof dnsPath === "string" && fs.existsSync(dnsPath)) {
    try {
      const dns = readJson(dnsPath)
      if (Object.keys(dns || {}).length === 0) {
        errors.push("--dns-snapshot must not be an empty object")
      }
      for (const key of ["NS", "SOA", "A", "MX", "TXT"]) {
        if (!Array.isArray(dns[key]) || dns[key].length === 0) {
          errors.push(`--dns-snapshot missing non-empty ${key} answers`)
        }
      }
      if (!dns.spf_raw || typeof dns.spf_raw !== "string") {
        errors.push("--dns-snapshot must include spf_raw")
      }
      if (dns.spf_contains_a_mechanism === true || /(?:^|\s)a(?:\s|:|$)/i.test(String(dns.spf_raw || ""))) {
        if (args["spf-a-accepted"] === true || args["spf-a-accepted"] === "true") {
          warnings.push("SPF 'a' mechanism accepted by operator flag --spf-a-accepted")
        } else if (launchMode === "public_indexable") {
          errors.push(
            "SPF contains 'a' mechanism - owner must accept (--spf-a-accepted) or replace with explicit mail IP before public_indexable"
          )
        } else {
          warnings.push(
            "SPF contains 'a' mechanism - changing apex A changes mail authorization semantics (owner decision before DNS cutover)"
          )
        }
      }
    } catch (err) {
      errors.push(`--dns-snapshot is not valid JSON: ${err.message}`)
    }
  }

  const tlsPath = args["tls-plan"]
  if (tlsPath && typeof tlsPath === "string" && fs.existsSync(tlsPath)) {
    const tls = fs.readFileSync(tlsPath, "utf8")
    if (tls.trim().length < 200) errors.push("--tls-plan content too short to be a real plan")
    for (const token of ["woodright.ru", "www.woodright.ru", "api.woodright.ru", "HTTP-01", "HSTS"]) {
      if (!tls.includes(token)) errors.push(`--tls-plan missing required token: ${token}`)
    }
    if (!/no ACME|not.*ACME|ACME.*not|planning only|NOT.*run/i.test(tls)) {
      errors.push("--tls-plan must state ACME is not executed / planning only")
    }
    if (/admin\.woodright\.ru/.test(tls) && !/no `?admin\.woodright\.ru`?/i.test(tls)) {
      warnings.push("--tls-plan mentions admin.woodright.ru - confirm it stays out of SAN scope")
    }
  }

  const rollbackPath = args["rollback-packet"]
  if (rollbackPath && typeof rollbackPath === "string" && fs.existsSync(rollbackPath)) {
    const rb = fs.readFileSync(rollbackPath, "utf8")
    if (rb.trim().length < 200) errors.push("--rollback-packet content too short")
    for (const token of ["MX", "TXT", "NS", "SPF", "rollback"]) {
      if (!new RegExp(token, "i").test(rb)) errors.push(`--rollback-packet missing required token: ${token}`)
    }
    if (!/not applied|NOT applied|must not change|preserve/i.test(rb)) {
      errors.push("--rollback-packet must state mail records are preserved / mutations not applied")
    }
  }

  if (launchMode === "public_indexable") {
    if (!allLegalApproved) {
      errors.push("public_indexable requires every legal page to be approved")
    }
    const paymentReady = evaluatePublicPaymentReady({
      paymentMode,
      paymentDecisionStatus,
    })
    if (!paymentReady.ready) {
      errors.push(
        `public_indexable requires owner-attested public-ready payment (${paymentReady.reason})`
      )
    }
  }

  const hasFatal = errors.length > 0
  let status
  if (hasFatal && launchMode === "public_indexable") {
    status = "public_launch_blocked"
  } else if (hasFatal) {
    status = "not_ready"
  } else if (launchMode === "private_noindex") {
    status = "private_candidate_ready_for_deploy_approval"
  } else {
    status = "public_indexable_ready_for_cutover_approval"
  }

  return { ok: !hasFatal, status, errors, warnings }
}

function pathResolveMaybe(p) {
  try {
    return require("path").resolve(p)
  } catch {
    return p
  }
}

function runSelfTest() {
  const os = require("os")
  const path = require("path")
  let failed = 0
  const cases = []

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wr-launch-readiness-"))
  const write = (name, contents) => {
    const p = path.join(dir, name)
    fs.writeFileSync(p, contents)
    return p
  }

  const tplSrc = path.join(
    process.cwd(),
    "ops/config/public-launch/traefik-production.template.yml"
  )
  const tplCopy = write(
    "traefik-production.template.yml",
    fs.existsSync(tplSrc)
      ? fs.readFileSync(tplSrc, "utf8")
      : [
          "# NOT ACTIVATED",
          "http:",
          "  routers:",
          "    a:",
          "      rule: \"Host(`woodright.ru`)\"",
          "    b:",
          "      rule: \"Host(`www.woodright.ru`)\"",
          "    c:",
          "      rule: \"Host(`api.woodright.ru`)\"",
        ].join("\n")
  )

  const goodEvidence = {
    "duplicate-handle-report": write(
      "dup.json",
      JSON.stringify({
        ok: true,
        checked_handle: "a-07-1",
        published_buyer_visible_collision: false,
        duplicates: [],
      })
    ),
    "route-config": write(
      "routes.json",
      JSON.stringify({
        template: tplCopy,
        activated: false,
        hosts: {
          apex: "woodright.ru",
          www: "www.woodright.ru",
          api: "api.woodright.ru",
          admin: null,
        },
        rules: {
          admin_router: "absent",
          demo_hosts_in_template: false,
        },
      })
    ),
    "dns-snapshot": write(
      "dns.json",
      JSON.stringify({
        NS: ["ns1.itb-host.ru."],
        SOA: ["soa"],
        A: ["79.133.175.43"],
        MX: ["10 mx.yandex.net."],
        TXT: ["v=spf1 ip4:79.133.175.238 a mx ~all"],
        spf_raw: "v=spf1 ip4:79.133.175.238 a mx ~all",
        spf_contains_a_mechanism: true,
      })
    ),
    "tls-plan": write(
      "tls-plan.md",
      [
        "# TLS plan - planning only",
        "Status: planning only. No ACME run has been executed.",
        "Hosts: woodright.ru, www.woodright.ru, api.woodright.ru",
        "Challenge: HTTP-01",
        "HSTS: no preload until HTTPS proven stable",
        "No admin.woodright.ru in SAN scope",
      ].join("\n")
    ),
    "rollback-packet": write(
      "rollback.md",
      [
        "# DNS rollback packet for Woodright public launch",
        "Preserve MX, TXT, and NS records unchanged during any web cutover.",
        "SPF a mechanism warning - apex A change alters mail authorization semantics.",
        "Proposed web mutations for apex/www/api are documented and NOT applied.",
        "Rollback restores pre-cutover A/AAAA answers for apex/www/api only.",
        "Do not touch mail.woodright.ru MX peers or Yandex MX during rollback.",
      ].join("\n")
    ),
  }

  const draftLegal = write(
    "legal-draft.json",
    JSON.stringify({
      privacy: "missing_owner_input",
      terms: "draft",
      delivery: "missing_owner_input",
      payment: "draft",
      returns: "missing_owner_input",
    })
  )
  const approvedLegal = write(
    "legal-approved.json",
    JSON.stringify({
      privacy: "approved",
      terms: "approved",
      delivery: "approved",
      payment: "approved",
      returns: "approved",
    })
  )

  const corsArgs = {
    "store-cors": "https://woodright.ru,https://www.woodright.ru,http://127.0.0.1:3200",
    "auth-cors": "https://woodright.ru,https://www.woodright.ru,http://127.0.0.1:3200",
    "admin-cors": "http://127.0.0.1:9200,http://127.0.0.1:5173",
  }

  const baseArgs = {
    environment: "production",
    "site-url": "https://woodright.ru",
    "api-url": "https://api.woodright.ru",
    "admin-exposure": "private",
    "payment-mode": "manual_invoice",
    ...goodEvidence,
    ...corsArgs,
  }

  {
    const r = evaluate({ ...baseArgs, "launch-mode": "private_noindex", "legal-manifest": draftLegal })
    cases.push([
      "private_noindex + draft legal + all technical checks pass -> ready for deploy approval",
      r.ok === true && r.status === "private_candidate_ready_for_deploy_approval",
      r.errors,
    ])
  }

  {
    const r = evaluate({ ...baseArgs, "launch-mode": "public_indexable", "legal-manifest": draftLegal })
    cases.push([
      "public_indexable + draft legal -> public_launch_blocked",
      r.ok === false && r.status === "public_launch_blocked",
    ])
  }

  {
    const r = evaluate({
      ...baseArgs,
      "launch-mode": "public_indexable",
      "legal-manifest": approvedLegal,
      "payment-decision-status": "pending",
    })
    cases.push([
      "public_indexable + approved legal + pending payment decision -> still blocked",
      r.ok === false && r.status === "public_launch_blocked",
    ])
  }

  {
    const r = evaluate({
      ...baseArgs,
      "launch-mode": "public_indexable",
      "legal-manifest": approvedLegal,
      "payment-decision-status": "accepted",
    })
    cases.push([
      "public_indexable + bare accepted (not accepted_manual) -> blocked",
      r.ok === false && r.status === "public_launch_blocked",
    ])
  }

  {
    const r = evaluate({
      ...baseArgs,
      "launch-mode": "public_indexable",
      "legal-manifest": approvedLegal,
      "payment-decision-status": "accepted_manual",
      "spf-a-accepted": true,
    })
    cases.push([
      "public_indexable + approved legal + accepted_manual -> cutover approval token",
      r.ok === true && r.status === "public_indexable_ready_for_cutover_approval",
      r.errors,
    ])
  }

  {
    const r = evaluate({
      ...baseArgs,
      "launch-mode": "private_noindex",
      "legal-manifest": draftLegal,
      "payment-decision-status": "pending",
    })
    cases.push([
      "private_noindex tolerates pending payment decision",
      r.ok === true && r.status === "private_candidate_ready_for_deploy_approval",
      r.errors,
    ])
  }

  {
    const r = evaluate({ environment: "public_demo" })
    cases.push(["public_demo is rejected, never treated as production", r.status === "not_ready"])
  }

  {
    const r = evaluate({})
    cases.push(["missing --environment fails closed", r.status === "not_ready"])
  }

  {
    const r = evaluate({
      ...baseArgs,
      "launch-mode": "private_noindex",
      "legal-manifest": draftLegal,
      "site-url": "https://woodright-demo.ru",
    })
    cases.push(["demo site-url is rejected even for private_noindex", r.ok === false])
  }

  {
    const missingEvidence = { ...baseArgs }
    delete missingEvidence["dns-snapshot"]
    const r = evaluate({ ...missingEvidence, "launch-mode": "private_noindex", "legal-manifest": draftLegal })
    cases.push(["missing dns-snapshot fails closed", r.ok === false])
  }

  {
    const r = evaluate({
      ...baseArgs,
      "launch-mode": "private_noindex",
      "legal-manifest": draftLegal,
      "dns-snapshot": write("empty-dns.json", "{}"),
    })
    cases.push(["empty dns-snapshot fails closed", r.ok === false])
  }

  {
    const r = evaluate({
      ...baseArgs,
      "launch-mode": "private_noindex",
      "legal-manifest": draftLegal,
      "store-cors": "http://127.0.0.1:3200",
    })
    cases.push(["loopback-only store-cors fails closed", r.ok === false])
  }

  {
    const r = evaluate({
      ...baseArgs,
      "launch-mode": "private_noindex",
      "legal-manifest": draftLegal,
      "auth-cors": "https://woodright.ru,https://www.woodright.ru",
      "admin-cors": "https://admin.woodright.ru",
    })
    cases.push(["public admin cors fails closed", r.ok === false])
  }

  for (const [name, pass, detail] of cases) {
    console.log(`${pass ? "PASS" : "FAIL"} ${name}`)
    if (!pass) {
      failed++
      if (detail) console.log("  errors:", detail)
    }
  }
  process.exit(failed ? 1 : 0)
}

function main() {
  if (process.argv[2] === "--self-test") {
    runSelfTest()
    return
  }
  const args = parseArgs(process.argv.slice(2))
  const { ok, status, errors, warnings } = evaluate(args)
  for (const w of warnings) console.log(`WARNING ${w}`)
  for (const e of errors) console.log(`ERROR ${e}`)
  console.log(`STATUS ${status}`)
  process.exit(ok ? 0 : 1)
}

if (require.main === module) main()

module.exports = { evaluate }
