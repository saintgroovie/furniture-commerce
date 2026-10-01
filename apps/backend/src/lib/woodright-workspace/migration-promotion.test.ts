import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { decideMigrationPromotion } from "./migration-promotion.ts"

describe("migration promotion", () => {
  it("refuses live apply even when every other condition matches", () => {
    const decision = decideMigrationPromotion({
      environment: "production",
      databaseName: "woodright",
      expectedDatabaseName: "woodright",
      runtimeRole: "production",
      expectedRuntimeRole: "production",
      governanceToken: "0123456789abcdef",
      migrationSha: "abc",
      expectedMigrationSha: "abc",
      applyRequested: true,
    })
    assert.equal(decision.ok, false)
    assert.ok(decision.reasons.includes("live_apply_disabled"))
    assert.ok(decision.reasons.includes("apply_requested_but_refused"))
  })
})
