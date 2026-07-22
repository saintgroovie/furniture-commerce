/**
 * Server-only runtime identity headers for storefront responses.
 * Uses WOODRIGHT_* env (not NEXT_PUBLIC_*) so values are not baked for the browser bundle.
 */
const ALLOWED_ROLES = new Set([
  "public_demo",
  "non_public_candidate",
  "production_candidate",
])

const ALLOWED_EXPOSURES = new Set(["public", "private"])

function normalizeRole(role: string): string {
  if (role === "production_candidate") return "non_public_candidate"
  return role
}

export function storefrontRuntimeIdentityHeaders(
  env: NodeJS.ProcessEnv = process.env
): Record<string, string> {
  const roleRaw = (env.WOODRIGHT_RUNTIME_ROLE || "").trim()
  const role = normalizeRole(roleRaw)
  const exposure = (env.WOODRIGHT_EXPOSURE || "").trim()
  const releaseSha = (env.WOODRIGHT_RELEASE_SHA || "").trim()
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
  return out
}
