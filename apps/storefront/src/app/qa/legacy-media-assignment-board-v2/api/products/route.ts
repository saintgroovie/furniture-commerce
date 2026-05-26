import * as fs from "fs"
import * as path from "path"
import { NextResponse } from "next/server"
import { getFurnitureRepoDataResolution, legacyMediaQaRepoRootFailurePayload } from "../_lib/furniture-repo-data-root"
import { legacyMediaQaProdBlocked } from "../_lib/normalized-json-route"

export const dynamic = "force-dynamic"

const BOARD_REL = "data/normalized/legacy-media-board-products.json"
const SEED_REL = "data/normalized/seed-products.json"

function basenameUrl(u: string): string {
  const s = String(u ?? "").split("?")[0]
  const parts = s.split("/")
  return parts[parts.length - 1] || ""
}

export async function GET(): Promise<Response> {
  if (legacyMediaQaProdBlocked()) {
    return new NextResponse("Not found", { status: 404 })
  }

  const resolution = getFurnitureRepoDataResolution()
  const { repoRoot, cwd } = resolution
  if (!repoRoot) {
    return NextResponse.json(legacyMediaQaRepoRootFailurePayload(resolution), { status: 500 })
  }

  const boardAbs = path.join(repoRoot, BOARD_REL)
  const seedAbs = path.join(repoRoot, SEED_REL)
  const useBoard = fs.existsSync(boardAbs)
  const abs = useBoard ? boardAbs : seedAbs
  const rel = useBoard ? BOARD_REL : SEED_REL

  if (!fs.existsSync(abs)) {
    return NextResponse.json(
      {
        error: "missing_file",
        missing_file: rel,
        resolved_repo_root: repoRoot,
        cwd,
        absolute_path_checked: abs,
        hint: `Expected ${BOARD_REL} or ${SEED_REL}`,
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

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
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

  const rows: unknown[] = useBoard
    ? ((parsed as { products?: unknown[] }).products ?? [])
    : Array.isArray(parsed)
      ? parsed
      : []

  if (!Array.isArray(rows) || (!useBoard && rows.length === 0)) {
    return NextResponse.json(
      {
        error: useBoard ? "invalid_board_products_shape" : "invalid_seed_shape",
        path: rel,
        resolved_repo_root: repoRoot,
      },
      { status: 500 }
    )
  }

  const products = rows.map((r) => {
    const row = r as Record<string, unknown>
    const handle = String(row.handle ?? row.medusa_product_handle ?? "").trim().toLowerCase()
    const urls: string[] = []
    const existing = (row.image_urls as string[] | undefined) ?? []
    for (const u of existing) urls.push(String(u))
    if (row.thumbnail_url) urls.push(String(row.thumbnail_url))
    if (row.main_image_url) urls.push(String(row.main_image_url))
    const imgs = (row.images as { url?: string }[] | undefined) ?? []
    for (const im of imgs) {
      if (im?.url) urls.push(String(im.url))
    }
    return {
      handle,
      sku: String(row.sku ?? row.medusa_variant_sku ?? row.product_code_normalized ?? "").trim(),
      collection: String(row.collection ?? row.medusa_collection_handle ?? "").trim().toLowerCase(),
      title:
        row.title != null
          ? String(row.title)
          : row.medusa_product_title != null
            ? String(row.medusa_product_title)
            : null,
      image_urls: urls,
      image_basenames: urls.map((u) => basenameUrl(u).toLowerCase()).filter(Boolean),
      qa_product_source: row.qa_product_source != null ? String(row.qa_product_source) : null,
    }
  })

  return new NextResponse(JSON.stringify({ products }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=60" },
  })
}
