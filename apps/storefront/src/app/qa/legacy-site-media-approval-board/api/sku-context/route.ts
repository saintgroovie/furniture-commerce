import * as fs from "fs"
import { NextResponse } from "next/server"
import { getEmergencyFixRepoResolution } from "../_lib/emergency-fix-repo-root"
import { buildSkuPoolContext } from "../_lib/sku-pool-context"

export const dynamic = "force-dynamic"

export async function GET() {
  const emergency = getEmergencyFixRepoResolution()
  if (!emergency.approvalPackPath) {
    return NextResponse.json({ error: "approval_pack_not_found" }, { status: 404 })
  }

  const checklist = JSON.parse(fs.readFileSync(emergency.approvalPackPath, "utf8")) as {
    items: { handle: string }[]
  }
  if (!checklist?.items?.length) {
    return NextResponse.json({ error: "checklist_empty" }, { status: 404 })
  }

  const handles = [...new Set(checklist.items.map((i) => i.handle).filter(Boolean))]
  const { contexts, data_repo_root } = buildSkuPoolContext(handles)

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    handle_count: handles.length,
    data_repo_root,
    contexts,
  })
}
