/**
 * Fail-closed target / mode / DB / production-confirmation gate for RoomSet V1 seed.
 * Pure — no Medusa / no DB I/O.
 */
import {
  ROOMSET_V1_MANIFEST_ID,
  ROOMSET_V1_MANIFEST_SHA_EXPECTED,
  computeRoomsV1ManifestSha,
} from "./seed-rooms-v1-manifest"

export const ROOMSET_SEED_SCOPE_EXPECTED = "rooms-v1-owner-approved" as const
export const ROOMSET_SEED_CONFIRM_EXPECTED =
  "ROOMSET_V1_PRODUCTION_OWNER_APPROVED" as const
export const ROOMSET_SEED_PRODUCTION_ACK_EXPECTED =
  "I_UNDERSTAND_THIS_WRITES_PRODUCTION" as const

export type RoomsetSeedTarget = "staging" | "production"
export type RoomsetSeedMode = "dry-run" | "apply"

export type RoomsetSeedGateInput = {
  env?: NodeJS.ProcessEnv
  /** Override URL for tests (defaults to env.DATABASE_URL). */
  databaseUrl?: string | null
}

export type RoomsetSeedGateOk = {
  ok: true
  target: RoomsetSeedTarget
  mode: RoomsetSeedMode
  scope: typeof ROOMSET_SEED_SCOPE_EXPECTED
  dbName: "woodright_staging" | "woodright_production"
  hostname: string
  manifestId: typeof ROOMSET_V1_MANIFEST_ID
  manifestSha: string
  apply: boolean
}

export type RoomsetSeedGateFail = {
  ok: false
  code: string
  message: string
}

export type RoomsetSeedGateResult = RoomsetSeedGateOk | RoomsetSeedGateFail

function fail(code: string, message: string): RoomsetSeedGateFail {
  return { ok: false, code, message: `FAIL_CLOSED: ${message}` }
}

function envRaw(env: NodeJS.ProcessEnv, key: string): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(env, key)) return undefined
  const v = env[key]
  return v === undefined ? undefined : String(v)
}

/** Absent or exactly "" → empty; whitespace-only is invalid (caller decides). */
function isAbsentOrEmpty(v: string | undefined): boolean {
  return v === undefined || v === ""
}

function isWhitespaceOnly(v: string | undefined): boolean {
  return typeof v === "string" && v.length > 0 && v.trim() === ""
}

/**
 * Parse DATABASE_URL → db name + hostname.
 * Accepts postgres: / postgresql: only.
 * Path must be exactly one segment `/dbname` (decoded).
 */
export function parseDatabaseUrl(
  databaseUrl: string
):
  | { ok: true; dbName: string; hostname: string; protocol: string }
  | { ok: false; code: string; message: string } {
  if (databaseUrl === "") {
    return { ok: false, code: "empty_url", message: "DATABASE_URL is empty" }
  }
  let u: URL
  try {
    u = new URL(databaseUrl)
  } catch {
    return {
      ok: false,
      code: "malformed_url",
      message: "DATABASE_URL is malformed",
    }
  }
  const protocol = u.protocol.replace(/:$/, "")
  if (protocol !== "postgres" && protocol !== "postgresql") {
    return {
      ok: false,
      code: "unsupported_protocol",
      message: `unsupported DATABASE_URL protocol "${protocol}"`,
    }
  }
  if (!u.hostname) {
    return {
      ok: false,
      code: "missing_host",
      message: "DATABASE_URL host is required",
    }
  }
  // pathname: "" or "/" → invalid; must be /{name} only
  let path = u.pathname || ""
  if (path === "" || path === "/") {
    return {
      ok: false,
      code: "missing_db_path",
      message: "DATABASE_URL database path is required",
    }
  }
  if (path.endsWith("/") && path !== "/") {
    return {
      ok: false,
      code: "trailing_slash",
      message: "DATABASE_URL database path must not have a trailing slash",
    }
  }
  if (!path.startsWith("/")) {
    return {
      ok: false,
      code: "invalid_db_path",
      message: "DATABASE_URL database path is invalid",
    }
  }
  const rest = path.slice(1)
  if (rest.includes("/")) {
    return {
      ok: false,
      code: "extra_segment",
      message: "DATABASE_URL database path must be a single segment",
    }
  }
  let dbName: string
  try {
    dbName = decodeURIComponent(rest)
  } catch {
    return {
      ok: false,
      code: "invalid_db_encoding",
      message: "DATABASE_URL database path encoding is invalid",
    }
  }
  if (!dbName) {
    return {
      ok: false,
      code: "missing_db_name",
      message: "DATABASE_URL database name is missing",
    }
  }
  return { ok: true, dbName, hostname: u.hostname, protocol }
}

