/**
 * Launch-mode parsing helpers used by indexing policy.
 * Kept separate from launch-contract asserts/origins so robots/sitemap do not
 * pull scheme-qualified demo URL literals into production_candidate bundles.
 */

export type LaunchMode = "private_noindex" | "public_indexable"

export function launchModeToIndexingMode(mode: LaunchMode): "noindex" | "index" {
  return mode === "public_indexable" ? "index" : "noindex"
}

/** Parse without throwing - `undefined` for empty/unknown. */
export function parseLaunchModeLenient(
  raw: string | undefined | null
): LaunchMode | undefined {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase()
  if (value === "private_noindex" || value === "public_indexable") {
    return value
  }
  return undefined
}
