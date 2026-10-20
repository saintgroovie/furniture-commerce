/**
 * Fidelity: editorial description importer target gate.
 * Run: yarn dlx tsx src/scripts/apply-editorial-copy-gate.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  EDITORIAL_COPY_CONFIRM_EXPECTED,
  EDITORIAL_COPY_PRODUCTION_ACK_EXPECTED,
  assertEditorialCopyGate,
} from "./apply-editorial-copy-gate"

const SHA = "a".repeat(64)
const LOCAL_URL = "postgres://u:p@localhost:5432/medusa-store"
const STAGING_URL = "postgres://u:p@db.internal:5432/woodright_staging"
const PROD_URL = "postgres://u:p@db.internal:5432/woodright_public_production"
const CANDIDATE_URL = "postgres://u:p@db.internal:5432/woodright_production"

function gate(env: Record<string, string>, databaseUrl: string | null = LOCAL_URL, inputSha = SHA) {
  return assertEditorialCopyGate({ env: env as NodeJS.ProcessEnv, databaseUrl, inputSha })
}
function code(r: ReturnType<typeof gate>): string {
  return r.ok ? "ok" : r.code
}

const prodApproval = {
  EDITORIAL_COPY_CONFIRM: EDITORIAL_COPY_CONFIRM_EXPECTED,
  EDITORIAL_COPY_PRODUCTION_ACK: EDITORIAL_COPY_PRODUCTION_ACK_EXPECTED,
}
/** Runtime identity env of the public production backend container. */
const prodRuntime = {
  WOODRIGHT_RUNTIME_ROLE: "public_production",
  WOODRIGHT_DATABASE_IDENTITY: "public_production_db",
  WOODRIGHT_DATABASE_IDENTITY_ALIAS: "public_production_db",
}
const prodBase = { EDITORIAL_COPY_TARGET: "production", EDITORIAL_COPY_MODE: "dry-run", ...prodApproval, ...prodRuntime }

/* required inputs */
assert.equal(code(gate({})), "missing_target")
assert.equal(code(gate({ EDITORIAL_COPY_TARGET: "prod" })), "unknown_target")
assert.equal(code(gate({ EDITORIAL_COPY_TARGET: "local" })), "missing_mode")
assert.equal(code(gate({ EDITORIAL_COPY_TARGET: "local", EDITORIAL_COPY_MODE: "execute" })), "unknown_mode")
assert.equal(code(gate({ EDITORIAL_COPY_TARGET: "local", EDITORIAL_COPY_MODE: "dry-run" }, null)), "missing_url")

/* local dry-run: no SHA needed, never writes */
{
  const r = gate({ EDITORIAL_COPY_TARGET: "local", EDITORIAL_COPY_MODE: "dry-run" })
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.writes, false)
    assert.equal(r.rollback, false)
    assert.equal(r.dbName, "medusa-store")
  }
  const rb = gate({ EDITORIAL_COPY_TARGET: "local", EDITORIAL_COPY_MODE: "rollback-dry-run" })
  assert.equal(rb.ok && rb.writes, false)
  assert.equal(rb.ok && rb.rollback, true)
}

/* local must be loopback and must not be a named remote db */
assert.equal(code(gate({ EDITORIAL_COPY_TARGET: "local", EDITORIAL_COPY_MODE: "dry-run" }, "postgres://u:p@10.0.0.5:5432/medusa-store")), "local_not_loopback")
assert.equal(code(gate({ EDITORIAL_COPY_TARGET: "local", EDITORIAL_COPY_MODE: "dry-run" }, "postgres://u:p@localhost:5432/woodright_production")), "candidate_db")
assert.equal(code(gate({ EDITORIAL_COPY_TARGET: "local", EDITORIAL_COPY_MODE: "dry-run" }, "postgres://u:p@localhost:5432/woodright_staging")), "db_target_mismatch")

/* connection-target overrides in the URL are refused before the db / host checks */
for (const url of [
  "postgres://u:p@localhost:5432/medusa-store?host=db.internal",
  "postgres://u:p@localhost:5432/medusa-store?dbname=woodright_production",
  "postgres://u:p@localhost:5432/medusa-store?database=woodright_public_production",
  "postgres://u:p@localhost:5432/medusa-store?options=-c%20search_path%3Dother",
  "postgres://u:p@localhost:5432/medusa-store?hostaddr=10.0.0.5",
  "postgres://u:p@localhost:5432/medusa-store?HOST=db.internal",
  "postgres://u:p@localhost,db.internal:5432/medusa-store",
  "postgres://u:p@%2Ftmp%2Fsock/medusa-store",
]) {
  assert.equal(code(gate({ EDITORIAL_COPY_TARGET: "local", EDITORIAL_COPY_MODE: "dry-run" }, url)), "url_connection_override", url)
}
for (const url of [
  `${PROD_URL}?host=localhost`,
  `${PROD_URL}?dbname=woodright_public_production`,
  `${LOCAL_URL.replace("medusa-store", "woodright_public_production")}?options=-c%20search_path%3Dother`,
  "postgres://u:p@db.internal,localhost:5432/woodright_public_production",
]) {
  assert.equal(code(gate({ ...prodBase, EDITORIAL_COPY_MODE: "apply", EDITORIAL_COPY_INPUT_SHA: SHA }, url)), "url_connection_override", url)
}
assert.equal(gate({ EDITORIAL_COPY_TARGET: "local", EDITORIAL_COPY_MODE: "dry-run" }, `${LOCAL_URL}?sslmode=disable&connect_timeout=5`).ok, true)

