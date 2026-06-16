import { NextResponse } from "next/server"
import * as fs from "fs"
import * as path from "path"
import {
  getFurnitureRepoDataResolution,
  legacyMediaQaRepoRootFailurePayload,
  ORPHAN_P0_OVERLAY_DATA_REL,
} from "../_lib/furniture-repo-data-root"

const REBUILD_COMMAND =
  "node tmp/orphan-p0-refresh-2026-06-11/operator-decisions-top-50/assignment-board-candidate-pack/v2-overlay/build-orphan-p0-v2-overlay-data.mjs"

const SOURCE_CHAIN = [
  "tmp/orphan-p0-refresh-2026-06-11/operator-decisions-top-50/assignment-board-candidate-pack/catalog-handle-mapping/sku-to-catalog-handle-mapping.json",
  "tmp/orphan-p0-refresh-2026-06-11/operator-decisions-top-50/assignment-board-candidate-pack/catalog-handle-mapping/unresolved-enrichment/unresolved-catalog-handle-enrichment.json",
]

function missingArtifactPayload(repoRoot: string) {
  return {
    available: false as const,
    error: "missing_overlay_artifact" as const,
    repo_root: repoRoot,
    overlay_data_path: ORPHAN_P0_OVERLAY_DATA_REL,
    expected_path: path.join(repoRoot, ORPHAN_P0_OVERLAY_DATA_REL),
    do_not_auto_apply: true as const,
    rebuild_instructions: REBUILD_COMMAND,
    source_chain: SOURCE_CHAIN,
    message:
      "Run the Orphan P0 overlay build step. No routing is available until the artifact exists.",
  }
}

export function GET() {
  const resolution = getFurnitureRepoDataResolution()
  const { repoRoot } = resolution
  if (!repoRoot) {
    return NextResponse.json(legacyMediaQaRepoRootFailurePayload(resolution), { status: 500 })
  }

  const abs = path.join(repoRoot, ORPHAN_P0_OVERLAY_DATA_REL)
  if (!fs.existsSync(abs)) {
    return NextResponse.json(missingArtifactPayload(repoRoot), { status: 404 })
  }

  let raw: string
  try {
    raw = fs.readFileSync(abs, "utf8")
  } catch (err) {
    return NextResponse.json(
      {
        error: "read_failed",
        message: err instanceof Error ? err.message : String(err),
        repo_root: repoRoot,
        overlay_data_path: ORPHAN_P0_OVERLAY_DATA_REL,
      },
      { status: 500 }
    )
  }

  let data: Record<string, unknown>
  try {
    data = JSON.parse(raw) as Record<string, unknown>
  } catch (err) {
    return NextResponse.json(
      {
        error: "parse_error",
        parse_error: err instanceof Error ? err.message : String(err),
        repo_root: repoRoot,
        overlay_data_path: ORPHAN_P0_OVERLAY_DATA_REL,
      },
      { status: 500 }
    )
  }

  return NextResponse.json(
    {
      ...data,
      available: true,
      repo_root: repoRoot,
      overlay_data_path: ORPHAN_P0_OVERLAY_DATA_REL,
    },
    {
      status: 200,
      headers: { "Cache-Control": "private, max-age=15" },
    }
  )
}
