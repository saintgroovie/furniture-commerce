import * as fs from "fs"
import * as path from "path"
import { NextResponse } from "next/server"
import {
  AFFECTED_HANDLES_REL,
  FILLED_CSV,
  TEMPLATE_JSON,
  getMatrixRepoResolution,
  matrixFile,
} from "../_lib/matrix-repo-root"
import { parseCsv } from "../_lib/matrix-csv"
import { matrixBoardProdBlocked, matrixBoardProdBlockedResponse } from "../_lib/prod-guard"
import { buildMediaPreviewUrls } from "../../matrix-media-urls"
import type { MatrixBootstrap, MatrixRow } from "../../matrix-board-types"

export const dynamic = "force-dynamic"

function staticCollectionForHandle(handle: string): string {
  return handle === "mo-02-1" ? "molly" : "willie-winkie"
}

function enrichMedia(repoRoot: string, rows: MatrixRow[]): MatrixRow[] {
  let handlesFile: { handles?: Array<{ handle: string; filenames?: string[] }> } = {}
  const affPath = path.join(repoRoot, AFFECTED_HANDLES_REL)
  if (fs.existsSync(affPath)) {
    try {
      handlesFile = JSON.parse(fs.readFileSync(affPath, "utf8"))
    } catch {
      /* ignore */
    }
  }
  const byHandle = new Map((handlesFile.handles || []).map((h) => [h.handle, h.filenames || []]))

  return rows.map((row) => {
    const filenames = byHandle.get(row.handle) || []
    const collection = staticCollectionForHandle(row.handle)
    const media = buildMediaPreviewUrls(collection, filenames)
    return {
      ...row,
      media_filenames: filenames,
      media_static_paths: media.media_static_paths,
      media_preview_urls: media.media_preview_urls,
      media_open_urls: media.media_open_urls,
    }
  })
}

export async function GET() {
  if (matrixBoardProdBlocked()) return matrixBoardProdBlockedResponse()

  const resolution = getMatrixRepoResolution()
  if (!resolution.repoRoot || !resolution.matrixDir) {
    return NextResponse.json(
      {
        error: "matrix_template_not_found",
        hint: "Set FURNITURE_REPO_ROOT to repo with tmp/willie-winkie-flow-a-matrix-template/",
        cwd: resolution.cwd,
        checked_paths: resolution.seedsTried,
      },
      { status: 404 }
    )
  }

  const filledPath = matrixFile(resolution.repoRoot, FILLED_CSV)
  const templateJsonPath = matrixFile(resolution.repoRoot, TEMPLATE_JSON)

  try {
    const csv = fs.readFileSync(filledPath, "utf8")
    let rows = parseCsv(csv)
    rows = enrichMedia(resolution.repoRoot, rows)

    let templateMeta: Record<string, unknown> = {}
    let governance: Record<string, unknown> = {}
    let acceptable_values: Record<string, string[]> = {}
    if (fs.existsSync(templateJsonPath)) {
      const tj = JSON.parse(fs.readFileSync(templateJsonPath, "utf8")) as Record<string, unknown>
      templateMeta = tj
      governance = (tj.governance as Record<string, unknown>) || {}
      acceptable_values = (tj.acceptable_values as Record<string, string[]>) || {}
    }

    const payload: MatrixBootstrap = {
      generated_at: new Date().toISOString(),
      repo_root: resolution.repoRoot,
      filled_csv_path: filledPath,
      template_meta: templateMeta,
      rows,
      governance,
      acceptable_values,
    }

    return NextResponse.json(payload)
  } catch (e) {
    return NextResponse.json({ error: "read_failed", message: String(e) }, { status: 500 })
  }
}
