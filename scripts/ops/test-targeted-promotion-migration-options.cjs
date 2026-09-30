"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")
const fs = require("node:fs")
const runner = require(path.join(__dirname, "../../ops/release/woodright-targeted-migration.cjs"))

test("accepts only the promotion slot migration", () => {
  assert.deepEqual(runner.buildUpOptions(runner.ALLOWED_MIGRATION), {
    migrations: ["Migration20260908120000"],
  })
})

test("refuses the workflow primary key migration", () => {
  assert.throws(
    () => runner.buildUpOptions("Migration20250505101505"),
    /REFUSED_MIGRATION/
  )
})

test("refuses an unknown migration", () => {
  assert.throws(() => runner.buildUpOptions("Migration19990101000000"), /REFUSED_MIGRATION/)
})

test("discovery stays inside promotion-slot migrations", () => {
  assert.equal(
    runner.assertMigrationsDir("/server/src/modules/promotion-slot/migrations"),
    runner.ALLOWED_MIGRATIONS_DIR
  )
  for (const dir of [
    "/server/node_modules/@medusajs/workflow-engine-redis/dist/migrations",
    "/server/node_modules/@medusajs/index/dist/migrations",
    "/server/node_modules/@medusajs/translation/dist/migrations",
    "/server/node_modules/@medusajs/rbac/dist/migrations",
  ]) {
    assert.throws(() => runner.assertMigrationsDir(dir), /REFUSED_MIGRATIONS_DIR/)
  }
})

test("result guard rejects any other migration name", () => {
  assert.deepEqual(
    runner.assertMigrationResult(["Migration20260908120000"], ["Migration20260908120000"]),
    ["Migration20260908120000"]
  )
  assert.throws(
    () => runner.assertMigrationResult(
      ["Migration20260908120000", "Migration20250505101505"],
      ["Migration20260908120000"]
    ),
    /UNEXPECTED_RESULT/
  )
  assert.throws(
    () => runner.assertMigrationResult(
      ["Migration20260908120000"],
      ["Migration20250505101505"]
    ),
    /UNEXPECTED_MIGRATION/
  )
  assert.throws(
    () => runner.assertMigrationResult(["Migration20260908120000"], []),
    /UNEXPECTED_MIGRATION/
  )
})

test("close errors stay visible unless the connection is already closed", () => {
  assert.equal(runner.isBenignCloseError(new Error("Connection is closed")), true)
  assert.equal(runner.isBenignCloseError(new Error("pool failed")), false)
  assert.doesNotThrow(() => runner.assertCloseOutcome(null, null))
  assert.throws(() => runner.assertCloseOutcome(new Error("pool failed"), null), /ORM_CLOSE_FAILED/)
  assert.throws(
    () => runner.assertCloseOutcome(new Error("pool failed"), new Error("migration exploded")),
    /migration exploded/
  )
  try {
    runner.assertCloseOutcome(new Error("postgres://woodright:secret@127.0.0.1/db"), null)
    assert.fail("close error should fail")
  } catch (error) {
    assert.match(error.message, /postgres:\/\/redacted@/)
    assert.equal(error.message.includes("secret"), false)
  }
})

test("runner source has no down path and redacts credentials", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../ops/release/woodright-targeted-migration.cjs"), "utf8")
  assert.equal(source.includes("migrations.revert"), false)
  assert.equal(source.includes("WOODRIGHT_TARGETED_MIGRATION_DIRECTION"), false)
  assert.equal(
    runner.redact("failed postgres://woodright:secret@127.0.0.1:5432/woodright_public_production"),
    "failed postgres://redacted@127.0.0.1:5432/woodright_public_production"
  )
})
