import * as fs from "fs"
import { NextResponse } from "next/server"
import {
  approvalPackDir,
  getEmergencyFixRepoResolution,
} from "../_lib/emergency-fix-repo-root"

export const dynamic = "force-dynamic"

export async function GET() {
  const resolution = getEmergencyFixRepoResolution()
  if (!resolution.repoRoot || !resolution.approvalPackPath) {
    return NextResponse.json(
      {
        error: "approval_pack_not_found",
        hint: "Build approval pack under tmp/legacy-site-media-approval-pack/ (designer-approval-checklist.json).",
        cwd: resolution.cwd,
        checked_paths: resolution.seedsTried,
      },
      { status: 404 }
    )
  }

  try {
    const raw = fs.readFileSync(resolution.approvalPackPath, "utf8")
    const data = JSON.parse(raw) as Record<string, unknown>
    return NextResponse.json({
      ...data,
      _meta: {
        repo_root: resolution.repoRoot,
        pack_dir: approvalPackDir(resolution.repoRoot),
        checklist_path: resolution.approvalPackPath,
      },
    })
  } catch (e) {
    return NextResponse.json(
      { error: "read_failed", message: String(e) },
      { status: 500 }
    )
  }
}
