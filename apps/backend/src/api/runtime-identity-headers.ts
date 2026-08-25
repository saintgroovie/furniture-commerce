/**
 * Env-driven Woodright runtime identity response headers.
 * Never emit secrets / DSN / host credentials.
 * Values come only from server env — never from request headers.
 */
import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

const ALLOWED_ROLES = new Set([
  "public_demo",
  "non_public_candidate",
  "production_candidate",
  "public_production",
])

const ALLOWED_EXPOSURES = new Set(["public", "private"])

const ALLOWED_DB_ALIASES = new Set([
  "public_demo_db",
  "non_public_candidate_db",
  "public_production_db",
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
 * Emit x-woodright-release-sha when:
 *   - both component SHAs are present, equal, and equal the global SHA, or
 *   - legacy: neither component SHA is set and the global SHA is valid.
 * A split pair (backend SHA != storefront SHA) must not advertise one global SHA.
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

/** Prefer WOODRIGHT_DATABASE_IDENTITY; accept legacy *_ALIAS. */
export function readDbIdentityAlias(env: NodeJS.ProcessEnv = process.env): string {
  const primary = (env.WOODRIGHT_DATABASE_IDENTITY || "").trim()
  const legacy = (env.WOODRIGHT_DATABASE_IDENTITY_ALIAS || "").trim()
  const raw = primary || legacy
  return ALLOWED_DB_ALIASES.has(raw) ? raw : ""
}

export function readRuntimeIdentityFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const roleRaw = (env.WOODRIGHT_RUNTIME_ROLE || "").trim()
  const exposure = (env.WOODRIGHT_EXPOSURE || "").trim()
  const backendSha = readSha40(env.WOODRIGHT_BACKEND_SOURCE_SHA)
  const storefrontSha = readSha40(env.WOODRIGHT_STOREFRONT_SOURCE_SHA)
  const releaseSha = selectUnifiedReleaseSha({
    backendSha,
    storefrontSha,
    releaseSha: env.WOODRIGHT_RELEASE_SHA || "",
  })
  const dbAlias = readDbIdentityAlias(env)

  const role = normalizeRole(roleRaw)
  return {
    role: ALLOWED_ROLES.has(roleRaw) || ALLOWED_ROLES.has(role) ? role : "",
    exposure: ALLOWED_EXPOSURES.has(exposure) ? exposure : "",
    backendSha,
    storefrontSha,
    releaseSha,
    dbAlias,
  }
}

export function runtimeIdentityHeaderMap(
  env: NodeJS.ProcessEnv = process.env
): Record<string, string> {
  const id = readRuntimeIdentityFromEnv(env)
  const out: Record<string, string> = {}
  if (id.role) out["x-woodright-runtime-role"] = id.role
  if (id.exposure) out["x-woodright-exposure"] = id.exposure
  if (id.backendSha) out["x-woodright-backend-source-sha"] = id.backendSha
  if (id.storefrontSha) out["x-woodright-storefront-source-sha"] = id.storefrontSha
  if (id.releaseSha) out["x-woodright-release-sha"] = id.releaseSha
  if (id.dbAlias) out["x-woodright-database-identity"] = id.dbAlias
  return out
}

export function applyRuntimeIdentityHeaders(
  res: MedusaResponse,
  env: NodeJS.ProcessEnv = process.env
) {
  for (const [name, value] of Object.entries(runtimeIdentityHeaderMap(env))) {
    res.setHeader(name, value)
  }
}

export async function attachRuntimeIdentityHeaders(
  _req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  // Intentionally ignore request headers — identity is server env only.
  applyRuntimeIdentityHeaders(res)
  next()
}
