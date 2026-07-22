/**
 * Woodright runtime identity helpers (fail-closed public evidence).
 * No secrets; URL classification + schema validation only.
 */
const SECRET_KEY_RE =
  /(password|secret|token|credential|authorization|private_key|api_key|database_url|dsn|cookie)/i

const RUNTIME_ROLES = new Set([
  "public_demo",
  "non_public_candidate",
  // legacy alias accepted in STACKS.json only; ACTIVE_PUBLIC must use canonical roles
  "production_candidate",
])

const EXPOSURES = new Set(["public", "private"])

const EVIDENCE_CLASSES = new Set([
  "public_domain_evidence",
  "public_origin_evidence",
  "candidate_evidence",
  "local_dev_evidence",
  "invalid_public_evidence",
])

const SCHEMA_VERSION = "1"

const PUBLIC_CANONICAL_HOSTS = new Set([
  "woodright-demo.ru",
  "www.woodright-demo.ru",
  "api.woodright-demo.ru",
])

function hostnameOf(rawUrl) {
  try {
    return new URL(rawUrl).hostname.toLowerCase()
  } catch {
    return ""
  }
}

function portOf(rawUrl) {
  try {
    const u = new URL(rawUrl)
    if (u.port) return u.port
    return u.protocol === "https:" ? "443" : u.protocol === "http:" ? "80" : ""
  } catch {
    return ""
  }
}

/**
 * Classify a request URL for evidence packets / verifiers.
 * @returns {{ class: string, ok_for_public: boolean, reasons: string[] }}
 */
function classifyEvidenceUrl(rawUrl) {
  const reasons = []
  const input = String(rawUrl || "").trim()
  if (!input) {
    return {
      class: "invalid_public_evidence",
      ok_for_public: false,
      reasons: ["empty_url"],
    }
  }
  let u
  try {
    u = new URL(input)
  } catch {
    return {
      class: "invalid_public_evidence",
      ok_for_public: false,
      reasons: ["unparseable_url"],
    }
  }
  const host = u.hostname.toLowerCase()
  const port = u.port || (u.protocol === "https:" ? "443" : "80")

  if (host === "127.0.0.1" || host === "localhost" || host === "::1") {
    reasons.push("loopback_host")
    if (port === "9200" || port === "3200" || port === "5433") {
      reasons.push("candidate_local_port")
      return {
        class: "invalid_public_evidence",
        ok_for_public: false,
        reasons,
      }
    }
    return {
      class: "local_dev_evidence",
      ok_for_public: false,
      reasons,
    }
  }

  if (port === "9200") {
    reasons.push("port_9200_forbidden_as_public")
    return {
      class: "invalid_public_evidence",
      ok_for_public: false,
      reasons,
    }
  }

  // Bare IPv4/IPv6 public evidence is rejected (must use canonical domain)
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) {
    reasons.push("ip_literal_not_canonical_domain")
    return {
      class: "invalid_public_evidence",
      ok_for_public: false,
      reasons,
    }
  }

  if (PUBLIC_CANONICAL_HOSTS.has(host)) {
    if (u.protocol !== "https:") {
      reasons.push("public_evidence_requires_https")
      return {
        class: "invalid_public_evidence",
        ok_for_public: false,
        reasons,
      }
    }
    return {
      class:
        host === "api.woodright-demo.ru"
          ? "public_origin_evidence"
          : "public_domain_evidence",
      ok_for_public: true,
      reasons: ["canonical_public_host"],
    }
  }

  reasons.push("non_canonical_host")
  return {
    class: "candidate_evidence",
    ok_for_public: false,
    reasons,
  }
}

function assertNoSecrets(obj, path = "$") {
  const errors = []
  if (obj == null || typeof obj !== "object") return errors
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => errors.push(...assertNoSecrets(v, `${path}[${i}]`)))
    return errors
  }
  for (const [k, v] of Object.entries(obj)) {
    const p = `${path}.${k}`
    if (SECRET_KEY_RE.test(k)) {
      errors.push(`secret_key_forbidden:${p}`)
      continue
    }
    if (typeof v === "string" && SECRET_KEY_RE.test(v) && /:\/\//.test(v)) {
      errors.push(`secret_value_forbidden:${p}`)
    }
    if (v && typeof v === "object") errors.push(...assertNoSecrets(v, p))
  }
  return errors
}

