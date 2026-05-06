import * as fs from "fs"
import * as path from "path"
import { NextResponse } from "next/server"
import { getFurnitureRepoDataResolution, legacyMediaQaRepoRootFailurePayload } from "@/lib/qa/furniture-repo-data-root"
import {
  LEGACY_MEDIA_QA_PREVIEW_ALLOWED_REL_PREFIXES,
  legacyMediaBoardImageContentType,
} from "@/lib/qa/legacy-media-assignment-preview"

export const dynamic = "force-dynamic"

function isProdBlocked(): boolean {
  return process.env.NODE_ENV === "production" && process.env.LEGACY_MEDIA_QA_BOARD_ALLOW_PROD !== "1"
}

function normalizeRel(rel: string): string | null {
  const s = rel.trim().replace(/\\/g, "/").replace(/^\//, "")
  if (!s || s.includes("..")) return null
  return s
}

function isAllowedRel(rel: string): boolean {
  const ok = LEGACY_MEDIA_QA_PREVIEW_ALLOWED_REL_PREFIXES.some((p) => rel.startsWith(p))
  if (!ok) return false
  if (rel.startsWith("data/raw/front/") && rel.endsWith(".json")) return false
  return true
}

export async function GET(req: Request): Promise<Response> {
  if (isProdBlocked()) {
    return new NextResponse("Not found", { status: 404 })
  }

  const url = new URL(req.url)
  const relRaw = url.searchParams.get("rel") ?? ""
  const rel = normalizeRel(relRaw)
  if (!rel || !isAllowedRel(rel)) {
    return NextResponse.json({ error: "Invalid or disallowed rel path" }, { status: 400 })
  }

  const resolution = getFurnitureRepoDataResolution()
  const { repoRoot } = resolution
  if (!repoRoot) {
    return NextResponse.json(legacyMediaQaRepoRootFailurePayload(resolution), { status: 500 })
  }

  const abs = path.join(repoRoot, rel)
  const resolved = path.resolve(abs)
  const rootResolved = path.resolve(repoRoot)
  if (!resolved.startsWith(rootResolved + path.sep) && resolved !== rootResolved) {
    return NextResponse.json({ error: "Path escapes repo root" }, { status: 400 })
  }

  let st: fs.Stats
  try {
    st = fs.statSync(resolved)
  } catch {
    return NextResponse.json({ error: "File not found", rel }, { status: 404 })
  }
  if (!st.isFile()) {
    return NextResponse.json({ error: "Not a file" }, { status: 400 })
  }

  const buf = fs.readFileSync(resolved)
  const ct = legacyMediaBoardImageContentType(resolved)
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": ct,
      "Cache-Control": "private, max-age=60",
    },
  })
}
