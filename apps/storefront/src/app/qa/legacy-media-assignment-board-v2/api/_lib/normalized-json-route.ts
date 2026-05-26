import * as fs from "fs"
import * as path from "path"
import { NextResponse } from "next/server"
import { getFurnitureRepoDataResolution, legacyMediaQaRepoRootFailurePayload } from "./furniture-repo-data-root"

export function legacyMediaQaProdBlocked(): boolean {
  return process.env.NODE_ENV === "production" && process.env.LEGACY_MEDIA_QA_BOARD_ALLOW_PROD !== "1"
}

export function readNormalizedJsonPassthrough(rel: string, cacheMaxAge = 30): Response {
  const resolution = getFurnitureRepoDataResolution()
  const { repoRoot, cwd } = resolution
  if (!repoRoot) {
    return NextResponse.json(legacyMediaQaRepoRootFailurePayload(resolution), { status: 500 })
  }

  const abs = path.join(repoRoot, rel)
  if (!fs.existsSync(abs)) {
    return NextResponse.json(
      {
        error: "missing_file",
        missing_file: rel,
        resolved_repo_root: repoRoot,
        cwd,
        absolute_path_checked: abs,
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
        missing_file: rel,
        resolved_repo_root: repoRoot,
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }

  try {
    JSON.parse(raw)
  } catch (err) {
    return NextResponse.json(
      {
        error: "parse_error",
        parse_error: err instanceof Error ? err.message : String(err),
        path: rel,
        resolved_repo_root: repoRoot,
      },
      { status: 500 }
    )
  }

  return new NextResponse(raw, {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": `private, max-age=${cacheMaxAge}` },
  })
}
