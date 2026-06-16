import { NextResponse } from "next/server"
import * as fs from "fs"
import * as path from "path"
import {
  getFurnitureRepoDataResolution,
  legacyMediaQaRepoRootFailurePayload,
  ORPHAN_P0_OVERLAY_DATA_REL,
} from "../_lib/furniture-repo-data-root"

export function GET() {
  const resolution = getFurnitureRepoDataResolution()
  const { repoRoot } = resolution
  if (!repoRoot) {
    return NextResponse.json(legacyMediaQaRepoRootFailurePayload(resolution), { status: 500 })
  }

  const abs = path.join(repoRoot, ORPHAN_P0_OVERLAY_DATA_REL)
  if (!fs.existsSync(abs)) {
    return NextResponse.json(
      {
        error: "missing_overlay_file",
        missing_file: ORPHAN_P0_OVERLAY_DATA_REL,
        repo_root: repoRoot,
        overlay_data_path: ORPHAN_P0_OVERLAY_DATA_REL,
        hint: "Run build-orphan-p0-v2-overlay-data.mjs in tmp first.",
      },
      { status: 500 }
    )
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
      repo_root: repoRoot,
      overlay_data_path: ORPHAN_P0_OVERLAY_DATA_REL,
    },
    {
      status: 200,
      headers: { "Cache-Control": "private, max-age=15" },
    }
  )
}
