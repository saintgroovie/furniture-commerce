import * as fs from "fs"
import * as path from "path"
import { NextResponse } from "next/server"
import { getFurnitureRepoDataResolution } from "@/lib/qa/furniture-repo-data-root"

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
  const { repoRoot } = getFurnitureRepoDataResolution()
  if (!repoRoot) {
    return NextResponse.json({ error: "Repo root not resolved" }, { status: 500 })
  }
  const abs = path.join(repoRoot, REL)
  try {
    const rows = JSON.parse(fs.readFileSync(abs, "utf8")) as unknown[]
    if (!Array.isArray(rows)) {
      return NextResponse.json({ error: "Invalid seed shape" }, { status: 500 })
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
  } catch {
    return NextResponse.json({ error: "Seed file missing or invalid", path: REL }, { status: 404 })
  }
}
