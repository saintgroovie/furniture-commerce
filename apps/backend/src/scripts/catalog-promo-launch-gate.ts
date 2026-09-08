/**
 * Fail-closed gate for the catalog promo launch bootstrap. Pure - no I/O.
 *
 *   CATALOG_PROMO_TARGET=local|staging|production
 *   CATALOG_PROMO_MODE=dry-run|apply
 *   DATABASE_URL db name must match target:
 *     staging    → woodright_staging
 *     production → woodright_production
 *     local      → anything except the two above
 *   production apply additionally requires:
 *     CATALOG_PROMO_CONFIRM=CATALOG_PROMO_LAUNCH_V1_PRODUCTION_OWNER_APPROVED
 *     CATALOG_PROMO_PRODUCTION_ACK=I_UNDERSTAND_THIS_WRITES_PRODUCTION
 */
import {
  CATALOG_PROMO_MANIFEST_ID,
  CATALOG_PROMO_MANIFEST_SHA_EXPECTED,
  computeCatalogPromoManifestSha,
  validateCatalogPromoManifest,
} from "./catalog-promo-launch-manifest"
import { parseDatabaseUrl } from "./seed-rooms-v1-target-gate"

export const CATALOG_PROMO_CONFIRM_EXPECTED =
  "CATALOG_PROMO_LAUNCH_V1_PRODUCTION_OWNER_APPROVED" as const
export const CATALOG_PROMO_PRODUCTION_ACK_EXPECTED =
  "I_UNDERSTAND_THIS_WRITES_PRODUCTION" as const

export type CatalogPromoTarget = "local" | "staging" | "production"
export type CatalogPromoMode = "dry-run" | "apply"

export type CatalogPromoGateOk = {
  ok: true
  target: CatalogPromoTarget
  mode: CatalogPromoMode
  apply: boolean
  dbName: string
  hostname: string
  manifestId: typeof CATALOG_PROMO_MANIFEST_ID
  manifestSha: string
}
export type CatalogPromoGateFail = { ok: false; code: string; message: string }
export type CatalogPromoGateResult = CatalogPromoGateOk | CatalogPromoGateFail

function fail(code: string, message: string): CatalogPromoGateFail {
  return { ok: false, code, message: `FAIL_CLOSED: ${message}` }
}

function envRaw(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const v = env[key]
  return v === undefined ? undefined : String(v)
}

export function assertCatalogPromoGate(
  input: { env?: NodeJS.ProcessEnv; databaseUrl?: string | null } = {}
): CatalogPromoGateResult {
  const env = input.env ?? process.env

  const manifestSha = computeCatalogPromoManifestSha()
  if (manifestSha !== CATALOG_PROMO_MANIFEST_SHA_EXPECTED) {
    return fail("manifest_sha_mismatch", `manifest SHA mismatch (got ${manifestSha})`)
  }
  const manifest = validateCatalogPromoManifest()
  if (!manifest.ok) return fail("manifest_invalid", manifest.message)

  const target = envRaw(env, "CATALOG_PROMO_TARGET")
  const mode = envRaw(env, "CATALOG_PROMO_MODE")
  if (!target) return fail("missing_target", "CATALOG_PROMO_TARGET is required")
  if (target !== "local" && target !== "staging" && target !== "production") {
    return fail("unknown_target", `unknown CATALOG_PROMO_TARGET "${target}"`)
  }
  if (!mode) return fail("missing_mode", "CATALOG_PROMO_MODE is required")
  if (mode !== "dry-run" && mode !== "apply") {
    return fail("unknown_mode", `unknown CATALOG_PROMO_MODE "${mode}"`)
  }

  const databaseUrl =
    input.databaseUrl !== undefined ? input.databaseUrl : envRaw(env, "DATABASE_URL")
  if (databaseUrl == null || databaseUrl === "") {
    return fail("missing_database_url", "DATABASE_URL is required")
  }
  const parsed = parseDatabaseUrl(databaseUrl)
  if (!parsed.ok) return fail(parsed.code, parsed.message)

  if (target === "staging" && parsed.dbName !== "woodright_staging") {
    return fail("db_target_mismatch", `staging requires db woodright_staging (got ${parsed.dbName})`)
  }
  if (target === "production" && parsed.dbName !== "woodright_production") {
    return fail(
      "db_target_mismatch",
      `production requires db woodright_production (got ${parsed.dbName})`
    )
  }
  if (
    target === "local" &&
    (parsed.dbName === "woodright_staging" || parsed.dbName === "woodright_production")
  ) {
    return fail("db_target_mismatch", `local target must not point at ${parsed.dbName}`)
  }

  if (target === "production" && mode === "apply") {
    if (envRaw(env, "CATALOG_PROMO_CONFIRM") !== CATALOG_PROMO_CONFIRM_EXPECTED) {
      return fail("missing_production_confirm", "CATALOG_PROMO_CONFIRM token is required")
    }
    if (
      envRaw(env, "CATALOG_PROMO_PRODUCTION_ACK") !== CATALOG_PROMO_PRODUCTION_ACK_EXPECTED
    ) {
      return fail("missing_production_ack", "CATALOG_PROMO_PRODUCTION_ACK is required")
    }
  }

  return {
    ok: true,
    target,
    mode,
    apply: mode === "apply",
    dbName: parsed.dbName,
    hostname: parsed.hostname,
    manifestId: CATALOG_PROMO_MANIFEST_ID,
    manifestSha,
  }
}
