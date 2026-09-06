/**
 * Server-only runtime identity headers for storefront responses.
 * Uses WOODRIGHT_* env (not NEXT_PUBLIC_*) so values are not baked for the browser bundle.
 * Never copy identity from inbound request headers.
 */
const ALLOWED_ROLES = new Set([
  "public_demo",
  "non_public_candidate",
  "production_candidate",
])

const ALLOWED_EXPOSURES = new Set(["public", "private"])

const ALLOWED_DB_ALIASES = new Set([
  "public_demo_db",
  "non_public_candidate_db",
])

const SHA40 = /^[0-9a-f]{40}$/

function normalizeRole(role: string): string {
  if (role === "production_candidate") return "non_public_candidate"
  return role
}

function readSha40(raw: string | undefined): string {
  const value = (raw || "").trim()
  return SHA40.test(value) ? value : ""
}

/**
 * WOODRIGHT_RELEASE_SHA is last-unified-pair informational only.
 * Split pairs (backend SHA != storefront SHA) must not emit a global SHA header.
 */
export function selectUnifiedReleaseSha(input: {
  backendSha: string
  storefrontSha: string
  releaseSha: string
}): string {
  const releaseSha = readSha40(input.releaseSha)
  if (!releaseSha) return ""
  const backendSha = readSha40(input.backendSha)
  const storefrontSha = readSha40(input.storefrontSha)
  if (backendSha && storefrontSha) {
    return backendSha === storefrontSha && backendSha === releaseSha ? releaseSha : ""
  }
  if (!backendSha && !storefrontSha) return releaseSha
  return ""
}

function readDbIdentityAlias(env: NodeJS.ProcessEnv): string {
  const primary = (env.WOODRIGHT_DATABASE_IDENTITY || "").trim()
  const legacy = (env.WOODRIGHT_DATABASE_IDENTITY_ALIAS || "").trim()
  const raw = primary || legacy
  return ALLOWED_DB_ALIASES.has(raw) ? raw : ""
}

export function storefrontRuntimeIdentityHeaders(
  env: NodeJS.ProcessEnv = process.env
): Record<string, string> {
  const roleRaw = (env.WOODRIGHT_RUNTIME_ROLE || "").trim()
  const role = normalizeRole(roleRaw)
  const exposure = (env.WOODRIGHT_EXPOSURE || "").trim()
  const backendSha = readSha40(env.WOODRIGHT_BACKEND_SOURCE_SHA)
  const storefrontSha = readSha40(env.WOODRIGHT_STOREFRONT_SOURCE_SHA)
  const releaseSha = selectUnifiedReleaseSha({
    backendSha,
    storefrontSha,
    releaseSha: env.WOODRIGHT_RELEASE_SHA || "",
  })
  const dbAlias = readDbIdentityAlias(env)
  const out: Record<string, string> = {}
  if (ALLOWED_ROLES.has(roleRaw) || ALLOWED_ROLES.has(role)) {
    out["x-woodright-runtime-role"] = role
  }
  if (ALLOWED_EXPOSURES.has(exposure)) {
    out["x-woodright-exposure"] = exposure
  }
  if (backendSha) out["x-woodright-backend-source-sha"] = backendSha
  if (storefrontSha) out["x-woodright-storefront-source-sha"] = storefrontSha
  if (releaseSha) out["x-woodright-release-sha"] = releaseSha
  if (dbAlias) {
    out["x-woodright-database-identity"] = dbAlias
  }
  return out
}
