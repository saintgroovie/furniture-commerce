"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")
const { buildUpOptions, ALLOWED_MIGRATION } = require(path.join(
  __dirname,
  "../../ops/release/woodright-targeted-migration.cjs"
))

test("accepts only the promotion slot migration", () => {
  assert.deepEqual(buildUpOptions(ALLOWED_MIGRATION), {
    migrations: ["Migration20260908120000"],
  })
})

test("refuses the workflow primary key migration", () => {
  assert.throws(
    () => buildUpOptions("Migration20250505101505"),
    /REFUSED_MIGRATION/
  )
})

test("refuses an unknown migration", () => {
  assert.throws(() => buildUpOptions("Migration19990101000000"), /REFUSED_MIGRATION/)
})
