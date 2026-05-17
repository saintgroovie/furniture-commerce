import * as fs from "fs"
import * as path from "path"
import { NextResponse } from "next/server"
import { getFurnitureRepoDataResolution, legacyMediaQaRepoRootFailurePayload } from "@/lib/qa/furniture-repo-data-root"

export const dynamic = "force-dynamic"

const REL = "data/normalized/legacy-media-preview-recovery-map.json"

function prodBlocked(): boolean {
  return process.env.NODE_ENV === "production" && process.env.LEGACY_MEDIA_QA_BOARD_ALLOW_PROD !== "1"
}

export async function GET(): Promise<Response> {
  if (prodBlocked()) {
    return new NextResponse("Not found", { status: 404 })
  }

  const resolution = getFurnitureRepoDataResolution()
  const { repoRoot, cwd } = resolution
  if (!repoRoot) {
    return NextResponse.json(legacyMediaQaRepoRootFailurePayload(resolution), { status: 500 })
  }

  const abs = path.join(repoRoot, REL)
  if (!fs.existsSync(abs)) {
    return NextResponse.json(
      {
        audit_meta: { entry_count: 0, missing_file: REL },
        entries: {},
        resolved_repo_root: repoRoot,
        cwd,
      },
      { status: 200, headers: { "Cache-Control": "private, max-age=30" } }
    )
  }

  try {
    const raw = fs.readFileSync(abs, "utf8")
    JSON.parse(raw)
    return new NextResponse(raw, {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=30" },
    })
  } catch (err) {
    return NextResponse.json(
      {
        error: "parse_error",
        parse_error: err instanceof Error ? err.message : String(err),
        path: REL,
        resolved_repo_root: repoRoot,
      },
      { status: 500 }
    )
  }
}