/**
 * Validate runtime identity document (ACTIVE_PUBLIC / candidate JSON).
 */
function validateRuntimeIdentityDoc(doc, { expectRole } = {}) {
  const errors = []
  if (!doc || typeof doc !== "object") {
    return { ok: false, errors: ["doc_required"] }
  }
  if (doc.schema_version !== SCHEMA_VERSION && doc.schema_version !== 1) {
    errors.push("schema_version_invalid")
  }
  if (!RUNTIME_ROLES.has(doc.runtime_role)) errors.push("runtime_role_invalid")
  if (expectRole && doc.runtime_role !== expectRole) {
    errors.push(`runtime_role_expected_${expectRole}`)
  }
  if (!EXPOSURES.has(doc.exposure)) errors.push("exposure_invalid")
  if (doc.runtime_role === "public_demo" && doc.exposure !== "public") {
    errors.push("public_demo_must_expose_public")
  }
  if (
    (doc.runtime_role === "non_public_candidate" ||
      doc.runtime_role === "production_candidate") &&
    doc.exposure !== "private"
  ) {
    errors.push("candidate_must_expose_private")
  }
  if (doc.runtime_role === "public_demo") {
    if (doc.canonical_domain !== "woodright-demo.ru") {
      errors.push("public_canonical_domain_required")
    }
    let apiHost = ""
    try {
      const api = new URL(String(doc.canonical_api_origin || ""))
      apiHost = api.hostname.toLowerCase()
      if (api.protocol !== "https:") errors.push("public_canonical_api_origin_must_be_https")
    } catch {
      errors.push("public_canonical_api_origin_unparseable")
    }
    if (apiHost !== "api.woodright-demo.ru") {
      errors.push("public_canonical_api_origin_required")
    }
  }
  if (
    doc.runtime_role === "non_public_candidate" ||
    doc.runtime_role === "production_candidate"
  ) {
    if (doc.canonical_domain && doc.canonical_domain !== "none") {
      errors.push("candidate_canonical_domain_must_be_none")
    }
  }
  if (doc.deprecated === true && !doc.superseded_by) {
    errors.push("deprecated_requires_superseded_by")
  }
  if (doc.deprecated === true) {
    errors.push("deprecated_identity_not_current")
  }
  errors.push(...assertNoSecrets(doc))
  return { ok: errors.length === 0, errors }
}

function normalizeLegacyRole(role) {
  if (role === "production_candidate") return "non_public_candidate"
  return role
}

function buildIdentityHeadersFromEnv(env = process.env) {
  const role = normalizeLegacyRole(env.WOODRIGHT_RUNTIME_ROLE || "")
  const exposure = env.WOODRIGHT_EXPOSURE || ""
  const sha = env.WOODRIGHT_RELEASE_SHA || ""
  const dbAlias =
    env.WOODRIGHT_DATABASE_IDENTITY || env.WOODRIGHT_DATABASE_IDENTITY_ALIAS || ""
  const headers = {}
  if (role) headers["x-woodright-runtime-role"] = role
  if (exposure) headers["x-woodright-exposure"] = exposure
  if (sha) headers["x-woodright-release-sha"] = sha
  if (dbAlias) headers["x-woodright-database-identity"] = dbAlias
  return headers
}

/** Surface BE/SF release mismatch for operators (not a hard schema error alone). */
function releasePairMismatchWarning(identity) {
  if (!identity) return null
  const be = identity.backend_revision || identity.release_sha
  const sf = identity.storefront_revision || identity.release_sha
  if (be && sf && be !== sf) {
    return {
      warning: "backend_storefront_release_mismatch",
      backend_revision: be,
      storefront_revision: sf,
    }
  }
  return null
}

