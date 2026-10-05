import { MedusaService } from "@medusajs/framework/utils"
import { ProductCompatibility } from "./models/product-compatibility"

class ProductCompatibilityModuleService extends MedusaService({
  ProductCompatibility,
}) {
  /**
   * Insert the pair once. A repeat call returns the existing row.
   * Self-links are refused.
   */
  async ensureLink(accessoryProductId: string, productId: string) {
    if (!accessoryProductId || !productId || accessoryProductId === productId) {
      throw new Error("compatibility link requires two different products")
    }
    const existing = await this.listProductCompatibilities(
      {
        accessory_product_id: accessoryProductId,
        product_id: productId,
      },
      { take: 1 }
    )
    if (existing[0]) return existing[0]
    return this.createProductCompatibilities({
      accessory_product_id: accessoryProductId,
      product_id: productId,
    })
  }
}

export default ProductCompatibilityModuleService
