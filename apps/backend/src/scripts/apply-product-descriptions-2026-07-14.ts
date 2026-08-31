/**
 * Apply buyer-facing product.description from
 * data/content/product-descriptions-2026-07-14.json
 *
 * Dry-run (default):
 *   npx medusa exec ./src/scripts/apply-product-descriptions-2026-07-14.ts
 *
 * Apply:
 *   PRODUCT_DESCRIPTIONS_CONFIRM=1 npx medusa exec ./src/scripts/apply-product-descriptions-2026-07-14.ts
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { readFileSync } from "fs"
import { resolve } from "path"

type Payload = {
  version: string
  phrase_suffix: string
  products: Array<{ handle: string; title: string; description: string }>
}

function loadPayload(): Payload {
  const candidates = [
    resolve(process.cwd(), "../../data/content/product-descriptions-2026-07-14.json"),
    resolve(process.cwd(), "../../../data/content/product-descriptions-2026-07-14.json"),
    resolve(__dirname, "../../../../../data/content/product-descriptions-2026-07-14.json"),
  ]
  for (const p of candidates) {
    try {
      return JSON.parse(readFileSync(p, "utf8")) as Payload
    } catch {
      // try next
    }
  }
  throw new Error("product-descriptions-2026-07-14.json not found")
}

export default async function applyProductDescriptions({
  container,
}: ExecArgs): Promise<void> {
  const logger = container.resolve("logger")
  const apply = process.env.PRODUCT_DESCRIPTIONS_CONFIRM === "1"
  const productModule = container.resolve(Modules.PRODUCT)
  const payload = loadPayload()

  let updated = 0
  let alreadyOk = 0
  let missing = 0

  for (const row of payload.products) {
    const listed = await productModule.listProducts(
      { handle: row.handle },
      { take: 1 }
    )
    const product = listed?.[0]
    if (!product?.id) {
      missing++
      logger.warn(`MISSING handle=${row.handle}`)
      continue
    }

    const current = (product.description ?? "").trim()
    const next = row.description.trim()
    if (current === next) {
      alreadyOk++
      continue
    }

    logger.info(
      `${apply ? "APPLY" : "DRY-RUN"} ${row.handle}: ${current.length} → ${next.length} chars`
    )
    if (apply) {
      await productModule.updateProducts(product.id, { description: next })
      updated++
    }
  }

  logger.info(
    `Product descriptions ${payload.version}: apply=${apply} updated=${updated} already_ok=${alreadyOk} missing=${missing} total=${payload.products.length}`
  )
  if (!apply) {
    logger.info("Skipped writes. Set PRODUCT_DESCRIPTIONS_CONFIRM=1 to apply.")
  }
}
