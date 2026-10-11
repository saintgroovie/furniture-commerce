/**
 * Fail-closed gate for the editorial description importer. Pure - no I/O.
 *
 *   EDITORIAL_COPY_TARGET=local|staging|production
 *   EDITORIAL_COPY_MODE=dry-run|apply|rollback-dry-run|rollback
 *   DATABASE_URL db name (parsed path segment, exact, case-sensitive) must match target:
 *     staging    -> woodright_staging
 *     production -> woodright_public_production
 *     local      -> any other name, on localhost / 127.0.0.1 / ::1
 *   apply and rollback require EDITORIAL_COPY_INPUT_SHA = canonical SHA-256 of the input file.
 *   production (every mode, dry-run included) additionally requires:
 *     EDITORIAL_COPY_CONFIRM=EDITORIAL_COPY_V1_PRODUCTION_OWNER_APPROVED
 *     EDITORIAL_COPY_PRODUCTION_ACK=I_UNDERSTAND_THIS_WRITES_PRODUCTION
 *     WOODRIGHT_RUNTIME_ROLE=public_production
 *     WOODRIGHT_DATABASE_IDENTITY and/or WOODRIGHT_DATABASE_IDENTITY_ALIAS=public_production_db
 *       (every non-empty one must match; at least one must be set)
 *     no libpq connection env (PGHOST, PGHOSTADDR, PGDATABASE, PGSERVICE, PGSERVICEFILE, PGOPTIONS)
 *
 * Production means the public buyer-facing runtime only. Its identity is defined in
 * `ops/config/runtime-environments/public_production.conf`: role `public_production`, alias
 * `public_production_db`, physical database `woodright_public_production`. The runtime identity
 * env is the same one the backend container exposes as `x-woodright-*` headers, so the importer
 * has to run inside that runtime (`medusa exec` in the backend container).
 *
 * `woodright_production` is the private PRODUCTION_CANDIDATE database
 * (`ops/config/runtime-environments/production.conf`, alias `non_public_candidate_db`), not public
 * production; it is refused for every target. `woodright_public_production` is refused for every
 * target except production.
 *
 * Query parameters that can redirect the connection (`host`, `dbname`, `options`, ...) and
 * multi-host / socket-path hosts are refused; only `sslmode`, `application_name`,
 * `connect_timeout` are allowed.
 */
import { parseDatabaseUrl } from "./seed-rooms-v1-target-gate"

export const EDITORIAL_COPY_CONFIRM_EXPECTED = "EDITORIAL_COPY_V1_PRODUCTION_OWNER_APPROVED" as const
export const EDITORIAL_COPY_PRODUCTION_ACK_EXPECTED = "I_UNDERSTAND_THIS_WRITES_PRODUCTION" as const
export const EDITORIAL_COPY_PRODUCTION_DB = "woodright_public_production" as const
export const EDITORIAL_COPY_PRODUCTION_RUNTIME_ROLE = "public_production" as const
export const EDITORIAL_COPY_PRODUCTION_DB_IDENTITY = "public_production_db" as const
export const EDITORIAL_COPY_CANDIDATE_DB = "woodright_production" as const
export const EDITORIAL_COPY_STAGING_DB = "woodright_staging" as const

const DB_IDENTITY_ENV = ["WOODRIGHT_DATABASE_IDENTITY", "WOODRIGHT_DATABASE_IDENTITY_ALIAS"] as const
/** node-postgres / libpq read these from the process env; they must not steer a production run. */
const LIBPQ_CONNECTION_ENV = ["PGHOST", "PGHOSTADDR", "PGDATABASE", "PGSERVICE", "PGSERVICEFILE", "PGOPTIONS"] as const

export type EditorialCopyTarget = "local" | "staging" | "production"
export type EditorialCopyMode = "dry-run" | "apply" | "rollback-dry-run" | "rollback"

export type EditorialCopyGateOk = {
  ok: true
  target: EditorialCopyTarget
  mode: EditorialCopyMode
  writes: boolean
  rollback: boolean
  dbName: string
  hostname: string
  inputSha: string
}
export type EditorialCopyGateFail = { ok: false; code: string; message: string }
export type EditorialCopyGateResult = EditorialCopyGateOk | EditorialCopyGateFail

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])
/** libpq honours `?host=` / `?dbname=` / `?options=` and friends over the URL authority and path. */
const ALLOWED_URL_PARAMS = new Set(["sslmode", "application_name", "connect_timeout"])

function connectionOverrideParam(databaseUrl: string): string | null {
  let u: URL
  try {
    u = new URL(databaseUrl)
  } catch {
    return null
  }
  for (const key of u.searchParams.keys()) {
    if (!ALLOWED_URL_PARAMS.has(key.toLowerCase())) return key
  }
  if (u.host.includes(",") || u.hostname.includes("%")) return "host"
  return null
}
const MODES: EditorialCopyMode[] = ["dry-run", "apply", "rollback-dry-run", "rollback"]

function fail(code: string, message: string): EditorialCopyGateFail {
  return { ok: false, code, message: `FAIL_CLOSED: ${message}` }
}

function envRaw(env: NodeJS.ProcessEnv, key: string): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(env, key)) return undefined
  const v = env[key]
  return v === undefined ? undefined : String(v)
}

