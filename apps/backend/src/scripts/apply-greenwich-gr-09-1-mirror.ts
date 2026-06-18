/**
 * Apply single-image Greenwich mirror from local static (no legacy product page found).
 *
 *   GW_MIRROR_MEDIA_CONFIRM=1 npx medusa exec ./src/scripts/apply-greenwich-gr-09-1-mirror.ts
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"

const HANDLE = "greenwich-gr-09-1-mirror"
const STATIC_REL = "/static/products/greenwich/GR-09-1_main_01.png"
const RAW_SRC = "data/raw/downloaded-assets/greenwich/GR-09-1_main_01.png"

function repoRoot(): string {
  const cwd = process.cwd()
  if (path.basename(cwd) === "backend" && path.basename(path.dirname(cwd)) === "apps") {
    return path.resolve(cwd, "../..")
  }
  return path.resolve(cwd, "../..")
}

function backendBaseUrl(root: string): string {
  const envPath = path.join(root, "apps/backend/.env")
  if (fs.existsSync(envPath)) {
    const env = fs.readFileSync(envPath, "utf8")
    const m = env.match(/^MEDUSA_BACKEND_URL=(.+)$/m)
    if (m) return m[1].trim().replace(/^["']|["']$/g, "").replace(/\/$/, "")
  }
  return "http://localhost:9000"
}

export default async function applyGreenwichGr091Mirror({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve("logger")
  if (process.env.GW_MIRROR_MEDIA_CONFIRM !== "1") {
    logger.info("Skipped. Set GW_MIRROR_MEDIA_CONFIRM=1")
    return
  }

  const root = repoRoot()
  const dest = path.join(root, "apps/backend", STATIC_REL.replace(/^\//, ""))
  if (!fs.existsSync(dest)) {
    const raw = path.join(root, RAW_SRC)
    if (!fs.existsSync(raw)) throw new Error(`Missing mirror asset: ${RAW_SRC}`)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(raw, dest)
    logger.info(`Copied mirror asset from ${RAW_SRC}`)
  }

  const url = `${backendBaseUrl(root)}${STATIC_REL}`
  const productModule = container.resolve(Modules.PRODUCT)
  const listed = await productModule.listProducts({ handle: HANDLE }, { take: 1 })
  const product = listed?.[0]
  if (!product?.id) throw new Error(`Product not found: ${HANDLE}`)

  const meta = { ...(product.metadata ?? {}) } as Record<string, unknown>
  meta.canonical_name = "Зеркало навесное"
  meta.legacy_media_note =
    "No woodright.ru product page in 2026 catalog; applied from data/raw/downloaded-assets"

  await productModule.updateProducts(product.id, {
    thumbnail: url,
    images: [{ url }],
    metadata: meta,
  })
  logger.info(`Updated ${HANDLE}: single gallery image`)
}