/* staging stays woodright_staging */
assert.equal(code(gate({ EDITORIAL_COPY_TARGET: "staging", EDITORIAL_COPY_MODE: "dry-run" }, LOCAL_URL)), "db_target_mismatch")
assert.equal(gate({ EDITORIAL_COPY_TARGET: "staging", EDITORIAL_COPY_MODE: "dry-run" }, STAGING_URL).ok, true)

/* production: the public production database only, exact parsed name */
{
  const ok = gate(prodBase, PROD_URL)
  assert.equal(ok.ok, true)
  if (ok.ok) {
    assert.equal(ok.target, "production")
    assert.equal(ok.dbName, "woodright_public_production")
    assert.equal(ok.writes, false)
  }
  assert.equal(gate(prodBase, `${PROD_URL}?sslmode=require&application_name=editorial-copy`).ok, true, "allowed params")
  assert.equal(gate(prodBase, "postgresql://u:p@db.internal/woodright_public_production").ok, true, "postgresql scheme, no port")
  assert.equal(gate(prodBase, "postgres://u:p@db.internal:5432/%77oodright_public_production").ok, true, "standard percent-decoding")

  const refused: Array<[string, string, string]> = [
    ["legacy woodright_production", CANDIDATE_URL, "candidate_db"],
    ["public demo db", STAGING_URL, "db_target_mismatch"],
    ["private staging db", "postgres://u:p@db.internal:5432/woodright_staging_private", "db_target_mismatch"],
    ["local db", LOCAL_URL, "db_target_mismatch"],
    ["prefix", "postgres://u:p@db.internal:5432/x_woodright_public_production", "db_target_mismatch"],
    ["suffix", "postgres://u:p@db.internal:5432/woodright_public_production_restore", "db_target_mismatch"],
    ["suffix 2", "postgres://u:p@db.internal:5432/woodright_public_production2", "db_target_mismatch"],
    ["case", "postgres://u:p@db.internal:5432/Woodright_Public_Production", "db_target_mismatch"],
    ["encoded space", "postgres://u:p@db.internal:5432/woodright_public_production%20", "db_target_mismatch"],
    ["encoded slash", "postgres://u:p@db.internal:5432/woodright_public_production%2Fx", "db_target_mismatch"],
    ["encoded nul", "postgres://u:p@db.internal:5432/woodright_public_production%00", "db_target_mismatch"],
    ["candidate via encoding", "postgres://u:p@db.internal:5432/woodright%5Fproduction", "candidate_db"],
    ["empty db path", "postgres://u:p@db.internal:5432/", "missing_db_path"],
    ["no db path", "postgres://u:p@db.internal:5432", "missing_db_path"],
    ["extra segment", "postgres://u:p@db.internal:5432/woodright_public_production/x", "extra_segment"],
    ["trailing slash", "postgres://u:p@db.internal:5432/woodright_public_production/", "trailing_slash"],
    ["malformed", "not a url", "malformed_url"],
    ["bad encoding", "postgres://u:p@db.internal:5432/woodright_public_production%E0%A4%A", "invalid_db_encoding"],
    ["other protocol", "mysql://u:p@db.internal:3306/woodright_public_production", "unsupported_protocol"],
  ]
  for (const [label, url, expected] of refused) {
    assert.equal(code(gate(prodBase, url)), expected, label)
  }
  assert.equal(code(gate(prodBase, "")), "missing_url", "empty DATABASE_URL")
  assert.equal(code(gate(prodBase, null)), "missing_url", "absent DATABASE_URL")
  assert.equal(code(gate({ EDITORIAL_COPY_TARGET: "production", EDITORIAL_COPY_MODE: "dry-run", ...prodRuntime }, CANDIDATE_URL)), "candidate_db")
}

