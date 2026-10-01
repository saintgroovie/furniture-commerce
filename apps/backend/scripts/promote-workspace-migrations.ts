import { decideMigrationPromotion } from "../src/lib/woodright-workspace/migration-promotion"

/**
 * Explicit promotion check. This command never runs migrations.
 * Recovery if a later apply goes wrong: restore a backup, then ship a forward fix.
 * down() on the desk tables drops data. It is not a safe rollback.
 */
const decision = decideMigrationPromotion({
  environment: process.env.WOODRIGHT_MIGRATION_ENVIRONMENT,
  databaseName: process.env.WOODRIGHT_MIGRATION_DATABASE_NAME,
  expectedDatabaseName: process.env.WOODRIGHT_MIGRATION_EXPECTED_DATABASE_NAME,
  runtimeRole: process.env.WOODRIGHT_RUNTIME_ROLE,
  expectedRuntimeRole: process.env.WOODRIGHT_MIGRATION_EXPECTED_RUNTIME_ROLE,
  governanceToken: process.env.WOODRIGHT_MIGRATION_GOVERNANCE_TOKEN,
  migrationSha: process.env.WOODRIGHT_MIGRATION_SHA,
  expectedMigrationSha: process.env.WOODRIGHT_MIGRATION_EXPECTED_SHA,
  applyRequested: process.argv.includes("--apply"),
})

console.log(
  JSON.stringify({
    ok: decision.ok,
    reasons: decision.reasons,
    recovery: "backup_and_forward_fix",
    live_apply: "disabled",
  })
)
process.exit(1)
