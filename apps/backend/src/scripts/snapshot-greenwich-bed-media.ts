/**
 * Snapshot Greenwich bed media fields before apply (rollback aid).
 *
 *   GW_BED_MEDIA_CONFIRM=1 npx medusa exec ./src/scripts/snapshot-greenwich-bed-media.ts
 *
 * Writes JSON under tmp/greenwich-bed-media-snapshots/ (gitignored via tmp/).
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"

const APPROVED_HANDLES = [
  "greenwich-gr-09-1-bed-90",
  "greenwich-gr-12-1",
  "greenwich-gr-14-1",
  "greenwich-gr-16-1",
  "greenwich-gr-18-1",
] as const

function repoRoot(): string {
  const cwd = process.cwd()
  if (path.basename(cwd) === "backend" && path.basename(path.dirname(cwd)) === "apps") {
    return path.resolve(cwd, "../..")
  }
  return path.resolve(cwd, "../..")
}

export default async function snapshotGreenwichBedMedia({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve("logger")
  if (process.env.GW_BED_MEDIA_CONFIRM !== "1") {
    logger.info("Skipped. Set GW_BED_MEDIA_CONFIRM=1")
    return
  }

  const productModule = container.resolve(Modules.PRODUCT)
  const products: Array<Record<string, unknown>> = []

  for (const handle of APPROVED_HANDLES) {
    const listed = await productModule.listProducts(
      { handle },
      { take: 1, relations: ["images"] }
    )
    const product = listed?.[0]
    if (!product?.id) {
      throw new Error(`Snapshot abort: missing product ${handle}`)
    }
    products.push({
      id: product.id,
      handle: product.handle,
      thumbnail: product.thumbnail ?? null,
      images: (product.images ?? []).map((img: { url?: string; id?: string }) => ({
        id: img.id,
        url: img.url,
      })),
      metadata: product.metadata ?? {},
    })
  }

  const root = repoRoot()
  const dir = path.join(root, "tmp/greenwich-bed-media-snapshots")
  fs.mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const outPath = path.join(dir, `pre-apply-${stamp}.json`)
  const payload = {
    created_at: new Date().toISOString(),
    purpose: "pre-apply rollback aid for apply-greenwich-bed-media",
    handles: [...APPROVED_HANDLES],
    products,
  }
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8")
  logger.info(`Wrote snapshot ${outPath} (${products.length} products)`)
}
