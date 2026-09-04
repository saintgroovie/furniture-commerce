import { createProductsWorkflow } from "@medusajs/medusa/core-flows"
import { Modules } from "@medusajs/framework/utils"
import { PRODUCT_EXTENSION_MODULE } from "../../modules/product-extension"
import {
  createWoodrightDraftProduct,
  type CreateProductDraftSpec,
  type CreateProductPorts,
} from "./create-product-command"
import {
  loadSellerProductById,
  type QueryGraph,
} from "./seller-product"

type LinkService = {
  create: (data: Record<string, Record<string, string>>) => Promise<unknown>
}

type ProductModule = {
  deleteProducts: (ids: string[]) => Promise<unknown>
}

type ProductExtensionService = {
  createProductClassifications: (input: { product_type: string }) => Promise<unknown>
  deleteProductClassifications: (ids: string[]) => Promise<unknown>
}

function firstId(row: unknown): string | null {
  const item = Array.isArray(row) ? row[0] : row
  if (item && typeof item === "object" && "id" in item) {
    const id = (item as { id?: unknown }).id
    return typeof id === "string" ? id : null
  }
  return null
}

export function createWoodrightDraftPorts(scope: {
  resolve: (name: string) => unknown
}): CreateProductPorts {
  const query = scope.resolve("query") as QueryGraph
  const link = scope.resolve("link") as LinkService
  const productModule = scope.resolve(Modules.PRODUCT) as ProductModule
  const productExtension = scope.resolve(PRODUCT_EXTENSION_MODULE) as ProductExtensionService

  return {
    findSkuConflict: async (sku) => {
      const needle = sku.trim().toLowerCase()
      const { data } = await query.graph({
        entity: "product",
        fields: ["id", "title", "variants.sku"],
        pagination: { skip: 0, take: 400 },
      })
      for (const raw of data ?? []) {
        const product = raw as { title?: string; variants?: Array<{ sku?: string }> }
        const match = (product.variants ?? []).some(
          (variant) => typeof variant.sku === "string" && variant.sku.trim().toLowerCase() === needle
        )
        if (match && typeof product.title === "string") {
          return { title: product.title }
        }
      }
      return null
    },
    createDraftProduct: async (spec: CreateProductDraftSpec) => {
      const { result } = await createProductsWorkflow(
        scope as Parameters<typeof createProductsWorkflow>[0]
      ).run({
        input: {
          products: [
            {
              title: spec.title,
              handle: spec.handle,
              status: spec.status,
              metadata: {
                collection: spec.collection_key,
                collection_label: spec.collection_label,
              },
              options: [{ title: spec.option_title, values: [spec.option_value] }],
              variants: [
                {
                  title: spec.variant_title,
                  sku: spec.sku,
                  options: { [spec.option_title]: spec.option_value },
                },
              ],
            },
          ],
        },
      })
      const created = (result ?? [])[0] as { id?: string } | undefined
      if (!created?.id) throw new Error("createProductsWorkflow returned no product")
      return { id: created.id }
    },
    createClassification: async (type) => {
      const row = await productExtension.createProductClassifications({
        product_type: type,
      })
      const id = firstId(row)
      if (!id) throw new Error("classification create returned no id")
      return { id }
    },
    linkClassification: async (productId, classificationId) => {
      await link.create({
        [Modules.PRODUCT]: { product_id: productId },
        [PRODUCT_EXTENSION_MODULE]: { product_classification_id: classificationId },
      })
    },
    deleteProduct: async (id) => {
      await productModule.deleteProducts([id])
    },
    deleteClassification: async (id) => {
      await productExtension.deleteProductClassifications([id])
    },
    loadSellerProduct: async (id) => {
      const product = await loadSellerProductById(query, id)
      if (!product) throw new Error("created product could not be loaded")
      return product
    },
    onCompensationIssue: ({
      productId,
      classificationId,
      productCleanupFailed,
      classificationCleanupFailed,
    }) => {
      console.error("[woodright-admin] draft create compensation incomplete", {
        productId,
        classificationId,
        productCleanupFailed,
        classificationCleanupFailed,
      })
    },
  }
}

export { createWoodrightDraftProduct }
