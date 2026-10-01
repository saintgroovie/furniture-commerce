/**
 * Promotion design for workspace_it-guarded migrations.
 * Live apply stays disabled. down() drops tables and is not a data rollback.
 * Recovery is a backup plus a forward fix.
 */

export type PromotionInput = {
  environment?: string | null
  databaseName?: string | null
  expectedDatabaseName?: string | null
  runtimeRole?: string | null
  expectedRuntimeRole?: string | null
  governanceToken?: string | null
  migrationSha?: string | null
  expectedMigrationSha?: string | null
  applyRequested?: boolean
}

export type PromotionDecision = {
  ok: false
  reasons: string[]
}

export function decideMigrationPromotion(input: PromotionInput): PromotionDecision {
  const reasons: string[] = []
  if (input.environment !== "production") reasons.push("environment")
  if (!input.databaseName || input.databaseName !== input.expectedDatabaseName) {
    reasons.push("database_name")
  }
  if (!input.runtimeRole || input.runtimeRole !== input.expectedRuntimeRole) {
    reasons.push("runtime_role")
  }
  if (!input.governanceToken || input.governanceToken.length < 16) reasons.push("governance_token")
  if (!input.migrationSha || input.migrationSha !== input.expectedMigrationSha) {
    reasons.push("migration_sha")
  }
  reasons.push("live_apply_disabled")
  if (input.applyRequested) reasons.push("apply_requested_but_refused")
  return { ok: false, reasons }
}
