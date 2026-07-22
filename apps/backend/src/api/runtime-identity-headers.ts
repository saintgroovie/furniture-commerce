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
  const releaseSha = (env.WOODRIGHT_RELEASE_SHA || "").trim()
  const dbAlias = readDbIdentityAlias(env)

  const role = normalizeRole(roleRaw)
  return {
    role: ALLOWED_ROLES.has(roleRaw) || ALLOWED_ROLES.has(role) ? role : "",
    exposure: ALLOWED_EXPOSURES.has(exposure) ? exposure : "",
    releaseSha: /^[0-9a-f]{40}$/.test(releaseSha) ? releaseSha : "",
    dbAlias,
  }
}

export function applyRuntimeIdentityHeaders(
  res: MedusaResponse,
  env: NodeJS.ProcessEnv = process.env
) {
  const id = readRuntimeIdentityFromEnv(env)
  if (id.role) res.setHeader("x-woodright-runtime-role", id.role)
  if (id.exposure) res.setHeader("x-woodright-exposure", id.exposure)
  if (id.releaseSha) res.setHeader("x-woodright-release-sha", id.releaseSha)
  if (id.dbAlias) res.setHeader("x-woodright-database-identity", id.dbAlias)
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