function evaluatePublicHeaders(headers, expected = {}) {
  const h = Object.fromEntries(
    Object.entries(headers || {}).map(([k, v]) => [String(k).toLowerCase(), String(v)])
  )
  const errors = []
  const role = h["x-woodright-runtime-role"]
  const exposure = h["x-woodright-exposure"]
  if (!role) errors.push("missing_runtime_role_header")
  else if (role !== "public_demo") errors.push("role_not_public_demo")
  if (!exposure) errors.push("missing_exposure_header")
  else if (exposure !== "public") errors.push("exposure_not_public")
  if (expected.release_sha) {
    const sha = h["x-woodright-release-sha"]
    if (!sha) errors.push("missing_release_sha_header")
    else if (sha !== expected.release_sha) errors.push("release_sha_mismatch")
  }
  if (expected.database_identity_alias) {
    const db = h["x-woodright-database-identity"]
    if (!db) errors.push("missing_database_identity_header")
    else if (db !== expected.database_identity_alias) {
      errors.push("database_identity_mismatch")
    }
  }
  if (role === "non_public_candidate" || exposure === "private") {
    errors.push("private_candidate_headers")
  }
  return { ok: errors.length === 0, errors, headers: h }
}

function evaluateCandidateHeaders(headers, expected = {}) {
  const h = Object.fromEntries(
    Object.entries(headers || {}).map(([k, v]) => [String(k).toLowerCase(), String(v)])
  )
  const errors = []
  const role = normalizeLegacyRole(h["x-woodright-runtime-role"] || "")
  const exposure = h["x-woodright-exposure"]
  if (!role) errors.push("missing_runtime_role_header")
  else if (role !== "non_public_candidate") errors.push("role_not_non_public_candidate")
  if (!exposure) errors.push("missing_exposure_header")
  else if (exposure !== "private") errors.push("exposure_not_private")
  if (role === "public_demo" || exposure === "public") {
    errors.push("public_role_rejected_for_candidate")
  }
  if (expected.release_sha) {
    const sha = h["x-woodright-release-sha"]
    if (!sha) errors.push("missing_release_sha_header")
    else if (sha !== expected.release_sha) errors.push("release_sha_mismatch")
  }
  return { ok: errors.length === 0, errors, headers: h }
}

function digestsMatch(active, expected) {
  const errors = []
  if (expected.backend_image_digest && active.backend_image_digest !== expected.backend_image_digest) {
    errors.push("backend_digest_mismatch")
  }
  if (
    expected.storefront_image_digest &&
    active.storefront_image_digest !== expected.storefront_image_digest
  ) {
    errors.push("storefront_digest_mismatch")
  }
  return { ok: errors.length === 0, errors }
}

function sameRuntimeForPricingCompare(a, b) {
  if (!a || !b) return { ok: false, warning: "missing_runtime_identity" }
  const ra = normalizeLegacyRole(a.runtime_role)
  const rb = normalizeLegacyRole(b.runtime_role)
  if (ra !== rb) {
    return {
      ok: false,
      warning: "cross_stack_price_compare_role_mismatch",
      roles: [ra, rb],
    }
  }
  if (a.exposure !== b.exposure) {
    return {
      ok: false,
      warning: "cross_stack_price_compare_exposure_mismatch",
    }
  }
  if (
    a.database_identity_alias &&
    b.database_identity_alias &&
    a.database_identity_alias !== b.database_identity_alias
  ) {
    return {
      ok: false,
      warning: "cross_stack_price_compare_db_mismatch",
    }
  }
  return { ok: true }
}

module.exports = {
  SCHEMA_VERSION,
  RUNTIME_ROLES,
  EXPOSURES,
  EVIDENCE_CLASSES,
  PUBLIC_CANONICAL_HOSTS,
  SECRET_KEY_RE,
  hostnameOf,
  portOf,
  classifyEvidenceUrl,
  assertNoSecrets,
  validateRuntimeIdentityDoc,
  normalizeLegacyRole,
  buildIdentityHeadersFromEnv,
  evaluatePublicHeaders,
  evaluateCandidateHeaders,
  digestsMatch,
  sameRuntimeForPricingCompare,
  releasePairMismatchWarning,
}
