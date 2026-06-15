import * as fs from "fs"
import * as path from "path"
import { NextResponse } from "next/server"
import {
  contentTypeForStaticPath,
  isAllowedStaticProductPath,
  resolveInternalStaticBase,
  staticPathToDiskRelative,
} from "../../matrix-media-urls"
import { getMatrixRepoResolution } from "../_lib/matrix-repo-root"
import { matrixBoardProdBlocked, matrixBoardProdBlockedResponse } from "../_lib/prod-guard"

export const dynamic = "force-dynamic"

async function serveFromUpstream(staticPath: string): Promise<NextResponse> {
  const upstream = `${resolveInternalStaticBase()}${staticPath}`
  const res = await fetch(upstream, {
    signal: AbortSignal.timeout(10000),
    headers: { Accept: "image/*,*/*" },
  })

  if (!res.ok) {
    return NextResponse.json(
      { error: "upstream_static_unavailable", status: res.status, path: staticPath },
      { status: 502 }
    )
  }

  const body = await res.arrayBuffer()
  const contentType = res.headers.get("content-type") || contentTypeForStaticPath(staticPath)

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=120",
      "X-Woodright-Preview-Source": "upstream",
    },
  })
}

export async function GET(request: Request) {
  if (matrixBoardProdBlocked()) return matrixBoardProdBlockedResponse()

  const staticPath = new URL(request.url).searchParams.get("path")?.trim() || ""
  if (!isAllowedStaticProductPath(staticPath)) {
    return NextResponse.json({ error: "invalid_path" }, { status: 400 })
  }

  const diskRel = staticPathToDiskRelative(staticPath)
  const resolution = getMatrixRepoResolution()

  if (diskRel && resolution.repoRoot) {
    const absDisk = path.join(resolution.repoRoot, diskRel)
    const resolved = path.resolve(absDisk)
    const allowedRoot = path.resolve(path.join(resolution.repoRoot, "apps", "backend", "static", "products"))
    if (resolved.startsWith(allowedRoot) && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      const body = fs.readFileSync(resolved)
      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type": contentTypeForStaticPath(staticPath),
          "Cache-Control": "private, max-age=120",
          "X-Woodright-Preview-Source": "disk",
        },
      })
    }
  }

  try {
    return await serveFromUpstream(staticPath)
  } catch (e) {
    return NextResponse.json(
      { error: "preview_fetch_failed", message: String(e), path: staticPath },
      { status: 502 }
    )
  }
}
