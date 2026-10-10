/**
 * Fail-closed gate for the editorial description importer. Pure - no I/O.
 *
 *   EDITORIAL_COPY_TARGET=local|staging|production
 *   EDITORIAL_COPY_MODE=dry-run|apply|rollback-dry-run|rollback
 *   DATABASE_URL db name must match target:
 *     staging    -> woodright_staging
 *     production -> woodright_production
 *     local      -> anything except the two above, on localhost / 127.0.0.1 / ::1
 *   apply and rollback require EDITORIAL_COPY_INPUT_SHA = canonical SHA-256 of the input file.
 *   production (every mode, dry-run included) additionally requires:
 *     EDITORIAL_COPY_CONFIRM=EDITORIAL_COPY_V1_PRODUCTION_OWNER_APPROVED
 *     EDITORIAL_COPY_PRODUCTION_ACK=I_UNDERSTAND_THIS_WRITES_PRODUCTION
 *
 * `woodright_public_production` is refused outright. Query parameters that can redirect the
 * connection (`host`, `dbname`, `options`, ...) and multi-host / socket-path hosts are refused;
 * only `sslmode`, `application_name`, `connect_timeout` are allowed.
 */
import { parseDatabaseUrl } from "./seed-rooms-v1-target-gate"

export const EDITORIAL_COPY_CONFIRM_EXPECTED = "EDITORIAL_COPY_V1_PRODUCTION_OWNER_APPROVED" as const
export const EDITORIAL_COPY_PRODUCTION_ACK_EXPECTED = "I_UNDERSTAND_THIS_WRITES_PRODUCTION" as const
export const EDITORIAL_COPY_REFUSED_DB = "woodright_public_production" as const

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
  if (dbName === EDITORIAL_COPY_REFUSED_DB) return fail("refused_db", `${EDITORIAL_COPY_REFUSED_DB} is never a valid target`)

  if (target === "staging" && dbName !== "woodright_staging") {
    return fail("db_target_mismatch", `target=staging requires woodright_staging (got "${dbName}")`)
  }
  if (target === "production" && dbName !== "woodright_production") {
    return fail("db_target_mismatch", `target=production requires woodright_production (got "${dbName}")`)
  }
  if (target === "local") {
    if (dbName === "woodright_staging" || dbName === "woodright_production") {
      return fail("db_target_mismatch", `target=local must not point at ${dbName}`)
    }
    if (!LOCAL_HOSTS.has(hostname)) return fail("local_not_loopback", `target=local requires a loopback host (got "${hostname}")`)
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
