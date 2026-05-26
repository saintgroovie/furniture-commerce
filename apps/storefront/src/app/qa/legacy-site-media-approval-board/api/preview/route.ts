import * as fs from "fs"
import * as path from "path"
import { NextRequest, NextResponse } from "next/server"
import { approvalPackDir, getEmergencyFixRepoResolution } from "../_lib/emergency-fix-repo-root"

export const dynamic = "force-dynamic"

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
}

export async function GET(req: NextRequest) {
  const resolution = getEmergencyFixRepoResolution()
  if (!resolution.repoRoot) {
    return NextResponse.json({ error: "approval_pack_not_found" }, { status: 404 })
  }

  const rel = req.nextUrl.searchParams.get("path")?.trim()
  const remote = req.nextUrl.searchParams.get("url")?.trim()

  if (remote && /^https:\/\/woodright\.ru\//i.test(remote)) {
    try {
      const res = await fetch(remote, {
        signal: AbortSignal.timeout(60000),
        headers: { "User-Agent": "WoodrightApprovalBoard/1.0" },
      })
      if (!res.ok) return new NextResponse(null, { status: res.status })
      const buf = Buffer.from(await res.arrayBuffer())
      const ext = path.extname(new URL(remote).pathname).toLowerCase()
      return new NextResponse(buf, {
        headers: {
          "Content-Type": MIME[ext] || "image/jpeg",
          "Cache-Control": "private, max-age=3600",
        },
      })
    } catch {
      return new NextResponse(null, { status: 502 })
    }
  }

  if (!rel || rel.includes("..")) {
    return NextResponse.json({ error: "invalid_path" }, { status: 400 })
  }

  const packDir = approvalPackDir(resolution.repoRoot)
  const abs = path.resolve(packDir, rel)
  if (!abs.startsWith(packDir + path.sep) && abs !== packDir) {
    return NextResponse.json({ error: "path_escape" }, { status: 400 })
  }
  if (!fs.existsSync(abs)) {
    return new NextResponse(null, { status: 404 })
  }

  const ext = path.extname(abs).toLowerCase()
  const buf = fs.readFileSync(abs)
  return new NextResponse(buf, {
    headers: {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "private, max-age=86400",
    },
  })
}
