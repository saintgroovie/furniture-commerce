/**
 * Fidelity: RoomSet V1 fail-closed target gate + pinned manifest SHA.
 * Run: yarn dlx tsx src/scripts/seed-rooms-v1-target-gate.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import {
  ROOMSET_V1_MANIFEST_SHA_EXPECTED,
  computeRoomsV1ManifestSha,
  roomsV1ManifestPayload,
  stableStringify,
} from "./seed-rooms-v1-manifest"
import {
  assertRoomsetSeedGate,
  parseDatabaseUrl,
} from "./seed-rooms-v1-target-gate"

const root = process.cwd()

assert.equal(
  computeRoomsV1ManifestSha(),
  ROOMSET_V1_MANIFEST_SHA_EXPECTED,
  "pinned manifest SHA mismatch"
)
assert.equal(
  computeRoomsV1ManifestSha(roomsV1ManifestPayload()),
  ROOMSET_V1_MANIFEST_SHA_EXPECTED
)

// Mutating protected category changes SHA
{
  const p = roomsV1ManifestPayload() as {
    rooms: Array<{ title: string }>
  }
  p.rooms[0].title = "TAMPERED"
  assert.notEqual(computeRoomsV1ManifestSha(p as never), ROOMSET_V1_MANIFEST_SHA_EXPECTED)
}

function baseEnv(
  over: Record<string, string | undefined> = {}
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...over }
  // Ensure legacy keys absent
  delete env.WOODRIGHT_ROOMS_V1_APPLY
  delete env.WOODRIGHT_ROOMS_V1_CONFIRM
  return env
}

function urlFor(dbName: string, variant = "ok"): string | null {
  switch (variant) {
    case "ok":
      return `postgresql://u:p@127.0.0.1:5432/${dbName}`
    case "missing_url":
      return null
    case "empty_url":
      return ""
    case "malformed":
      return "not-a-url"
    case "no_path":
      return "postgresql://u:p@127.0.0.1:5432"
    case "root_path":
      return "postgresql://u:p@127.0.0.1:5432/"
    case "extra_segment":
      return `postgresql://u:p@127.0.0.1:5432/${dbName || "woodright_staging"}/extra`
    case "trailing_slash":
      return `postgresql://u:p@127.0.0.1:5432/${dbName || "woodright_staging"}/`
    case "query_dbname":
      return "postgresql://u:p@127.0.0.1:5432/?dbname=woodright_staging"
    case "mysql_protocol":
      return "mysql://u:p@127.0.0.1:3306/woodright_staging"
    case "missing_host":
      return "postgresql:///woodright_staging"
    case "pct_exact_staging":
      return "postgresql://u:p@127.0.0.1:5432/woodright%5Fstaging"
    case "pct_exact_production":
      return "postgresql://u:p@127.0.0.1:5432/woodright%5Fproduction"
    case "pct_uppercase":
      return "postgresql://u:p@127.0.0.1:5432/Woodright_Staging"
    case "pct_whitespace":
      return "postgresql://u:p@127.0.0.1:5432/%20woodright_staging"
    case "whitespace_confirm":
      return `postgresql://u:p@127.0.0.1:5432/${dbName || "woodright_staging"}`
    default:
      return `postgresql://u:p@127.0.0.1:5432/${dbName}`
  }
}

// Parse helpers
{
  const ok = parseDatabaseUrl("postgresql://u:p@127.0.0.1:5432/woodright_staging")
  assert.equal(ok.ok, true)
  if (ok.ok) {
    assert.equal(ok.dbName, "woodright_staging")
    assert.equal(ok.hostname, "127.0.0.1")
  }
  const pct = parseDatabaseUrl(
    "postgresql://u:p@127.0.0.1:5432/woodright%5Fstaging"
  )
  assert.equal(pct.ok, true)
  if (pct.ok) assert.equal(pct.dbName, "woodright_staging")
}

type MatrixRow = {
  case_id: string
  target: string
  scope: string
  mode: string
  db_name: string
  confirm: string
  ack: string
  legacy_apply: string
  legacy_confirm: string
  url_variant: string
  expected: string
}

function loadMatrix(): MatrixRow[] {
  // Prefer evidence matrix if present; else embedded path relative to repo ops evidence is not in repo.
  // Mirror contract rows by reading from script-adjacent copy if shipped; else use inline minimal + file if EV set.
  const candidates = [
    process.env.ROOMSET_GATE_MATRIX_CSV,
    join(root, "../../docs/operator/rooms-v1-fail-closed-matrix.csv"),
  ].filter(Boolean) as string[]
  for (const p of candidates) {
    if (existsSync(p)) {
      return parseCsv(readFileSync(p, "utf8"))
    }
  }
  // Fallback: require matrix beside this test when copied into repo
  const local = join(root, "src/scripts/rooms-v1-fail-closed-matrix.csv")
  assert.equal(existsSync(local), true, `matrix missing at ${local}`)
  return parseCsv(readFileSync(local, "utf8"))
}

function parseCsv(text: string): MatrixRow[] {
  const lines = text.trim().split(/\r?\n/)
  const header = lines[0].split(",")
  return lines.slice(1).map((line) => {
    const cols = splitCsv(line)
    const row: Record<string, string> = {}
    header.forEach((h, i) => {
      row[h] = cols[i] ?? ""
    })
    return row as unknown as MatrixRow
  })
}

function splitCsv(line: string): string[] {
  // Simple CSV (no quoted commas in our matrix)
  return line.split(",")
}

const matrix = loadMatrix()
assert.ok(matrix.length >= 30, "matrix too small")

for (const row of matrix) {
  const env = baseEnv()
  if (row.target) env.ROOMSET_SEED_TARGET = row.target
  if (row.scope) env.ROOMSET_SEED_SCOPE = row.scope
  if (row.mode) env.ROOMSET_SEED_MODE = row.mode
  if (row.confirm) env.ROOMSET_SEED_CONFIRM = row.confirm
  if (row.ack) env.ROOMSET_SEED_PRODUCTION_ACK = row.ack
  if (row.url_variant === "whitespace_confirm") {
    env.ROOMSET_SEED_CONFIRM = " "
  }
  if (row.legacy_apply) env.WOODRIGHT_ROOMS_V1_APPLY = row.legacy_apply
  if (row.legacy_confirm) env.WOODRIGHT_ROOMS_V1_CONFIRM = row.legacy_confirm

  const variant = row.url_variant || "ok"
  let databaseUrl: string | null | undefined
  if (variant === "missing_url") {
    databaseUrl = null
  } else {
    databaseUrl = urlFor(row.db_name, variant)
  }

  const result = assertRoomsetSeedGate({
    env,
    databaseUrl: databaseUrl === null ? null : databaseUrl,
  })
  const expectPass = row.expected === "PASS"
  assert.equal(
    result.ok,
    expectPass,
    `${row.case_id} expected ${row.expected} got ${JSON.stringify(result)}`
  )
  if (!result.ok) {
    assert.match(result.message, /^FAIL_CLOSED:/)
    assert.doesNotMatch(result.message, /:p@|password|u:p@/i)
    assert.doesNotMatch(result.message, /postgresql:\/\/u:p@/)
  } else {
    assert.equal(result.manifestSha, ROOMSET_V1_MANIFEST_SHA_EXPECTED)
    assert.ok(result.hostname)
    assert.doesNotMatch(result.hostname, /:/)
  }
}

// Happy staging apply
{
  const r = assertRoomsetSeedGate({
    env: baseEnv({
      ROOMSET_SEED_TARGET: "staging",
      ROOMSET_SEED_SCOPE: "rooms-v1-owner-approved",
      ROOMSET_SEED_MODE: "apply",
    }),
    databaseUrl: "postgresql://u:p@127.0.0.1:5432/woodright_staging",
  })
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.apply, true)
}

// Stable stringify is compact
assert.equal(stableStringify({ b: 1, a: 2 }), '{"a":2,"b":1}')

console.log("seed-rooms-v1-target-gate.fidelity.test.ts: ok")
