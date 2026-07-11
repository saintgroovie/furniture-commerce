/**
 * Feature flags for Woodright Admin UX Recovery.
 * Large surfaces must stay behind WOODRIGHT_ADMIN_UX_V1 until validated.
 */

export type WoodrightAdminFeatureFlags = {
  /** Product Workspace, variant matrix, gallery, promotion wizard entry points */
  adminUxV1: boolean
}

export function readWoodrightAdminFeatureFlags(
  env: NodeJS.ProcessEnv = process.env
): WoodrightAdminFeatureFlags {
  const raw = (env.WOODRIGHT_ADMIN_UX_V1 ?? "").trim().toLowerCase()
  return {
    adminUxV1: raw === "1" || raw === "true" || raw === "yes" || raw === "on",
  }
}

export function isWoodrightAdminUxV1Enabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return readWoodrightAdminFeatureFlags(env).adminUxV1
}
