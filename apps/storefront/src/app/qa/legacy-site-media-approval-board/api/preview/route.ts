import * as fs from "fs"
import * as path from "path"
import { NextRequest, NextResponse } from "next/server"
import { getDataRepoRoot } from "../_lib/data-repo-root"
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
  const repoRel = req.nextUrl.searchParams.get("repoRel")?.trim()
  const remote = req.nextUrl.searchParams.get("url")?.trim()

  // Legacy CMS remote fetch: hostname allowlist only (no scheme-qualified apex
  // string in this module - keeps public_demo contamination gate honest).
  let remoteUrl: URL | null = null
  if (remote) {
    try {
      remoteUrl = new URL(remote)
    } catch {
      remoteUrl = null
    }
  }
  const remoteHost = remoteUrl?.hostname.toLowerCase() ?? ""
  const allowLegacyCmsRemote =
    remoteUrl?.protocol === "https:" &&
    (remoteHost === "woodright.ru" || remoteHost === "www.woodright.ru")
  if (remote && remoteUrl && allowLegacyCmsRemote) {
    try {
      const res = await fetch(remoteUrl.toString(), {
        signal: AbortSignal.timeout(60000),
        headers: { "User-Agent": "WoodrightApprovalBoard/1.0" },
      })
      if (!res.ok) return new NextResponse(null, { status: res.status })
      const buf = Buffer.from(await res.arrayBuffer())
      const ext = path.extname(remoteUrl.pathname).toLowerCase()
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

  if (repoRel && !repoRel.includes("..")) {
    const dataRoot = getDataRepoRoot().dataRepoRoot
    if (dataRoot) {
      const absRepo = path.resolve(dataRoot, repoRel)
      if (absRepo.startsWith(dataRoot + path.sep) && fs.existsSync(absRepo)) {
        const ext = path.extname(absRepo).toLowerCase()
        const buf = fs.readFileSync(absRepo)
        return new NextResponse(buf, {
          headers: {
            "Content-Type": MIME[ext] || "application/octet-stream",
            "Cache-Control": "private, max-age=86400",
          },
        })
      }
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
