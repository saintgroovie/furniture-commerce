import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  assertCatalogPromoGate,
  CATALOG_PROMO_CONFIRM_EXPECTED,
  CATALOG_PROMO_PRODUCTION_ACK_EXPECTED,
} from "./catalog-promo-launch-gate.ts"
import {
  CATALOG_PROMO_LAUNCH_PRODUCTS,
  CATALOG_PROMO_MANIFEST_SHA_EXPECTED,
  computeCatalogPromoManifestSha,
  validateCatalogPromoManifest,
} from "./catalog-promo-launch-manifest.ts"

const LOCAL = "postgres://u:p@localhost:5432/woodright_promo_20260908"
const PROD = "postgres://u:p@db:5432/woodright_production"
const STAGING = "postgres://u:p@db:5432/woodright_staging"

describe("catalog promo manifest", () => {
  it("SHA pin matches and manifest is internally consistent", () => {
    assert.equal(computeCatalogPromoManifestSha(), CATALOG_PROMO_MANIFEST_SHA_EXPECTED)
    assert.deepEqual(validateCatalogPromoManifest(), { ok: true })
    assert.equal(CATALOG_PROMO_LAUNCH_PRODUCTS.length, 2)
    for (const p of CATALOG_PROMO_LAUNCH_PRODUCTS) {
      assert.equal(p.sale_price, Math.round(p.expected_base_price * 0.9))
    }
  })
})

describe("assertCatalogPromoGate", () => {
  it("local dry-run ok", () => {
    const r = assertCatalogPromoGate({
      env: { CATALOG_PROMO_TARGET: "local", CATALOG_PROMO_MODE: "dry-run" },
      databaseUrl: LOCAL,
    })
    assert.equal(r.ok, true)
    if (r.ok) assert.equal(r.apply, false)
  })

  it("missing target / mode fail closed", () => {
    assert.equal(assertCatalogPromoGate({ env: {}, databaseUrl: LOCAL }).ok, false)
    assert.equal(
      assertCatalogPromoGate({ env: { CATALOG_PROMO_TARGET: "local" }, databaseUrl: LOCAL }).ok,
      false
    )
  })

  it("local target refuses production/staging databases", () => {
    const r = assertCatalogPromoGate({
      env: { CATALOG_PROMO_TARGET: "local", CATALOG_PROMO_MODE: "apply" },
      databaseUrl: PROD,
    })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.code, "db_target_mismatch")
  })

  it("production apply requires both tokens", () => {
    const base = { CATALOG_PROMO_TARGET: "production", CATALOG_PROMO_MODE: "apply" }
    const noTokens = assertCatalogPromoGate({ env: base, databaseUrl: PROD })
    assert.equal(noTokens.ok, false)
    if (!noTokens.ok) assert.equal(noTokens.code, "missing_production_confirm")
    const confirmOnly = assertCatalogPromoGate({
      env: { ...base, CATALOG_PROMO_CONFIRM: CATALOG_PROMO_CONFIRM_EXPECTED },
      databaseUrl: PROD,
    })
    assert.equal(confirmOnly.ok, false)
    if (!confirmOnly.ok) assert.equal(confirmOnly.code, "missing_production_ack")
    const full = assertCatalogPromoGate({
      env: {
        ...base,
        CATALOG_PROMO_CONFIRM: CATALOG_PROMO_CONFIRM_EXPECTED,
        CATALOG_PROMO_PRODUCTION_ACK: CATALOG_PROMO_PRODUCTION_ACK_EXPECTED,
      },
      databaseUrl: PROD,
    })
    assert.equal(full.ok, true)
    if (full.ok) assert.equal(full.dbName, "woodright_production")
  })

  it("production dry-run does not need tokens but needs the production db", () => {
    const ok = assertCatalogPromoGate({
      env: { CATALOG_PROMO_TARGET: "production", CATALOG_PROMO_MODE: "dry-run" },
      databaseUrl: PROD,
    })
    assert.equal(ok.ok, true)
    const wrongDb = assertCatalogPromoGate({
      env: { CATALOG_PROMO_TARGET: "production", CATALOG_PROMO_MODE: "dry-run" },
      databaseUrl: STAGING,
    })
    assert.equal(wrongDb.ok, false)
  })
})
