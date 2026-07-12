/**
 * Target Medusa product_collection titles (handles unchanged).
 *
 * Dry-run (default):
 *   npx medusa exec ./src/scripts/apply-collection-title-russification.ts
 *
 * Apply (requires explicit operator confirm):
 *   COLLECTION_TITLE_RU_CONFIRM=1 npx medusa exec ./src/scripts/apply-collection-title-russification.ts
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

const TARGET_TITLES: Record<string, string> = {
  oliver: "Оливер",
  greenwich: "Гринвич",
  monchelsea: "Мончелси",
  provence: "Прованс",
  "oliver-kids": "Оливер · детская",
  "willie-winkie": "Вилли Винки",
}

export default async function applyCollectionTitleRussification({
  container,
}: ExecArgs): Promise<void> {
  const logger = container.resolve("logger")
  const apply = process.env.COLLECTION_TITLE_RU_CONFIRM === "1"
  const productModule = container.resolve(Modules.PRODUCT)

  let updated = 0
  let alreadyOk = 0
  let missing = 0

  for (const [handle, title] of Object.entries(TARGET_TITLES)) {
    const listed = await productModule.listProductCollections({ handle }, { take: 1 })
    const collection = listed?.[0]
    if (!collection?.id) {
      missing++
      logger.warn(`MISSING collection handle=${handle}`)
      continue
    }

    if (collection.title === title) {
      alreadyOk++
      logger.info(`OK ${handle}: title already "${title}"`)
      continue
    }

    logger.info(
      `${apply ? "APPLY" : "DRY-RUN"} ${handle}: "${collection.title}" → "${title}"`
    )

    if (apply) {
      await productModule.updateProductCollections(collection.id, { title })
      updated++
    }
  }

  logger.info(
    `Collection title russification: apply=${apply} updated=${updated} already_ok=${alreadyOk} missing=${missing}`
  )
  if (!apply) {
    logger.info("Skipped writes. Set COLLECTION_TITLE_RU_CONFIRM=1 to apply.")
  }
}
