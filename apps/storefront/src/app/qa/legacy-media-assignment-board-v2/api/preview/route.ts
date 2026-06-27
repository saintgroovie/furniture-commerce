import { NextRequest, NextResponse } from "next/server"
import { legacyMediaQaProdBlocked } from "../_lib/normalized-json-route"
import { legacyMediaQaRepoRootFailurePayload } from "../_lib/furniture-repo-data-root"
import { normalizePreviewRel, readRepoPreviewFile } from "../_lib/preview-serve"

export const dynamic = "force-dynamic"

/**
 * Serves repo-local images for v2 board previews (`?rel=data/raw/...`).
 * Pair with LEGACY_MEDIA_QA_PREVIEW_ROUTE in legacy-board-v2-client-preview.ts.
 */
export async function GET(req: NextRequest) {
  if (legacyMediaQaProdBlocked()) {
    return new NextResponse("Not found", { status: 404 })
  }

  const rel = normalizePreviewRel(req.nextUrl.searchParams.get("rel"))
  if (!rel) {
    return NextResponse.json({ error: "invalid_rel" }, { status: 400 })
  }

  const result = readRepoPreviewFile(rel)
  if (result.ok === false) {
    if (result.status === 500 && result.error === "repo_root_not_resolved") {
      return NextResponse.json(
        legacyMediaQaRepoRootFailurePayload({
          repoRoot: null,
          seedsTried: (result.detail?.checked_paths as string[]) ?? [],
          cwd: String(result.detail?.cwd ?? process.cwd()),
        }),
        { status: 500 }
      )
    }
    if (result.status === 404) {
      return new NextResponse(null, { status: 404 })
    }
    return NextResponse.json({ error: result.error, ...result.detail }, { status: result.status })
  }

  return new NextResponse(new Uint8Array(result.body), {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": "private, max-age=3600",
      "X-Woodright-Preview-Source": "repo-disk",
    },
  })
}
