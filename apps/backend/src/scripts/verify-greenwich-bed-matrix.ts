import type { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

const ID = process.env.INSPECT_PRODUCT_ID ?? "prod_01KM1QHNHZXXSRPFEKAZRSFPDE"

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

/**
 * Fail-closed verify for Greenwich bed matrix cells:
 * - product must exist
 * - expected cell count
 * - hero must carry the cell combo token
 * - no cross-headboard contamination
 * - no foreign combo_key tokens inside a cell
 * - no unscoped headboard-pool URLs in any cell position
 */
export default async function verifyGreenwichBedMatrix({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve("logger")
  const m = container.resolve(Modules.PRODUCT)
  const p = (await m.listProducts({ id: ID }, { take: 1 }))[0]
  if (!p) {
    throw new Error(`Greenwich bed matrix verification failed: product ${ID} not found`)
  }
  const md = (p.metadata ?? {}) as Record<string, unknown>
  const matrix = md.bed_execution_matrix as Array<Record<string, unknown>> | undefined
  logger.info(`handle=${p.handle} thumb=${p.thumbnail?.split("/").pop()}`)
  logger.info(`matrix cells=${matrix?.length ?? 0}`)
  let failed = false
  const EXPECTED = 11
  if ((matrix?.length ?? 0) !== EXPECTED) {
    logger.error(`matrix count ${matrix?.length ?? 0} !== ${EXPECTED}`)
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
      logger.warn(`HERO-COMBO-MISMATCH: expected=${cellCombo} got=${heroToken} file=${files[0]}`)
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
      `${cell.headboard_model}|${cell.frame_material}|${cell.fabric_upholstery} urls=${urls.length} crossHb=${crossHb.length} foreignCombo=${foreignCombo.length} unscopedPool=${unscopedPool.length} hero=${files[0]}`
    )
    if (crossHb.length > 0) {
      logger.warn(`CROSS-HEADBOARD: ${crossHb.join(", ")}`)
      failed = true
    }
    if (foreignCombo.length > 0) {
      logger.warn(`FOREIGN-COMBO: ${foreignCombo.map((u) => basename(u)).join(", ")}`)
      failed = true
    }
    if (unscopedPool.length > 0) {
      logger.warn(`UNSCOPED-POOL-IN-CELL: ${unscopedPool.map((u) => basename(u)).join(", ")}`)
      failed = true
    }
  }
  if (failed) throw new Error("Greenwich bed matrix verification failed")
}