/* production: runtime identity of the public production backend */
{
  const without = (key: string) => {
    const env: Record<string, string> = { ...prodBase }
    delete env[key]
    return env
  }
  assert.equal(code(gate(without("WOODRIGHT_RUNTIME_ROLE"), PROD_URL)), "runtime_role_mismatch")
  for (const role of ["public_demo", "production_candidate", "non_public_candidate", "staging", " public_production", "public_production ", "PUBLIC_PRODUCTION", ""]) {
    assert.equal(code(gate({ ...prodBase, WOODRIGHT_RUNTIME_ROLE: role }, PROD_URL)), "runtime_role_mismatch", JSON.stringify(role))
  }
  assert.equal(code(gate({ ...without("WOODRIGHT_DATABASE_IDENTITY"), WOODRIGHT_DATABASE_IDENTITY_ALIAS: "" }, PROD_URL)), "db_identity_mismatch", "no identity")
  for (const identity of ["public_demo_db", "non_public_candidate_db", "public_production_db ", "public_production"]) {
    assert.equal(code(gate({ ...prodBase, WOODRIGHT_DATABASE_IDENTITY: identity }, PROD_URL)), "db_identity_mismatch", identity)
    assert.equal(code(gate({ ...prodBase, WOODRIGHT_DATABASE_IDENTITY_ALIAS: identity }, PROD_URL)), "db_identity_mismatch", `alias ${identity}`)
  }
  assert.equal(gate(without("WOODRIGHT_DATABASE_IDENTITY"), PROD_URL).ok, true, "legacy alias alone")
  assert.equal(gate(without("WOODRIGHT_DATABASE_IDENTITY_ALIAS"), PROD_URL).ok, true, "primary identity alone")
  assert.equal(gate({ ...prodBase, WOODRIGHT_DATABASE_IDENTITY_ALIAS: "" }, PROD_URL).ok, true, "empty legacy alias is unset")

  for (const key of ["PGHOST", "PGHOSTADDR", "PGDATABASE", "PGSERVICE", "PGSERVICEFILE", "PGOPTIONS"]) {
    assert.equal(code(gate({ ...prodBase, [key]: "x" }, PROD_URL)), "libpq_env_override", key)
    assert.equal(code(gate({ ...prodBase, [key]: "" }, PROD_URL)), "libpq_env_override", `${key} empty`)
  }
  assert.equal(gate({ ...prodBase, PGSSLMODE: "require", PGCONNECT_TIMEOUT: "5" }, PROD_URL).ok, true, "non-target libpq env")
}

/* public production is never reachable through a non-production target */
for (const target of ["local", "staging"]) {
  assert.equal(
    code(gate({ EDITORIAL_COPY_TARGET: target, EDITORIAL_COPY_MODE: "dry-run" }, "postgres://u:p@localhost:5432/woodright_public_production")),
    "production_requires_production_target",
    target
  )
  assert.equal(code(gate({ EDITORIAL_COPY_TARGET: target, EDITORIAL_COPY_MODE: "dry-run", ...prodRuntime }, target === "local" ? LOCAL_URL : STAGING_URL)), "production_requires_production_target", `${target} in production runtime`)
  assert.equal(code(gate({ EDITORIAL_COPY_TARGET: target, EDITORIAL_COPY_MODE: "dry-run", WOODRIGHT_RUNTIME_ROLE: "public_production" }, target === "local" ? LOCAL_URL : STAGING_URL)), "production_requires_production_target", `${target} role only`)
  assert.equal(code(gate({ EDITORIAL_COPY_TARGET: target, EDITORIAL_COPY_MODE: "dry-run", WOODRIGHT_DATABASE_IDENTITY_ALIAS: "public_production_db" }, target === "local" ? LOCAL_URL : STAGING_URL)), "production_requires_production_target", `${target} alias only`)
  assert.equal(code(gate({ EDITORIAL_COPY_TARGET: target, EDITORIAL_COPY_MODE: "dry-run" }, CANDIDATE_URL.replace("db.internal", "localhost"))), "candidate_db", `${target} candidate`)
}
assert.equal(gate({ EDITORIAL_COPY_TARGET: "local", EDITORIAL_COPY_MODE: "dry-run", WOODRIGHT_RUNTIME_ROLE: "public_demo" }).ok, true, "local unaffected by a non-production role")

/* writes require the pinned input SHA */
for (const mode of ["apply", "rollback"]) {
  assert.equal(code(gate({ EDITORIAL_COPY_TARGET: "local", EDITORIAL_COPY_MODE: mode })), "missing_input_sha")
  assert.equal(code(gate({ EDITORIAL_COPY_TARGET: "local", EDITORIAL_COPY_MODE: mode, EDITORIAL_COPY_INPUT_SHA: "b".repeat(64) })), "input_sha_mismatch")
  const ok = gate({ EDITORIAL_COPY_TARGET: "local", EDITORIAL_COPY_MODE: mode, EDITORIAL_COPY_INPUT_SHA: SHA })
  assert.equal(ok.ok && ok.writes, true)
}
assert.equal(code(gate({ EDITORIAL_COPY_TARGET: "local", EDITORIAL_COPY_MODE: "dry-run", EDITORIAL_COPY_INPUT_SHA: "b".repeat(64) })), "input_sha_mismatch")