export function assertEditorialCopyGate(input: {
  env?: NodeJS.ProcessEnv
  databaseUrl?: string | null
  /** Canonical SHA of the packet / rollback file the script loaded. */
  inputSha: string
}): EditorialCopyGateResult {
  const env = input.env ?? process.env
  const target = envRaw(env, "EDITORIAL_COPY_TARGET")
  const mode = envRaw(env, "EDITORIAL_COPY_MODE")

  if (!target) return fail("missing_target", "EDITORIAL_COPY_TARGET is required")
  if (target !== "local" && target !== "staging" && target !== "production") {
    return fail("unknown_target", `unknown EDITORIAL_COPY_TARGET "${target}"`)
  }
  if (!mode) return fail("missing_mode", "EDITORIAL_COPY_MODE is required")
  if (!MODES.includes(mode as EditorialCopyMode)) return fail("unknown_mode", `unknown EDITORIAL_COPY_MODE "${mode}"`)

  const urlSource = input.databaseUrl !== undefined ? input.databaseUrl : envRaw(env, "DATABASE_URL")
  if (urlSource === undefined || urlSource === null || urlSource === "") {
    return fail("missing_url", "DATABASE_URL is required")
  }
  const override = connectionOverrideParam(String(urlSource))
  if (override) {
    return fail("url_connection_override", `DATABASE_URL must not override the connection target (${override})`)
  }
  const parsed = parseDatabaseUrl(String(urlSource))
  if (!parsed.ok) return fail(parsed.code, parsed.message)
  const { dbName, hostname } = parsed
  if (dbName === EDITORIAL_COPY_CANDIDATE_DB) {
    return fail(
      "candidate_db",
      `${EDITORIAL_COPY_CANDIDATE_DB} is the private production-candidate database, never an editorial target`
    )
  }

  const runtimeRole = envRaw(env, "WOODRIGHT_RUNTIME_ROLE")
  const dbIdentities = DB_IDENTITY_ENV.map((key) => envRaw(env, key)).filter((v): v is string => v !== undefined && v !== "")
  const productionRuntime =
    runtimeRole === EDITORIAL_COPY_PRODUCTION_RUNTIME_ROLE || dbIdentities.includes(EDITORIAL_COPY_PRODUCTION_DB_IDENTITY)

  if (target === "production") {
    if (dbName !== EDITORIAL_COPY_PRODUCTION_DB) {
      return fail("db_target_mismatch", `target=production requires ${EDITORIAL_COPY_PRODUCTION_DB} (got "${dbName}")`)
    }
    if (runtimeRole !== EDITORIAL_COPY_PRODUCTION_RUNTIME_ROLE) {
      return fail(
        "runtime_role_mismatch",
        `target=production requires WOODRIGHT_RUNTIME_ROLE=${EDITORIAL_COPY_PRODUCTION_RUNTIME_ROLE}`
      )
    }
    if (dbIdentities.length === 0 || dbIdentities.some((v) => v !== EDITORIAL_COPY_PRODUCTION_DB_IDENTITY)) {
      return fail(
        "db_identity_mismatch",
        `target=production requires WOODRIGHT_DATABASE_IDENTITY(_ALIAS)=${EDITORIAL_COPY_PRODUCTION_DB_IDENTITY}`
      )
    }
    const libpq = LIBPQ_CONNECTION_ENV.find((key) => envRaw(env, key) !== undefined)
    if (libpq) return fail("libpq_env_override", `target=production must not run with ${libpq} set`)
  } else {
    if (dbName === EDITORIAL_COPY_PRODUCTION_DB || productionRuntime) {
      return fail("production_requires_production_target", `public production is reachable only through target=production`)
    }
    if (target === "staging" && dbName !== EDITORIAL_COPY_STAGING_DB) {
      return fail("db_target_mismatch", `target=staging requires ${EDITORIAL_COPY_STAGING_DB} (got "${dbName}")`)
    }
    if (target === "local") {
      if (dbName === EDITORIAL_COPY_STAGING_DB) return fail("db_target_mismatch", `target=local must not point at ${dbName}`)
      if (!LOCAL_HOSTS.has(hostname)) return fail("local_not_loopback", `target=local requires a loopback host (got "${hostname}")`)
    }
  }

  const writes = mode === "apply" || mode === "rollback"
  const pinned = envRaw(env, "EDITORIAL_COPY_INPUT_SHA")
  if (writes) {
    if (!pinned) return fail("missing_input_sha", "EDITORIAL_COPY_INPUT_SHA is required for apply / rollback")
    if (pinned !== input.inputSha) {
      return fail("input_sha_mismatch", `EDITORIAL_COPY_INPUT_SHA does not match the loaded file (${input.inputSha})`)
    }
  } else if (pinned && pinned !== input.inputSha) {
    return fail("input_sha_mismatch", `EDITORIAL_COPY_INPUT_SHA does not match the loaded file (${input.inputSha})`)
  }

  const confirm = envRaw(env, "EDITORIAL_COPY_CONFIRM")
  const ack = envRaw(env, "EDITORIAL_COPY_PRODUCTION_ACK")
  if (target === "production") {
    if (confirm !== EDITORIAL_COPY_CONFIRM_EXPECTED) {
      return fail("invalid_confirm", "EDITORIAL_COPY_CONFIRM does not match the production owner-approval value")
    }
    if (ack !== EDITORIAL_COPY_PRODUCTION_ACK_EXPECTED) {
      return fail("invalid_ack", "EDITORIAL_COPY_PRODUCTION_ACK does not match the required value")
    }
  } else if (confirm || ack) {
    return fail("non_production_has_confirm", "production confirm / ack must be unset outside production")
  }

  return {
    ok: true,
    target,
    mode: mode as EditorialCopyMode,
    writes,
    rollback: mode === "rollback" || mode === "rollback-dry-run",
    dbName,
    hostname,
    inputSha: input.inputSha,
  }
}
