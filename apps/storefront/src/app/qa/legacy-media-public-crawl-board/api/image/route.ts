import * as fs from "fs"
import * as path from "path"
import { NextRequest, NextResponse } from "next/server"
import {
  getExportRootResolution,
  isPublicCrawlSite,
  isWithinRoot,
  isWithinRootRealpath,
  publicCrawlBoardProdBlocked,
  siteImagesRoot,
} from "../_lib/public-crawl-export-root"

export const dynamic = "force-dynamic"

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
}

/**
 * Serves a single image file from the private export root for board thumbnails
 * (`?site=woodright-kids.ru&rel=wp-content/uploads/...`).
 *
 * READ-ONLY. Guards: site must be one of the two known public-crawl sites,
 * rel must not contain `..`, and the resolved absolute path must stay inside
 * that site's `raw/public-crawl/{site}/images/` directory.
 */
export async function GET(req: NextRequest): Promise<Response> {
  if (publicCrawlBoardProdBlocked()) {
    return new NextResponse("Not found", { status: 404 })
  }

  const site = req.nextUrl.searchParams.get("site")
  const relRaw = req.nextUrl.searchParams.get("rel")

  if (!isPublicCrawlSite(site)) {
    return NextResponse.json({ error: "invalid_site" }, { status: 400 })
  }
  if (!relRaw) {
    return NextResponse.json({ error: "missing_rel" }, { status: 400 })
  }

  const rel = relRaw.trim().replace(/\\/g, "/").replace(/^\/+/, "")
  if (!rel || rel.includes("..")) {
    return NextResponse.json({ error: "invalid_rel" }, { status: 400 })
  }

  const ext = path.extname(rel).toLowerCase()
  if (!(ext in MIME)) {
    return NextResponse.json({ error: "unsupported_extension", detail: { ext } }, { status: 400 })
  }

  const resolution = getExportRootResolution()
  if (!resolution.exists) {
    return NextResponse.json({ error: "export_root_not_found" }, { status: 500 })
  }

  const imagesRoot = siteImagesRoot(resolution.exportRoot, site)
  const abs = path.resolve(path.join(imagesRoot, rel))

  if (!isWithinRoot(imagesRoot, abs)) {
    return NextResponse.json({ error: "path_escape" }, { status: 400 })
  }

  let stat: fs.Stats
  try {
    // lstat (not stat) — reject if the leaf path component is itself a symlink,
    // rather than silently following it.
    stat = fs.lstatSync(abs)
  } catch {
    return new NextResponse(null, { status: 404 })
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    return new NextResponse(null, { status: 404 })
  }

  // Defense in depth: re-check containment after resolving any symlinked
  // intermediate directories, in case `imagesRoot` itself sits behind a link.
  if (!isWithinRootRealpath(imagesRoot, abs)) {
    return NextResponse.json({ error: "path_escape" }, { status: 400 })
  }

  const body = fs.readFileSync(abs)
  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": MIME[ext],
      "Cache-Control": "private, max-age=3600",
      "X-Woodright-Preview-Source": "public-crawl-export-root",
    },
  })
}