/* staging apply: SHA yes, production confirm no */
{
  const ok = gate({ EDITORIAL_COPY_TARGET: "staging", EDITORIAL_COPY_MODE: "apply", EDITORIAL_COPY_INPUT_SHA: SHA }, STAGING_URL)
  assert.equal(ok.ok && ok.writes, true)
  assert.equal(
    code(gate({ EDITORIAL_COPY_TARGET: "staging", EDITORIAL_COPY_MODE: "apply", EDITORIAL_COPY_INPUT_SHA: SHA, ...prodApproval }, STAGING_URL)),
    "non_production_has_confirm"
  )
  assert.equal(
    code(gate({ EDITORIAL_COPY_TARGET: "local", EDITORIAL_COPY_MODE: "dry-run", EDITORIAL_COPY_PRODUCTION_ACK: EDITORIAL_COPY_PRODUCTION_ACK_EXPECTED })),
    "non_production_has_confirm"
  )
}

/* production: every mode, dry-run included, needs confirm + ack; writes also need SHA */
for (const mode of ["dry-run", "apply", "rollback-dry-run", "rollback"]) {
  const base = { EDITORIAL_COPY_TARGET: "production", EDITORIAL_COPY_MODE: mode, EDITORIAL_COPY_INPUT_SHA: SHA, ...prodRuntime }
  assert.equal(code(gate(base, PROD_URL)), "invalid_confirm", mode)
  assert.equal(code(gate({ ...base, EDITORIAL_COPY_CONFIRM: "yes" }, PROD_URL)), "invalid_confirm", mode)
  assert.equal(code(gate({ ...base, EDITORIAL_COPY_PRODUCTION_ACK: EDITORIAL_COPY_PRODUCTION_ACK_EXPECTED }, PROD_URL)), "invalid_confirm", `${mode} ack only`)
  assert.equal(code(gate({ ...base, EDITORIAL_COPY_CONFIRM: EDITORIAL_COPY_CONFIRM_EXPECTED }, PROD_URL)), "invalid_ack", mode)
  assert.equal(code(gate({ ...base, EDITORIAL_COPY_CONFIRM: EDITORIAL_COPY_CONFIRM_EXPECTED, EDITORIAL_COPY_PRODUCTION_ACK: "yes" }, PROD_URL)), "invalid_ack", mode)
  const ok = gate({ ...base, ...prodApproval }, PROD_URL)
  assert.equal(ok.ok, true, mode)
  assert.equal(ok.ok && ok.writes, mode === "apply" || mode === "rollback", mode)
  assert.equal(code(gate({ ...base, ...prodApproval }, CANDIDATE_URL)), "candidate_db", `${mode} candidate`)
}
assert.equal(code(gate({ EDITORIAL_COPY_TARGET: "production", EDITORIAL_COPY_MODE: "apply", ...prodApproval, ...prodRuntime }, PROD_URL)), "missing_input_sha")

/* the exec script only wires the core; the core never writes outside the gate and only touches description */
{
  const script = readFileSync(join(process.cwd(), "src", "scripts", "apply-editorial-copy.ts"), "utf8")
  const core = readFileSync(join(process.cwd(), "src", "lib", "editorial-copy", "run.ts"), "utf8")
  assert.ok(script.includes("runEditorialCopy("), "exec script must delegate to the core")
  assert.equal(/updateProducts\(/.test(script), false, "exec script must not write directly")
  assert.ok(core.includes("assertEditorialCopyGate("), "core must call the gate")
  assert.ok(core.includes("buildDescriptionUpdates("), "core must build updates via the description-only builder")
  assert.ok(core.indexOf("assertEditorialCopyGate(") < core.indexOf("listProducts("), "gate runs before any read")
  assert.ok(core.indexOf("writeJson(`editorial-copy-rollback") < core.indexOf("updateProducts(u.id"), "rollback artifact before writes")
  for (const src of [script, core]) {
    for (const banned of ["createProducts", "deleteProducts", "upsertProducts", "updateProductVariants", "\\.query\\(", "raw\\(", "status:"]) {
      assert.equal(new RegExp(banned).test(src), false, `must not contain ${banned}`)
    }
  }
  assert.equal((core.match(/updateProducts\(/g) ?? []).length, 1, "single update call site")
}

console.log("apply-editorial-copy gate fidelity: ok")