export function assertRoomsetSeedGate(
  input: RoomsetSeedGateInput = {}
): RoomsetSeedGateResult {
  const env = input.env ?? process.env

  // Manifest pin first (no DB needed)
  const manifestSha = computeRoomsV1ManifestSha()
  if (manifestSha !== ROOMSET_V1_MANIFEST_SHA_EXPECTED) {
    return fail(
      "manifest_sha_mismatch",
      `manifest SHA mismatch (got ${manifestSha})`
    )
  }

  // Legacy authorization variables — any presence fails
  if (Object.prototype.hasOwnProperty.call(env, "WOODRIGHT_ROOMS_V1_APPLY")) {
    return fail(
      "legacy_apply",
      "legacy WOODRIGHT_ROOMS_V1_APPLY is present; use ROOMSET_SEED_MODE"
    )
  }
  if (Object.prototype.hasOwnProperty.call(env, "WOODRIGHT_ROOMS_V1_CONFIRM")) {
    return fail(
      "legacy_confirm",
      "legacy WOODRIGHT_ROOMS_V1_CONFIRM is present; use ROOMSET_SEED_* confirmations"
    )
  }

  const target = envRaw(env, "ROOMSET_SEED_TARGET")
  const scope = envRaw(env, "ROOMSET_SEED_SCOPE")
  const mode = envRaw(env, "ROOMSET_SEED_MODE")
  const confirm = envRaw(env, "ROOMSET_SEED_CONFIRM")
  const ack = envRaw(env, "ROOMSET_SEED_PRODUCTION_ACK")

  if (isAbsentOrEmpty(target)) {
    return fail("missing_target", "ROOMSET_SEED_TARGET is required")
  }
  if (isWhitespaceOnly(target)) {
    return fail("invalid_target", "ROOMSET_SEED_TARGET is whitespace-only")
  }
  if (target !== "staging" && target !== "production") {
    return fail("unknown_target", `unknown ROOMSET_SEED_TARGET "${target}"`)
  }

  if (isAbsentOrEmpty(scope)) {
    return fail("missing_scope", "ROOMSET_SEED_SCOPE is required")
  }
  if (isWhitespaceOnly(scope) || scope !== ROOMSET_SEED_SCOPE_EXPECTED) {
    return fail(
      "invalid_scope",
      `ROOMSET_SEED_SCOPE must be exactly ${ROOMSET_SEED_SCOPE_EXPECTED}`
    )
  }

  if (isAbsentOrEmpty(mode)) {
    return fail("missing_mode", "ROOMSET_SEED_MODE is required")
  }
  if (isWhitespaceOnly(mode)) {
    return fail("invalid_mode", "ROOMSET_SEED_MODE is whitespace-only")
  }
  if (mode !== "dry-run" && mode !== "apply") {
    return fail("unknown_mode", `unknown ROOMSET_SEED_MODE "${mode}"`)
  }

  const urlSource =
    input.databaseUrl !== undefined
      ? input.databaseUrl
      : envRaw(env, "DATABASE_URL")
  if (urlSource === undefined || urlSource === null) {
    return fail("missing_url", "DATABASE_URL is required")
  }
  const parsed = parseDatabaseUrl(String(urlSource))
  if (!parsed.ok) {
    return fail(parsed.code, parsed.message.replace(/^FAIL_CLOSED: /, ""))
  }
  const { dbName, hostname } = parsed

  const expectedDb =
    target === "staging" ? "woodright_staging" : "woodright_production"
  if (dbName !== expectedDb) {
    return fail(
      "db_target_mismatch",
      `target=${target} requires database name "${expectedDb}" (got "${dbName}")`
    )
  }

  if (target === "staging") {
    if (!isAbsentOrEmpty(confirm)) {
      return fail(
        "staging_has_confirm",
        "ROOMSET_SEED_CONFIRM must be unset for staging"
      )
    }
    if (!isAbsentOrEmpty(ack)) {
      return fail(
        "staging_has_ack",
        "ROOMSET_SEED_PRODUCTION_ACK must be unset for staging"
      )
    }
  } else {
    // production — both modes require exact confirm + ack
    if (isAbsentOrEmpty(confirm) || isWhitespaceOnly(confirm)) {
      return fail(
        "missing_confirm",
        "ROOMSET_SEED_CONFIRM is required for production"
      )
    }
    if (confirm !== ROOMSET_SEED_CONFIRM_EXPECTED) {
      return fail(
        "invalid_confirm",
        "ROOMSET_SEED_CONFIRM does not match required production value"
      )
    }
    if (isAbsentOrEmpty(ack) || isWhitespaceOnly(ack)) {
      return fail(
        "missing_ack",
        "ROOMSET_SEED_PRODUCTION_ACK is required for production"
      )
    }
    if (ack !== ROOMSET_SEED_PRODUCTION_ACK_EXPECTED) {
      return fail(
        "invalid_ack",
        "ROOMSET_SEED_PRODUCTION_ACK does not match required production value"
      )
    }
  }

  return {
    ok: true,
    target,
    mode,
    scope: ROOMSET_SEED_SCOPE_EXPECTED,
    dbName: dbName as "woodright_staging" | "woodright_production",
    hostname,
    manifestId: ROOMSET_V1_MANIFEST_ID,
    manifestSha,
    apply: mode === "apply",
  }
}
