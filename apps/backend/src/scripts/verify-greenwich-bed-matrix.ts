import type { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

const ID = process.env.INSPECT_PRODUCT_ID ?? "prod_01KM1QHNHZXXSRPFEKAZRSFPDE"

export default async function verifyGreenwichBedMatrix({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve("logger")
  const m = container.resolve(Modules.PRODUCT)
  const p = (await m.listProducts({ id: ID }, { take: 1 }))[0]
  if (!p) {
    logger.error("not found")
    return
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
    const files = urls.map((u) => u.split("/").pop())
    const cross = files.filter((f) => {
      const hb = String(cell.headboard_model)
      const hay = f ?? ""
      if (hb === "cloud" && /_frame_|_plane_/.test(hay)) return true
      if (hb === "frame" && /_cloud_|_plane_/.test(hay)) return true
      if (hb === "plane" && /_frame_|_cloud_/.test(hay)) return true
      return false
    })
    logger.info(
      `${cell.headboard_model}|${cell.frame_material}|${cell.fabric_upholstery} urls=${urls.length} cross=${cross.length} hero=${files[0]}`
    )
    if (cross.length > 0) {
      logger.warn(`CROSS-CONTAMINATION: ${cross.join(", ")}`)
      failed = true
    }
  }
  if (failed) throw new Error("Greenwich bed matrix verification failed")
}
