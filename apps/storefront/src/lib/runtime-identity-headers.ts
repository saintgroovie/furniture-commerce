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

function normalizeRole(role: string): string {
  if (role === "production_candidate") return "non_public_candidate"
  return role
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
  const releaseSha = (env.WOODRIGHT_RELEASE_SHA || "").trim()
  const dbAlias = readDbIdentityAlias(env)
  const out: Record<string, string> = {}
  if (ALLOWED_ROLES.has(roleRaw) || ALLOWED_ROLES.has(role)) {
    out["x-woodright-runtime-role"] = role
  }
  if (ALLOWED_EXPOSURES.has(exposure)) {
    out["x-woodright-exposure"] = exposure
  }
  if (/^[0-9a-f]{40}$/.test(releaseSha)) {
    out["x-woodright-release-sha"] = releaseSha
  }
  if (dbAlias) {
    out["x-woodright-database-identity"] = dbAlias
  }
  return out
}
