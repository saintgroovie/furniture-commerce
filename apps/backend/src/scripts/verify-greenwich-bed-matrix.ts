/**
 * Fail-closed verify for all approved Greenwich bed SKUs (or one INSPECT_PRODUCT_ID).
 *
 *   npx medusa exec ./src/scripts/verify-greenwich-bed-matrix.ts
 *   INSPECT_PRODUCT_ID=prod_… npx medusa exec ./src/scripts/verify-greenwich-bed-matrix.ts
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

const APPROVED_HANDLES = [
  "greenwich-gr-09-1-bed-90",
  "greenwich-gr-12-1",
  "greenwich-gr-14-1",
  "greenwich-gr-16-1",
  "greenwich-gr-18-1",
] as const

const EXPECTED_CELLS = 11
const COMBO_TOKEN_RE = /(natural_beige|dark_beige|natural_darkblue|dark_darkblue)/i

function basename(url: string): string {
  return (url.split("?")[0]?.split("#")[0]?.split("/").pop() ?? url).toLowerCase()
}

function parseComboKey(url: string): string | null {
  const m = basename(url).match(COMBO_TOKEN_RE)
  return m?.[1]?.toLowerCase() ?? null
}

function isUnscopedPool(url: string): boolean {
  const b = basename(url)
  if (parseComboKey(b)) return false
  if (/bedroom\d*_int_|_int_view/i.test(b)) return false
  return /gr-bed-pool_(frame|cloud|plane)_/i.test(b)
}

function verifyMatrixCells(
  logger: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void },
  label: string,
  matrix: Array<Record<string, unknown>> | undefined
): boolean {
  let failed = false
  if ((matrix?.length ?? 0) !== EXPECTED_CELLS) {
    logger.error(`${label}: matrix count ${matrix?.length ?? 0} !== ${EXPECTED_CELLS}`)
    failed = true
  }
  for (const cell of matrix ?? []) {
    const urls = (cell.urls as string[] | undefined) ?? []
    const files = urls.map((u) => basename(u))
    const cellCombo =
      typeof cell.combo_key === "string" && cell.combo_key.trim()
        ? cell.combo_key.trim().toLowerCase()
        : `${cell.frame_material}_${cell.fabric_upholstery}`.toLowerCase()

    const heroToken = urls[0] ? parseComboKey(urls[0]) : null
    if (!heroToken || heroToken !== cellCombo) {
      logger.warn(
        `${label}: HERO-COMBO-MISMATCH expected=${cellCombo} got=${heroToken} file=${files[0]}`
      )
      failed = true
    }

    const crossHb = files.filter((f) => {
      const hb = String(cell.headboard_model)
      const hay = f ?? ""
      if (hb === "cloud" && /_frame_|_plane_/.test(hay)) return true
      if (hb === "frame" && /_cloud_|_plane_/.test(hay)) return true
      if (hb === "plane" && /_frame_|_cloud_/.test(hay)) return true
      return false
    })
    const foreignCombo = urls.filter((u) => {
      const token = parseComboKey(u)
      return Boolean(token && token !== cellCombo)
    })
    const unscopedPool = urls.filter((u) => isUnscopedPool(u))

    logger.info(
      `${label} ${cell.headboard_model}|${cell.frame_material}|${cell.fabric_upholstery} urls=${urls.length} crossHb=${crossHb.length} foreignCombo=${foreignCombo.length} unscopedPool=${unscopedPool.length}`
    )
    if (crossHb.length > 0) {
      logger.warn(`${label}: CROSS-HEADBOARD ${crossHb.join(", ")}`)
      failed = true
    }
    if (foreignCombo.length > 0) {
      logger.warn(
        `${label}: FOREIGN-COMBO ${foreignCombo.map((u) => basename(u)).join(", ")}`
      )
      failed = true
    }
    if (unscopedPool.length > 0) {
      logger.warn(
        `${label}: UNSCOPED-POOL-IN-CELL ${unscopedPool.map((u) => basename(u)).join(", ")}`
      )
      failed = true
    }
  }
  return !failed
}

export default async function verifyGreenwichBedMatrix({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve("logger")
  const m = container.resolve(Modules.PRODUCT)
  const singleId = process.env.INSPECT_PRODUCT_ID?.trim()

  const targets: Array<{ id: string; handle: string }> = []
  if (singleId) {
    const p = (await m.listProducts({ id: singleId }, { take: 1 }))[0]
    if (!p) {
      throw new Error(`Greenwich bed matrix verification failed: product ${singleId} not found`)
    }
    targets.push({ id: p.id, handle: String(p.handle ?? p.id) })
  } else {
    for (const handle of APPROVED_HANDLES) {
      const p = (await m.listProducts({ handle }, { take: 1 }))[0]
      if (!p?.id) {
        throw new Error(`Greenwich bed matrix verification failed: missing ${handle}`)
      }
      targets.push({ id: p.id, handle })
    }
  }

  let allOk = true
  for (const t of targets) {
    const p = (await m.listProducts({ id: t.id }, { take: 1 }))[0]
    if (!p) {
      throw new Error(`Greenwich bed matrix verification failed: product ${t.id} not found`)
    }
    const md = (p.metadata ?? {}) as Record<string, unknown>
    const matrix = md.bed_execution_matrix as Array<Record<string, unknown>> | undefined
    logger.info(`verify handle=${p.handle} id=${p.id} cells=${matrix?.length ?? 0}`)
    const ok = verifyMatrixCells(logger, String(p.handle), matrix)
    if (!ok) allOk = false
  }

  if (!allOk) throw new Error("Greenwich bed matrix verification failed")
  logger.info(`VERIFY PASS (${targets.length} product(s))`)
}
