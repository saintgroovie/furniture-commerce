import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { resolvePublicProductTitle } from "../../../../../../lib/catalog-normalization/public-title"
import { guardBuyerFacingTitle } from "../../../../../../lib/catalog-normalization/import-guards"
import { mergeProductMetadata, metadataFingerprintWithoutPublicTitle } from "../../../../../../lib/catalog-admin/merge-metadata"
import { buildAdminProductProjection } from "../../../../../../lib/catalog-admin/admin-product-projection"

async function loadClassification(
  req: MedusaRequest,
  productId: string
): Promise<string | null> {
  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as {
      graph: (args: {
        entity: string
        fields: string[]
        filters?: Record<string, unknown>
      }) => Promise<{ data: unknown[] }>
    }
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "product_classification.product_type"],
      filters: { id: productId },
    })
    const row = data?.[0] as
      | { product_classification?: { product_type?: unknown } | null }
      | undefined
    const t = row?.product_classification?.product_type
    return t === "STANDARD" || t === "CONFIGURABLE" || t === "BESPOKE"
      ? t
      : null
  } catch {
    return null
  }
}

type SqlClient = {
  raw: (sql: string, bindings?: unknown[]) => Promise<{ rows?: unknown[]; rowCount?: number }>
}

type ProductModuleLike = {
  retrieveProduct: (
    id: string,
    config?: { relations?: string[] }
  ) => Promise<{
    id: string
    title?: string
    handle?: string
    status?: string
    thumbnail?: string | null
    metadata?: Record<string, unknown> | null
    options?: Array<{ title?: string; values?: Array<{ value?: string }> }>
    images?: Array<{ url?: string }>
    variants?: Array<{
      id?: string
      title?: string
      sku?: string
      prices?: Array<{ amount?: number; currency_code?: string }>
      metadata?: Record<string, unknown> | null
    }>
  }>
  updateProducts: (
    id: string,
    data: Record<string, unknown>
  ) => Promise<unknown>
}

function humanGuardMessage(code: string): string {
  switch (code) {
    case "PEDESTAL_CODE_IN_PUBLIC_TITLE":
      return "В названии на сайте остался заводской код тумбы (ЯП/ПЯ/ЯЯ/ПП). Уберите код или раскройте его словами"
    case "DEFAULT_VARIANT_PUBLIC_TITLE":
      return "Название похоже на технический Default variant - так покупателю показывать нельзя"
    default:
      return code
  }
}

