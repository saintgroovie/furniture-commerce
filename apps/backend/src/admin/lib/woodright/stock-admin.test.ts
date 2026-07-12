import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  STOCK_ADMIN_LABEL,
  stockAdminCampaignsPath,
  stockAdminHomePath,
  stockAdminProductCreatePath,
  stockAdminProductPath,
  stockAdminProductsPath,
  stockAdminPromotionPath,
  stockAdminPromotionsPath,
} from "./stock-admin.ts"

describe("stock admin paths and label", () => {
  it("uses the single approved Russian label", () => {
    assert.equal(STOCK_ADMIN_LABEL, "Стандартная админка Medusa")
  })

  it("builds stable stock admin paths", () => {
    assert.equal(stockAdminHomePath(), "/app")
    assert.equal(stockAdminProductsPath(), "/app/products")
    assert.equal(stockAdminProductsPath({ status: "draft" }), "/app/products?status=draft")
    assert.equal(stockAdminProductPath("prod_1"), "/app/products/prod_1")
    assert.equal(stockAdminProductCreatePath(), "/app/products/create")
    assert.equal(stockAdminPromotionsPath(), "/app/promotions")
    assert.equal(stockAdminPromotionPath("promo_1"), "/app/promotions/promo_1")
    assert.equal(stockAdminCampaignsPath(), "/app/campaigns")
  })
})
