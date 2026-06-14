import * as fs from "fs"
import { NextResponse } from "next/server"
import { FILLED_CSV, getMatrixRepoResolution, matrixFile } from "../../_lib/matrix-repo-root"
import { parseCsv } from "../../_lib/matrix-csv"
import { matrixBoardProdBlocked, matrixBoardProdBlockedResponse } from "../../_lib/prod-guard"

export const dynamic = "force-dynamic"

export async function GET() {
  if (matrixBoardProdBlocked()) return matrixBoardProdBlockedResponse()

  const resolution = getMatrixRepoResolution()
  if (!resolution.repoRoot) {
    return NextResponse.json({ error: "matrix_template_not_found" }, { status: 404 })
  }

  const filledPath = matrixFile(resolution.repoRoot, FILLED_CSV)
  const csv = fs.readFileSync(filledPath, "utf8")
  const rows = parseCsv(csv)

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    pilot_name: "willie-winkie-molly-flow-a-28",
    rows,
    draft: true,
    not_applied: true,
  })
}
