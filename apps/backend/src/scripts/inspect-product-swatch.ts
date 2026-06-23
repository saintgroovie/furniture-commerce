import type { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

const ID = process.env.INSPECT_PRODUCT_ID ?? "prod_01KM1QHNHZXXSRPFEKAZRSFPDE"

export default async function inspectProductSwatch({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve("logger")
  const m = container.resolve(Modules.PRODUCT)
  const listed = await m.listProducts({ id: ID }, { take: 1, relations: ["images"] })
  const p = listed?.[0]
  if (!p) {
    logger.error(`Not found: ${ID}`)
    return
  }
  const md = (p.metadata ?? {}) as Record<string, unknown>
  logger.info(
    JSON.stringify(
      {
        id: p.id,
        handle: p.handle,
        title: p.title,
        thumbnail: p.thumbnail,
        image_count: p.images?.length ?? 0,
        image_files: (p.images ?? []).map((i) => i?.url?.split("/").pop()),
        headboard_model_executions: md.headboard_model_executions,
        frame_material_executions: md.frame_material_executions,
        fabric_upholstery_executions: md.fabric_upholstery_executions,
        paint_finish_executions: md.paint_finish_executions,
        finish_color_executions: md.finish_color_executions,
        bed_execution_matrix: md.bed_execution_matrix,
        shared_scene_media: md.shared_scene_media,
        dimension_metadata_version: md.dimension_metadata_version,
        display_group: md.display_group,
        collection: md.collection,
      },
      null,
      2
    )
  )
}