/**
 * GET — buyer identity + full admin projection (read-only).
 * PUT — set metadata.public_title only (merge-safe); does not rewrite title.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const id = String(req.params.id ?? "")
  if (!id) {
    res.status(400).json({ message: "product id required" })
    return
  }
  const productModule = req.scope.resolve(Modules.PRODUCT) as ProductModuleLike
  try {
    const product = await productModule.retrieveProduct(id, {
      relations: ["variants", "options", "images"],
    })
    const classification = await loadClassification(req, id)
    const projection = buildAdminProductProjection({
      ...product,
      classification,
    })
    const resolved = resolvePublicProductTitle({
      title: product.title,
      handle: product.handle,
      metadata: product.metadata ?? null,
    })
    res.json({
      product_id: product.id,
      public_title: resolved.public_title,
      public_title_source: resolved.source,
      technical_title: product.title ?? null,
      classification,
      metadata_fingerprint: metadataFingerprintWithoutPublicTitle(
        product.metadata
      ),
      projection,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "product not found"
    res.status(404).json({ message: msg })
  }
}

export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const id = String(req.params.id ?? "")
  if (!id) {
    res.status(400).json({ message: "product id required" })
    return
  }

  const body = (req.body ?? {}) as {
    public_title?: unknown
    metadata_fingerprint?: unknown
  }
  if (typeof body.public_title !== "string") {
    res.status(400).json({
      message: "Укажите public_title строкой",
      code: "PUBLIC_TITLE_REQUIRED",
    })
    return
  }
  const publicTitleRaw = body.public_title.trim()
  if (!publicTitleRaw) {
    res.status(400).json({
      message: "Название на сайте не может быть пустым",
      code: "PUBLIC_TITLE_EMPTY",
    })
    return
  }

  const findings = guardBuyerFacingTitle(publicTitleRaw)
  if (findings.length) {
    res.status(400).json({
      message: humanGuardMessage(findings[0]!.code),
      code: findings[0]!.code,
      findings,
    })
    return
  }

  const productModule = req.scope.resolve(Modules.PRODUCT) as ProductModuleLike
  let product: Awaited<ReturnType<ProductModuleLike["retrieveProduct"]>>
  try {
    product = await productModule.retrieveProduct(id, {
      relations: ["variants", "options", "images"],
    })
  } catch {
    res.status(404).json({ message: "Товар не найден" })
    return
  }

  if (
    typeof body.metadata_fingerprint !== "string" ||
    body.metadata_fingerprint.length === 0
  ) {
    res.status(400).json({
      message:
        "Сохранение названия требует metadata_fingerprint. Обновите страницу и повторите",
      code: "METADATA_FINGERPRINT_REQUIRED",
    })
    return
  }

  const fingerprintBefore = metadataFingerprintWithoutPublicTitle(product.metadata)
  if (body.metadata_fingerprint !== fingerprintBefore) {
    res.status(409).json({
      message:
        "Метаданные товара изменились параллельно. Обновите страницу и сохраните название снова",
      code: "METADATA_CONCURRENT_CHANGE",
    })
    return
  }

  /* Store the exact string the buyer resolver will show (whitespace/× polish). */
  const previewResolved = resolvePublicProductTitle({
    title: product.title,
    handle: product.handle,
    metadata: mergeProductMetadata(product.metadata, {
      public_title: publicTitleRaw,
    }),
  })
  const publicTitle = previewResolved.public_title

  /* Key-level CAS: patch only public_title; refuse if sibling metadata changed. */
  let sql: SqlClient
  try {
    sql = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as SqlClient
  } catch {
    res.status(503).json({
      message: "Не удалось выполнить безопасную запись названия. Повторите позже",
      code: "METADATA_CAS_UNAVAILABLE",
    })
    return
  }

  let casRows: unknown[] = []
  try {
    const result = await sql.raw(
      `UPDATE product
       SET metadata = jsonb_set(
             COALESCE(metadata, '{}'::jsonb),
             '{public_title}',
             to_jsonb(CAST(? AS text)),
             true
           ),
           updated_at = NOW()
       WHERE id = ?
         AND deleted_at IS NULL
         AND COALESCE(metadata, '{}'::jsonb) - 'public_title' = CAST(? AS jsonb)
       RETURNING id`,
      [publicTitle, id, fingerprintBefore]
    )
    casRows = result.rows ?? []
  } catch (e) {
    const msg = e instanceof Error ? e.message : "update failed"
    res.status(500).json({ message: msg })
    return
  }

  if (casRows.length === 0) {
    res.status(409).json({
      message:
        "Метаданные товара изменились параллельно. Обновите страницу и сохраните название снова",
      code: "METADATA_CONCURRENT_CHANGE",
    })
    return
  }

  const updated = await productModule.retrieveProduct(id, {
    relations: ["variants", "options", "images"],
  })
  const classification = await loadClassification(req, id)
  const resolved = resolvePublicProductTitle({
    title: updated.title,
    handle: updated.handle,
    metadata: updated.metadata ?? null,
  })

  if (resolved.public_title !== publicTitle) {
    res.status(500).json({
      message:
        "После сохранения название на сайте не совпало с сохранённым значением - обратитесь к разработчику",
      code: "PUBLIC_TITLE_POSTWRITE_MISMATCH",
      expected: publicTitle,
      resolved: resolved.public_title,
      source: resolved.source,
    })
    return
  }

  res.json({
    ok: true,
    product_id: id,
    public_title: resolved.public_title,
    public_title_source: resolved.source,
    normalized_from_input:
      publicTitle !== publicTitleRaw ? publicTitleRaw : null,
    technical_title_unchanged: updated.title === product.title,
    metadata_fingerprint: metadataFingerprintWithoutPublicTitle(updated.metadata),
    projection: buildAdminProductProjection({
      ...updated,
      classification,
    }),
  })
}
