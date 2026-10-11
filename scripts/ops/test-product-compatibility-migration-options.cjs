"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")
const fs = require("node:fs")
const runner = require(path.join(
  __dirname,
  "../../ops/release/woodright-product-compatibility-migration.cjs"
))

test("accepts only the product compatibility migration", () => {
  assert.deepEqual(runner.buildUpOptions(runner.ALLOWED_MIGRATION), {
    migrations: ["Migration20261005120000"],
  })
})

test("refuses the workflow primary key migration", () => {
  assert.throws(
    () => runner.buildUpOptions("Migration20250505101505"),
    /REFUSED_TARGETED_MIGRATION_NOT_ALLOWED/
  )
})

test("refuses the promotion slot migration", () => {
  assert.throws(
    () => runner.buildUpOptions("Migration20260908120000"),
    /REFUSED_TARGETED_MIGRATION_NOT_ALLOWED/
  )
})

test("discovery stays inside product-compatibility migrations", () => {
  assert.equal(
    runner.assertMigrationsDir("/server/src/modules/product-compatibility/migrations"),
    runner.ALLOWED_MIGRATIONS_DIR
  )
  for (const dir of [
    "/server/src/modules/promotion-slot/migrations",
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
    runner.assertMigrationResult(["Migration20261005120000"], ["Migration20261005120000"]),
    ["Migration20261005120000"]
  )
  assert.throws(
    () => runner.assertMigrationResult(
      ["Migration20261005120000", "Migration20250505101505"],
      ["Migration20261005120000"]
    ),
    /UNEXPECTED_RESULT/
  )
  assert.throws(
    () => runner.assertMigrationResult(
      ["Migration20261005120000"],
      ["Migration20250505101505"]
    ),
    /UNEXPECTED_MIGRATION/
  )
  assert.throws(
    () => runner.assertMigrationResult(["Migration20261005120000"], []),
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
})

test("runner source has no down path and redacts credentials", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../../ops/release/woodright-product-compatibility-migration.cjs"),
    "utf8"
  )
  assert.equal(source.includes("migrations.revert"), false)
  assert.equal(source.includes(".down("), false)
  assert.equal(
    runner.redact("failed postgres://woodright:secret@127.0.0.1:5432/woodright_public_production"),
    "failed postgres://redacted@127.0.0.1:5432/woodright_public_production"
  )
  assert.equal(source.includes("medusa db:migrate"), false)
})
