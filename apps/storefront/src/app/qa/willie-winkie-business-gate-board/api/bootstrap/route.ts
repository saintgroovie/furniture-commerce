import * as fs from "fs"
import * as path from "path"
import { NextResponse } from "next/server"
import {
  FLOW_A_MEDIA_REL,
  MATRIX_JSON,
  PACKET_REL,
  getGateRepoResolution,
  packetFile,
} from "../_lib/gate-repo-root"
import { gateBoardProdBlocked, gateBoardProdBlockedResponse } from "../_lib/prod-guard"
import { REVIEW_VERSION, type GateBootstrap, type GateRow } from "../../business-gate-board-types"

export const dynamic = "force-dynamic"

type MediaRow = {
  handle_hint: string
  public_url: string
  filename: string
  operator_role: string
}

function enrichMedia(
  repoRoot: string,
  rows: GateRow[],
  backendBase: string
): GateRow[] {
  const mediaPath = path.join(repoRoot, FLOW_A_MEDIA_REL)
  const byHandle = new Map<string, MediaRow[]>()
  if (fs.existsSync(mediaPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(mediaPath, "utf8")) as { rows: MediaRow[] }
      for (const m of parsed.rows || []) {
        const h = m.handle_hint
        if (!byHandle.has(h)) byHandle.set(h, [])
        byHandle.get(h)!.push(m)
      }
    } catch {
      /* ignore */
    }
  }

  return rows.map((row) => {
    const media = byHandle.get(row.handle) || []
    const urls =
      media.length > 0
        ? media.map((m) => `${backendBase}${m.public_url}`)
        : row.static_sample_public_url
          ? [`${backendBase}${row.static_sample_public_url}`]
          : []
    const filenames =
      media.length > 0
        ? media.map((m) => m.filename)
        : row.static_sample_repo_path
          ? [path.basename(row.static_sample_repo_path)]
          : []
    return {
      ...row,
      media_count: media.length || row.media_count,
      media_preview_urls: urls,
      media_filenames: filenames,
      do_not_auto_apply: true as const,
    }
  })
}

export async function GET() {
  if (gateBoardProdBlocked()) return gateBoardProdBlockedResponse()

  const resolution = getGateRepoResolution()
  if (!resolution.repoRoot) {
    return NextResponse.json(
      {
        error: "business_gate_packet_not_found",
        hint: `Set FURNITURE_REPO_ROOT to repo with ${PACKET_REL}/${MATRIX_JSON}`,
        expected_packet_path: path.join(PACKET_REL, MATRIX_JSON),
        launch_context: resolution.cwd === "/app" ? "docker_storefront" : "local_missing_packet",
        recommended_dev_command:
          "cd apps/storefront && FURNITURE_REPO_ROOT=/path/to/furniture-commerce yarn dev --port 8010",
        recommended_url: "http://localhost:8010/qa/willie-winkie-business-gate-board",
        cwd: resolution.cwd,
        checked_paths: resolution.seedsTried,
      },
      { status: 404 }
    )
  }

  const matrixPath = packetFile(resolution.repoRoot, MATRIX_JSON)
  try {
    const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8")) as {
      rows: GateRow[]
      acceptable_product_type?: string[]
      acceptable_variant_strategy?: string[]
      acceptable_publish_policy?: string[]
      operator_decision_options?: string[]
    }

    const backendBase = (process.env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(
      /\/$/,
      ""
    )

    let rows = (matrix.rows || []).map((r) => ({
      ...r,
      do_not_auto_apply: true as const,
    }))
    rows = enrichMedia(resolution.repoRoot, rows, backendBase)

    const payload: GateBootstrap = {
      generated_at: new Date().toISOString(),
      repo_root: resolution.repoRoot,
      source_packet_path: path.join(PACKET_REL, MATRIX_JSON),
      backend_static_base: backendBase,
      review_tool: "willie-winkie-business-gate-board",
      review_version: REVIEW_VERSION,
      row_count: rows.length,
      rows,
      acceptable_values: {
        product_type: matrix.acceptable_product_type || ["STANDARD", "CONFIGURABLE", "BESPOKE"],
        variant_strategy: matrix.acceptable_variant_strategy || [
          "single_default",
          "configurable_tiers",
        ],
        publish_policy: [...(matrix.acceptable_publish_policy || ["draft", "published"]), "exclude"],
        operator_decision: matrix.operator_decision_options || [
          "approve_for_seed",
          "needs_more_info",
          "exclude_from_pilot",
        ],
      },
    }

    return NextResponse.json(payload)
  } catch (e) {
    return NextResponse.json({ error: "read_failed", message: String(e) }, { status: 500 })
  }
}
