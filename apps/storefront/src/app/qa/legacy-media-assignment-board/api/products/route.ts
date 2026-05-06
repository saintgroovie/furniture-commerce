import * as fs from "fs"
import * as path from "path"
import { NextResponse } from "next/server"
import { getFurnitureRepoDataResolution, legacyMediaQaRepoRootFailurePayload } from "@/lib/qa/furniture-repo-data-root"

export const dynamic = "force-dynamic"

const REL = "data/normalized/seed-products.json"

function prodBlocked(): boolean {
  return process.env.NODE_ENV === "production" && process.env.LEGACY_MEDIA_QA_BOARD_ALLOW_PROD !== "1"
}

function basenameUrl(u: string): string {
  const s = String(u ?? "").split("?")[0]
  const parts = s.split("/")
  return parts[parts.length - 1] || ""
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
        error: "missing_file",
        missing_file: REL,
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
        missing_file: REL,
        resolved_repo_root: repoRoot,
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }

  let rows: unknown
  try {
    rows = JSON.parse(raw)
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

  if (!Array.isArray(rows)) {
    return NextResponse.json(
      {
        error: "invalid_seed_shape",
        path: REL,
        resolved_repo_root: repoRoot,
        detail: "Expected JSON array of product rows",
      },
      { status: 500 }
    )
  }

  const products = rows.map((r) => {
    const row = r as Record<string, unknown>
    const handle = String(row.medusa_product_handle ?? "").trim().toLowerCase()
    const urls: string[] = []
    if (row.thumbnail_url) urls.push(String(row.thumbnail_url))
    const imgs = (row.images as { url?: string }[] | undefined) ?? []
    for (const im of imgs) {
      if (im?.url) urls.push(String(im.url))
    }
    return {
      handle,
      sku: String(row.medusa_variant_sku ?? row.product_code_normalized ?? "").trim(),
      collection: String(row.medusa_collection_handle ?? "").trim().toLowerCase(),
      title: row.medusa_product_title != null ? String(row.medusa_product_title) : null,
      image_urls: urls,
      image_basenames: urls.map((u) => basenameUrl(u).toLowerCase()).filter(Boolean),
    }
  })
  const body = JSON.stringify({ products })
  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=60" },
  })
}
