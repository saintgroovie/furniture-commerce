import * as fs from "fs"
import * as path from "path"
import { NextResponse } from "next/server"
import { getFurnitureRepoDataResolution } from "@/lib/qa/furniture-repo-data-root"

export const dynamic = "force-dynamic"

const REL = "data/normalized/legacy-media-product-candidate-map.json"

function prodBlocked(): boolean {
  return process.env.NODE_ENV === "production" && process.env.LEGACY_MEDIA_QA_BOARD_ALLOW_PROD !== "1"
}

export async function GET(): Promise<Response> {
  if (prodBlocked()) {
    return new NextResponse("Not found", { status: 404 })
  }
  const { repoRoot } = getFurnitureRepoDataResolution()
  if (!repoRoot) {
    return NextResponse.json({ error: "Repo root not resolved" }, { status: 500 })
  }
  const abs = path.join(repoRoot, REL)
  try {
    const raw = fs.readFileSync(abs, "utf8")
    JSON.parse(raw)
    return new NextResponse(raw, {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=30" },
    })
  } catch {
    return NextResponse.json({ error: "Candidate map file missing or invalid", path: REL }, { status: 404 })
  }
}
