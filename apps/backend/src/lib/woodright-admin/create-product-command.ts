import { resolveAdminCollectionLabel } from "../../admin/lib/collection-display-labels"
import {
  isActiveSellerCollectionKey,
  type WoodrightActiveCollectionKey,
} from "./catalog-scope"
import type { SellerProduct } from "./seller-product-types"

export const WOODRIGHT_CLASSIFICATIONS = ["STANDARD", "CONFIGURABLE", "BESPOKE"] as const
export type WoodrightClassification = (typeof WOODRIGHT_CLASSIFICATIONS)[number]

export type CreateProductInput = {
  title: string
  sku: string
  classification: WoodrightClassification
  collection_key: WoodrightActiveCollectionKey
}

export type CreateProductFailure = {
  ok: false
  code: string
  message: string
  field?: string
}

export type CreateProductDraftSpec = {
  title: string
  sku: string
  handle: string
  classification: WoodrightClassification
  collection_key: string
  collection_label: string
  status: "draft"
  option_title: "Default"
  option_value: "Default"
  variant_title: "Default"
}

export type CreateProductPorts = {
  findSkuConflict: (sku: string) => Promise<{ title: string } | null>
  createDraftProduct: (spec: CreateProductDraftSpec) => Promise<{ id: string }>
  createClassification: (type: WoodrightClassification) => Promise<{ id: string }>
  linkClassification: (productId: string, classificationId: string) => Promise<void>
  deleteProduct: (id: string) => Promise<void>
  deleteClassification: (id: string) => Promise<void>
  loadSellerProduct: (id: string) => Promise<SellerProduct>
  onCompensationIssue?: (info: {
    stage: "cleanup"
    productId: string | null
    classificationId: string | null
    productCleanupFailed: boolean
    classificationCleanupFailed: boolean
  }) => void
}

export type CreateProductSuccess = {
  ok: true
  product: SellerProduct
}

const ALLOWED_CREATE_KEYS = new Set(["title", "sku", "classification", "collection_key"])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function normalizeSellerSku(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toUpperCase()
}

export function sellerSkuHasCyrillic(raw: string): boolean {
  return /[а-яё]/i.test(raw)
}

export function handleFromSellerSku(sku: string): string {
  return sku.trim().toLowerCase().replace(/\s+/g, "-")
}

export function parseCreateProductBody(body: unknown): CreateProductFailure | CreateProductInput {
  if (!isRecord(body)) {
    return { ok: false, code: "invalid_body", message: "Некорректные данные товара" }
  }
  for (const key of Object.keys(body)) {
    if (!ALLOWED_CREATE_KEYS.has(key)) {
      return { ok: false, code: "unknown_key", message: "Неизвестное поле", field: key }
    }
  }
  const title = typeof body.title === "string" ? body.title.trim() : ""
  if (!title) {
    return { ok: false, code: "missing_title", message: "Укажите название", field: "title" }
  }
  if (title.length > 180) {
    return { ok: false, code: "invalid_title", message: "Название слишком длинное", field: "title" }
  }
  const sku = typeof body.sku === "string" ? normalizeSellerSku(body.sku) : ""
  if (!sku) {
    return { ok: false, code: "missing_sku", message: "Укажите артикул", field: "sku" }
  }
  if (sku.length > 64) {
    return { ok: false, code: "invalid_sku", message: "Артикул слишком длинный", field: "sku" }
  }
  const classification = body.classification
  if (
    classification !== "STANDARD" &&
    classification !== "CONFIGURABLE" &&
    classification !== "BESPOKE"
  ) {
    return {
      ok: false,
      code: "invalid_classification",
      message: "Выберите тип товара",
      field: "classification",
    }
  }
  const collection_key = typeof body.collection_key === "string" ? body.collection_key : ""
  if (!isActiveSellerCollectionKey(collection_key)) {
    return {
      ok: false,
      code: "invalid_collection",
      message: "Выберите коллекцию",
      field: "collection_key",
    }
  }
  return {
    title,
    sku,
    classification,
    collection_key: collection_key as WoodrightActiveCollectionKey,
  }
}

export function buildCreateProductDraftSpec(input: CreateProductInput): CreateProductDraftSpec {
  const collection_label =
    resolveAdminCollectionLabel({ metadataCollection: input.collection_key }) ?? input.collection_key
  return {
    title: input.title,
    sku: input.sku,
    handle: handleFromSellerSku(input.sku),
    classification: input.classification,
    collection_key: input.collection_key,
    collection_label,
    status: "draft",
    option_title: "Default",
    option_value: "Default",
    variant_title: "Default",
  }
}

export function isCreateProductFailure(
  value: CreateProductFailure | CreateProductInput
): value is CreateProductFailure {
  return "ok" in value && value.ok === false
}

export async function createWoodrightDraftProduct(
  body: unknown,
  ports: CreateProductPorts
): Promise<CreateProductFailure | CreateProductSuccess> {
  const parsed = parseCreateProductBody(body)
  if (isCreateProductFailure(parsed)) return parsed

  const spec = buildCreateProductDraftSpec(parsed)
  const conflict = await ports.findSkuConflict(spec.sku)
  if (conflict) {
    return {
      ok: false,
      code: "duplicate_sku",
      message: `Такой артикул уже используется у товара «${conflict.title}»`,
      field: "sku",
    }
  }

  let productId: string | null = null
  let classificationId: string | null = null
  try {
    const created = await ports.createDraftProduct(spec)
    productId = created.id
    const classification = await ports.createClassification(spec.classification)
    classificationId = classification.id
    await ports.linkClassification(productId, classificationId)
    const product = await ports.loadSellerProduct(productId)
    if (product.status === "published") {
      await ports.deleteProduct(productId)
      return {
        ok: false,
        code: "accidental_publish",
        message: "Не удалось создать черновик",
      }
    }
    return { ok: true, product }
  } catch {
    let productCleanupFailed = false
    let classificationCleanupFailed = false
    if (productId) {
      try {
        await ports.deleteProduct(productId)
      } catch {
        productCleanupFailed = true
      }
    }
    if (classificationId) {
      try {
        await ports.deleteClassification(classificationId)
      } catch {
        classificationCleanupFailed = true
      }
    }
    if (productCleanupFailed || classificationCleanupFailed) {
      ports.onCompensationIssue?.({
        stage: "cleanup",
        productId,
        classificationId,
        productCleanupFailed,
        classificationCleanupFailed,
      })
    }
    return {
      ok: false,
      code: "create_failed",
      message: "Не удалось создать товар",
    }
  }
}
