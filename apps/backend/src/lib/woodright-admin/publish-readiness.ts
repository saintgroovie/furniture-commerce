import { isActiveSellerCollectionKey, isProductInActiveCatalogScope } from "./catalog-scope"
import { hasExecutionMediaContract } from "./execution-media-guard"
import { productHasRubPrice } from "./price-sanity"
import { collectProductImageUrls } from "./media-health"
import { readDimensionsMm } from "./dimensions-command"

export type PublishIssue = {
  severity: "error" | "warning"
  code: string
  message: string
}

export type WorkspacePublishReadiness = {
  ready: boolean
  blockers: PublishIssue[]
  warnings: PublishIssue[]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function classificationOf(product: Record<string, unknown>): string {
  const cls = asRecord(product.product_classification)
  const t = cls?.product_type
  if (t === "STANDARD" || t === "CONFIGURABLE" || t === "BESPOKE") return t
  return "UNKNOWN"
}

function titleOf(product: Record<string, unknown>): string {
  return typeof product.title === "string" ? product.title.trim() : ""
}

function skuExists(product: Record<string, unknown>): boolean {
  const variants = product.variants
  if (!Array.isArray(variants)) return false
  return variants.some((raw) => {
    const variant = asRecord(raw)
    return Boolean(variant && typeof variant.sku === "string" && variant.sku.trim())
  })
}

function hasMedia(product: Record<string, unknown>): boolean {
  if (typeof product.thumbnail === "string" && product.thumbnail.trim()) return true
  return collectProductImageUrls(product).length > 0
}

function collectionKeyOf(product: Record<string, unknown>): string | null {
  const meta = asRecord(product.metadata)
  const key = meta?.collection
  return typeof key === "string" && key.trim() ? key : null
}

/**
 * Seller-safe publish gate. Reuses catalog/classification/price/media facts.
 * Warnings are visible but do not block. Errors block Workspace publish only.
 */
export function computeWorkspacePublishReadiness(
  product: Record<string, unknown>
): WorkspacePublishReadiness {
  const blockers: PublishIssue[] = []
  const warnings: PublishIssue[] = []
  const classification = classificationOf(product)
  const meta = asRecord(product.metadata) ?? {}

  if (!titleOf(product)) {
    blockers.push({
      severity: "error",
      code: "missing_title",
      message: "Укажите название",
    })
  }

  if (classification === "UNKNOWN") {
    blockers.push({
      severity: "error",
      code: "missing_classification",
      message: "Не выбран тип товара",
    })
  }

  const collectionKey = collectionKeyOf(product)
  if (!collectionKey) {
    blockers.push({
      severity: "error",
      code: "missing_collection",
      message: "Не выбрана коллекция",
    })
  } else if (!isActiveSellerCollectionKey(collectionKey) || !isProductInActiveCatalogScope(product)) {
    blockers.push({
      severity: "error",
      code: "invalid_collection",
      message: "Коллекция не подходит для публикации на сайте",
    })
  }

  if (!skuExists(product)) {
    blockers.push({
      severity: "error",
      code: "missing_sku",
      message: "Укажите артикул",
    })
  }

  if (classification === "STANDARD" || classification === "CONFIGURABLE") {
    if (!productHasRubPrice(product)) {
      blockers.push({
        severity: "error",
        code: "missing_price",
        message: "Добавьте цену",
      })
    }
  }

  if (!hasMedia(product)) {
    blockers.push({
      severity: "error",
      code: "missing_media",
      message: "Добавьте фотографию",
    })
  }

  const dimensions = readDimensionsMm(meta)
  if (!dimensions.height_mm && !dimensions.width_mm && !dimensions.depth_mm) {
    warnings.push({
      severity: "warning",
      code: "missing_dimensions",
      message: "Размеры пока не указаны",
    })
  }

  if (classification === "CONFIGURABLE" && !hasExecutionMediaContract(meta)) {
    warnings.push({
      severity: "warning",
      code: "missing_execution_setup",
      message: "Требуется настройка исполнений",
    })
  }

  return {
    ready: blockers.length === 0,
    blockers,
    warnings,
  }
}

export function decideWorkspacePublish(
  currentStatus: string,
  readiness: WorkspacePublishReadiness
):
  | { ok: true; next_status: "published" }
  | { ok: false; code: "not_ready"; message: string; blockers: PublishIssue[] } {
  if (!readiness.ready) {
    return {
      ok: false,
      code: "not_ready",
      message: "Пока нельзя опубликовать",
      blockers: readiness.blockers,
    }
  }
  void currentStatus
  return { ok: true, next_status: "published" }
}

export function catalogPublishGateAudit(
  rows: Array<{ status: string; publish: WorkspacePublishReadiness }>
): {
  evaluated: number
  published: number
  would_fail: number
  by_code: Record<string, number>
} {
  const published = rows.filter((row) => row.status === "published")
  const wouldFail = published.filter((row) => !row.publish.ready)
  const by_code: Record<string, number> = {}
  for (const row of wouldFail) {
    for (const blocker of row.publish.blockers) {
      by_code[blocker.code] = (by_code[blocker.code] ?? 0) + 1
    }
  }
  return {
    evaluated: rows.length,
    published: published.length,
    would_fail: wouldFail.length,
    by_code,
  }
}
