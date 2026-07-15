/**
 * Fidelity: catalog read caching helpers stay scoped (no cart/PDP no-store bleed).
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"

const libDir = dirname(fileURLToPath(import.meta.url))
const apiBase = readFileSync(join(libDir, "api/base.ts"), "utf8")
const productsApi = readFileSync(join(libDir, "api/products.ts"), "utf8")
const roomSetsApi = readFileSync(join(libDir, "api/room-sets.ts"), "utf8")

describe("catalog-fetch-cache fidelity", () => {
  it("exposes medusaCatalogFetch with revalidate override", () => {
    assert.match(apiBase, /export function medusaCatalogFetch/)
    assert.match(apiBase, /MEDUSA_CATALOG_REVALIDATE_SECONDS/)
    assert.match(apiBase, /next:\s*\{\s*revalidate/)
    assert.match(apiBase, /cache:\s*"no-store"/)
  })

  it("keeps medusaFetch as no-store for cart/detail paths", () => {
    assert.match(apiBase, /export function medusaFetch/)
    assert.match(apiBase, /function medusaFetch[\s\S]*cache:\s*"no-store"/)
  })

  it("wraps getCatalogProducts in requestCache + medusaCatalogFetch", () => {
    assert.match(productsApi, /function requestCache/)
    assert.match(productsApi, /getCatalogProducts = requestCache\(/)
    assert.match(productsApi, /medusaCatalogFetch/)
    assert.match(productsApi, /getProduct[\s\S]*medusaFetch/)
  })

  it("uses catalog fetch for room list and product_ids only", () => {
    assert.match(roomSetsApi, /getRoomSets[\s\S]*medusaCatalogFetch/)
    assert.match(roomSetsApi, /product_ids[\s\S]*medusaCatalogFetch/)
    assert.match(roomSetsApi, /getRoomSetBySlug[\s\S]*medusaFetch/)
    assert.match(roomSetsApi, /getRoomSetStorefrontBySlug[\s\S]*medusaFetch/)
  })
})
