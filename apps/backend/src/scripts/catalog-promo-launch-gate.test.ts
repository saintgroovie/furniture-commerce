import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { readFileSync } from "node:fs"
import {
  assertCatalogPromoGate,
  CATALOG_PROMO_CONFIRM_EXPECTED,
  CATALOG_PROMO_PRODUCTION_ACK_EXPECTED,
  CATALOG_PROMO_PUBLIC_PRODUCTION_REFUSED,
} from "./catalog-promo-launch-gate.ts"
import bootstrapCatalogPromoLaunch from "./bootstrap-catalog-promo-launch.ts"
import {
  CATALOG_PROMO_LAUNCH_PRODUCTS,
  CATALOG_PROMO_MANIFEST_SHA_EXPECTED,
  computeCatalogPromoManifestSha,
  validateCatalogPromoManifest,
} from "./catalog-promo-launch-manifest.ts"

const LOCAL = "postgres://u:p@localhost:5432/woodright_promo_20260908"
const PROD = "postgres://u:p@db:5432/woodright_production"
const STAGING = "postgres://u:p@db:5432/woodright_staging"
const PUBLIC = "postgres://u:p@db.internal:5432/woodright_public_production?sslmode=require"

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

  it("refuses woodright_public_production in every target before any write", async () => {
    const targets = ["local", "staging", "production", "alias-bypass", ""]
    for (const target of targets) {
      const env: NodeJS.ProcessEnv = {
        CATALOG_PROMO_MODE: "apply",
        CATALOG_PROMO_CONFIRM: CATALOG_PROMO_CONFIRM_EXPECTED,
        CATALOG_PROMO_PRODUCTION_ACK: CATALOG_PROMO_PRODUCTION_ACK_EXPECTED,
      }
      if (target) env.CATALOG_PROMO_TARGET = target
      const r = assertCatalogPromoGate({ env, databaseUrl: PUBLIC })
      assert.equal(r.ok, false)
      if (!r.ok) assert.equal(r.code, CATALOG_PROMO_PUBLIC_PRODUCTION_REFUSED)
    }

    const saved = {
      target: process.env.CATALOG_PROMO_TARGET,
      mode: process.env.CATALOG_PROMO_MODE,
      url: process.env.DATABASE_URL,
      confirm: process.env.CATALOG_PROMO_CONFIRM,
      ack: process.env.CATALOG_PROMO_PRODUCTION_ACK,
      code: process.exitCode,
    }
    process.env.CATALOG_PROMO_TARGET = "local"
    process.env.CATALOG_PROMO_MODE = "apply"
    process.env.DATABASE_URL = PUBLIC
    process.env.CATALOG_PROMO_CONFIRM = CATALOG_PROMO_CONFIRM_EXPECTED
    process.env.CATALOG_PROMO_PRODUCTION_ACK = CATALOG_PROMO_PRODUCTION_ACK_EXPECTED
    process.exitCode = undefined
    let touched = false
    try {
      await bootstrapCatalogPromoLaunch({
        container: {
          resolve() {
            touched = true
            throw new Error("bootstrap reached a module before refusal")
          },
        },
      } as never)
    } finally {
      for (const [key, value] of [
        ["CATALOG_PROMO_TARGET", saved.target],
        ["CATALOG_PROMO_MODE", saved.mode],
        ["DATABASE_URL", saved.url],
        ["CATALOG_PROMO_CONFIRM", saved.confirm],
        ["CATALOG_PROMO_PRODUCTION_ACK", saved.ack],
      ] as const) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
      process.exitCode = saved.code
    }
    assert.equal(touched, false)

    const src = readFileSync(new URL("./bootstrap-catalog-promo-launch.ts", import.meta.url), "utf8")
    const gateAt = src.indexOf("assertCatalogPromoGate()")
    const queryAt = src.indexOf("await query.graph")
    const priceAt = src.indexOf("await ensureCatalogPromoPriceList")
    const slotAt = src.indexOf("upsertCatalogSlot")
    assert.ok(gateAt >= 0 && queryAt > gateAt && priceAt > gateAt && slotAt > gateAt)
  })
})
