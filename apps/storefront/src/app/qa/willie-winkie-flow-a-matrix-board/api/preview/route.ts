import { NextResponse } from "next/server"
import {
  isAllowedStaticProductPath,
  resolveInternalStaticBase,
} from "../../matrix-media-urls"
import { matrixBoardProdBlocked, matrixBoardProdBlockedResponse } from "../_lib/prod-guard"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  if (matrixBoardProdBlocked()) return matrixBoardProdBlockedResponse()

  const path = new URL(request.url).searchParams.get("path")?.trim() || ""
  if (!isAllowedStaticProductPath(path)) {
    return NextResponse.json({ error: "invalid_path" }, { status: 400 })
  }

  const upstream = `${resolveInternalStaticBase()}${path}`

  try {
    const res = await fetch(upstream, {
      signal: AbortSignal.timeout(10000),
      headers: { Accept: "image/*,*/*" },
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: "upstream_static_unavailable", status: res.status, path },
        { status: 502 }
      )
    }

    const body = await res.arrayBuffer()
    const contentType = res.headers.get("content-type") || "application/octet-stream"

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=120",
      },
    })
  } catch (e) {
    return NextResponse.json(
      { error: "preview_fetch_failed", message: String(e), path },
      { status: 502 }
    )
  }
}
