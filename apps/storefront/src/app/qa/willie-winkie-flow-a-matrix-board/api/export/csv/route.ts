import * as fs from "fs"
import { NextResponse } from "next/server"
import { FILLED_CSV, getMatrixRepoResolution, matrixFile } from "../../_lib/matrix-repo-root"
import { matrixBoardProdBlocked, matrixBoardProdBlockedResponse } from "../../_lib/prod-guard"

export const dynamic = "force-dynamic"

export async function GET() {
  if (matrixBoardProdBlocked()) return matrixBoardProdBlockedResponse()

  const resolution = getMatrixRepoResolution()
  if (!resolution.repoRoot) {
    return NextResponse.json({ error: "matrix_template_not_found" }, { status: 404 })
  }

  const filledPath = matrixFile(resolution.repoRoot, FILLED_CSV)
  if (!fs.existsSync(filledPath)) {
    return NextResponse.json({ error: "filled_csv_missing" }, { status: 404 })
  }

  const csv = fs.readFileSync(filledPath, "utf8")
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="vv-painting-sku-matrix-filled.csv"',
    },
  })
}
