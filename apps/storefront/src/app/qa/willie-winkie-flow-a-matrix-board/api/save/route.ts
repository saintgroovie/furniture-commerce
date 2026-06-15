import * as fs from "fs"
import { NextResponse } from "next/server"
import {
  FILLED_CSV,
  assertWritePath,
  getMatrixRepoResolution,
  matrixFile,
} from "../_lib/matrix-repo-root"
import { rowsToCsv } from "../_lib/matrix-csv"
import { writeReadinessArtifacts } from "../_lib/matrix-readiness-writer"
import { matrixBoardProdBlocked, matrixBoardProdBlockedResponse } from "../_lib/prod-guard"
import type { MatrixRow } from "../../matrix-board-types"

export const dynamic = "force-dynamic"

const WRITABLE_FIELDS = new Set([
  "workbook_row_key",
  "workbook_product_code",
  "painting_name",
  "medusa_product_type",
  "variant_strategy",
  "price_rub",
  "solid_full_price_rub",
  "solid_front_ldsp_body_price_rub",
  "solid_full_sku_suffix",
  "solid_front_ldsp_body_sku_suffix",
  "tier_notes",
  "compare_at_price_rub",
  "status_draft_or_published",
  "operator_decision",
  "operator_notes",
])

export async function POST(req: Request) {
  if (matrixBoardProdBlocked()) return matrixBoardProdBlockedResponse()

  const resolution = getMatrixRepoResolution()
  if (!resolution.repoRoot || !resolution.matrixDir) {
    return NextResponse.json({ error: "matrix_template_not_found" }, { status: 404 })
  }

  let body: { rows?: MatrixRow[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const rows = body.rows
  if (!Array.isArray(rows) || rows.length !== 28) {
    return NextResponse.json({ error: "expected_28_rows", got: rows?.length ?? 0 }, { status: 400 })
  }

  const sanitized: MatrixRow[] = rows.map((row) => {
    const out = { ...row }
    out.ingestion_allowed = "no"
    if (!out.currency) out.currency = "rub"
    return out
  })

  const filledPath = matrixFile(resolution.repoRoot, FILLED_CSV)
  assertWritePath(filledPath, resolution.repoRoot)

  try {
    fs.writeFileSync(filledPath, rowsToCsv(sanitized), "utf8")
    const readiness = writeReadinessArtifacts(resolution.matrixDir, sanitized)
    return NextResponse.json({
      ok: true,
      saved_path: filledPath,
      readiness,
      writable_fields_whitelist: Array.from(WRITABLE_FIELDS),
    })
  } catch (e) {
    return NextResponse.json({ error: "save_failed", message: String(e) }, { status: 500 })
  }
}
