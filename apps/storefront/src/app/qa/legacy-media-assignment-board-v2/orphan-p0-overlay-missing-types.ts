export type OrphanP0OverlayMissingArtifact = {
  available: false
  error: "missing_overlay_artifact"
  repo_root: string
  overlay_data_path: string
  expected_path: string
  do_not_auto_apply: true
  rebuild_instructions: string
  source_chain: string[]
  message: string
}

export function isOrphanP0OverlayMissingArtifact(
  value: unknown
): value is OrphanP0OverlayMissingArtifact {
  if (!value || typeof value !== "object") return false
  const v = value as OrphanP0OverlayMissingArtifact
  return v.available === false && v.error === "missing_overlay_artifact"
}
