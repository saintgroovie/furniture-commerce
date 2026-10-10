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
const PROD_URL = "postgres://u:p@db.internal:5432/woodright_production"

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
assert.equal(code(gate({ EDITORIAL_COPY_TARGET: "local", EDITORIAL_COPY_MODE: "dry-run" }, "postgres://u:p@localhost:5432/woodright_production")), "db_target_mismatch")
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
assert.equal(
  code(gate({ EDITORIAL_COPY_TARGET: "production", EDITORIAL_COPY_MODE: "apply", EDITORIAL_COPY_INPUT_SHA: SHA, ...prodApproval }, `${PROD_URL}?host=localhost`)),
  "url_connection_override"
)
assert.equal(gate({ EDITORIAL_COPY_TARGET: "local", EDITORIAL_COPY_MODE: "dry-run" }, `${LOCAL_URL}?sslmode=disable&connect_timeout=5`).ok, true)

/* target / db mismatch and refused db */
assert.equal(code(gate({ EDITORIAL_COPY_TARGET: "staging", EDITORIAL_COPY_MODE: "dry-run" }, PROD_URL)), "db_target_mismatch")
assert.equal(code(gate({ EDITORIAL_COPY_TARGET: "production", EDITORIAL_COPY_MODE: "dry-run", ...prodApproval }, STAGING_URL)), "db_target_mismatch")
for (const target of ["local", "staging", "production"]) {
  assert.equal(
    code(gate({ EDITORIAL_COPY_TARGET: target, EDITORIAL_COPY_MODE: "dry-run", ...prodApproval }, "postgres://u:p@localhost:5432/woodright_public_production")),
    "refused_db"
  )
}

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
  const base = { EDITORIAL_COPY_TARGET: "production", EDITORIAL_COPY_MODE: mode, EDITORIAL_COPY_INPUT_SHA: SHA }
  assert.equal(code(gate(base, PROD_URL)), "invalid_confirm", mode)
  assert.equal(code(gate({ ...base, EDITORIAL_COPY_CONFIRM: "yes" }, PROD_URL)), "invalid_confirm", mode)
  assert.equal(code(gate({ ...base, EDITORIAL_COPY_CONFIRM: EDITORIAL_COPY_CONFIRM_EXPECTED }, PROD_URL)), "invalid_ack", mode)
  const ok = gate({ ...base, ...prodApproval }, PROD_URL)
  assert.equal(ok.ok, true, mode)
}
assert.equal(code(gate({ EDITORIAL_COPY_TARGET: "production", EDITORIAL_COPY_MODE: "apply", ...prodApproval }, PROD_URL)), "missing_input_sha")

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
