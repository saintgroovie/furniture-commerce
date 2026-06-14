import * as fs from "fs"
import { NextResponse } from "next/server"
import { FILLED_CSV, getMatrixRepoResolution, matrixFile } from "../_lib/matrix-repo-root"
import { parseCsv } from "../_lib/matrix-csv"
import { writeReadinessArtifacts } from "../_lib/matrix-readiness-writer"
import { matrixBoardProdBlocked, matrixBoardProdBlockedResponse } from "../_lib/prod-guard"

export const dynamic = "force-dynamic"

export async function GET() {
  if (matrixBoardProdBlocked()) return matrixBoardProdBlockedResponse()

  const resolution = getMatrixRepoResolution()
  if (!resolution.repoRoot || !resolution.matrixDir) {
    return NextResponse.json({ error: "matrix_template_not_found" }, { status: 404 })
  }

  const filledPath = matrixFile(resolution.repoRoot, FILLED_CSV)
  const rows = parseCsv(fs.readFileSync(filledPath, "utf8"))
  const readiness = writeReadinessArtifacts(resolution.matrixDir, rows)

  return NextResponse.json(readiness)
}
