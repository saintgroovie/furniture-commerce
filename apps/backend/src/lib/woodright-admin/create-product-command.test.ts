import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  buildCreateProductDraftSpec,
  createWoodrightDraftProduct,
  normalizeSellerSku,
  parseCreateProductBody,
  sellerSkuHasCyrillic,
  type CreateProductPorts,
} from "./create-product-command.ts"
import type { SellerProduct } from "./seller-product-types.ts"
import { computeWorkspacePublishReadiness } from "./publish-readiness.ts"

function sellerDraft(overrides: Partial<SellerProduct> = {}): SellerProduct {
  return {
    id: "prod_new",
    title: "Новая кровать",
    handle: "ol-99-9",
    status: "draft",
    thumbnail: null,
    updated_at: null,
    collection_label: "Оливер",
    classification: "STANDARD",
    skus: ["OL-99-9"],
    variants: [{ id: "var_1", sku: "OL-99-9", title: "Default", rub_price: null }],
    price_display: { kind: "none" },
    readiness: {
      published: false,
      visible: false,
      has_price: false,
      has_media: false,
      warning_count: 0,
      error_count: 0,
      codes: ["draft", "missing_media", "missing_price"],
    },
    execution_media_guard: false,
    dimensions: {},
    image_urls: [],
    general_image_urls: [],
    execution_photo_count: 0,
    execution_finishes: [],
    has_material_tiers: false,
    collection_key: "oliver",
    subtitle: "",
    description: "",
    publish: computeWorkspacePublishReadiness({
      title: "Новая кровать",
      status: "draft",
      metadata: { collection: "oliver" },
      variants: [{ sku: "OL-99-9" }],
      product_classification: { product_type: "STANDARD" },
    }),
    ...overrides,
  }
}

function ports(overrides: Partial<CreateProductPorts> = {}): CreateProductPorts {
  return {
    findSkuConflict: async () => null,
    createDraftProduct: async () => ({ id: "prod_new" }),
    createClassification: async (type) => ({ id: `cls_${type}` }),
    linkClassification: async () => undefined,
    deleteProduct: async () => undefined,
    deleteClassification: async () => undefined,
    loadSellerProduct: async () => sellerDraft(),
    ...overrides,
  }
}

describe("create product command", () => {
  it("uppercases and trims SKU", () => {
    assert.equal(normalizeSellerSku("  ol-test-1  "), "OL-TEST-1")
    assert.equal(normalizeSellerSku("ol  05  1"), "OL 05 1")
    assert.equal(sellerSkuHasCyrillic("OL-05-Н"), true)
    assert.equal(sellerSkuHasCyrillic("OL-05-1"), false)
  })

  it("parses a STANDARD draft payload", () => {
    const parsed = parseCreateProductBody({
      title: "Oliver",
      sku: "OL-99-9",
      classification: "STANDARD",
      collection_key: "oliver",
    })
    assert.equal("ok" in parsed && parsed.ok === false, false)
    if (!("ok" in parsed)) {
      const spec = buildCreateProductDraftSpec(parsed)
      assert.equal(spec.status, "draft")
      assert.equal(spec.handle, "ol-99-9")
      assert.equal(spec.option_title, "Default")
      assert.equal(spec.classification, "STANDARD")
    }
  })

  it("creates STANDARD without publishing", async () => {
    const result = await createWoodrightDraftProduct(
      {
        title: "Oliver",
        sku: "OL-99-9",
        classification: "STANDARD",
        collection_key: "oliver",
      },
      ports()
    )
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.product.status, "draft")
      assert.equal(result.product.classification, "STANDARD")
      assert.equal(result.product.skus[0], "OL-99-9")
    }
  })

  it("creates CONFIGURABLE draft", async () => {
    const result = await createWoodrightDraftProduct(
      {
        title: "Greenwich",
        sku: "GR-01-1",
        classification: "CONFIGURABLE",
        collection_key: "greenwich",
      },
      ports({
        loadSellerProduct: async () =>
          sellerDraft({
            classification: "CONFIGURABLE",
            collection_key: "greenwich",
            skus: ["GR-01-1"],
          }),
      })
    )
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.product.classification, "CONFIGURABLE")
  })

  it("creates BESPOKE draft without requiring a cart price", async () => {
    const result = await createWoodrightDraftProduct(
      {
        title: "Кухня",
        sku: "BS-01-1",
        classification: "BESPOKE",
        collection_key: "oliver",
      },
      ports({
        loadSellerProduct: async () =>
          sellerDraft({
            classification: "BESPOKE",
            skus: ["BS-01-1"],
            price_display: { kind: "none" },
          }),
      })
    )
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.product.classification, "BESPOKE")
      assert.equal(result.product.status, "draft")
    }
  })

  it("rejects duplicate SKU without creating", async () => {
    let created = 0
    const result = await createWoodrightDraftProduct(
      {
        title: "X",
        sku: "OL-01-1",
        classification: "STANDARD",
        collection_key: "oliver",
      },
      ports({
        findSkuConflict: async () => ({ title: "Oliver" }),
        createDraftProduct: async () => {
          created += 1
          return { id: "nope" }
        },
      })
    )
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.code, "duplicate_sku")
      assert.match(result.message, /Oliver/)
      assert.equal(result.message.includes("prod_"), false)
    }
    assert.equal(created, 0)
  })

  it("rejects invalid collection", () => {
    const parsed = parseCreateProductBody({
      title: "X",
      sku: "OL-01-1",
      classification: "STANDARD",
      collection_key: "provence",
    })
    assert.equal("ok" in parsed && parsed.ok === false, true)
    if ("ok" in parsed && parsed.ok === false) {
      assert.equal(parsed.code, "invalid_collection")
    }
  })

  it("rejects unknown classification", () => {
    const parsed = parseCreateProductBody({
      title: "X",
      sku: "OL-01-1",
      classification: "KIDS",
      collection_key: "oliver",
    })
    assert.equal("ok" in parsed && parsed.ok === false, true)
  })

  it("rejects caller-supplied status instead of publishing", () => {
    const parsed = parseCreateProductBody({
      title: "X",
      sku: "OL-01-1",
      classification: "STANDARD",
      collection_key: "oliver",
      status: "published",
    })
    assert.equal("ok" in parsed && parsed.ok === false, true)
    if ("ok" in parsed && parsed.ok === false) {
      assert.equal(parsed.code, "unknown_key")
      assert.equal(parsed.field, "status")
    }
  })

  it("rejects metadata and cart flags from the caller", () => {
    const metadata = parseCreateProductBody({
      title: "X",
      sku: "OL-01-1",
      classification: "STANDARD",
      collection_key: "oliver",
      metadata: { classification: "BESPOKE" },
    })
    assert.equal("ok" in metadata && metadata.ok === false, true)
    const cart = parseCreateProductBody({
      title: "X",
      sku: "OL-01-1",
      classification: "STANDARD",
      collection_key: "oliver",
      cart_allowed: true,
    })
    assert.equal("ok" in cart && cart.ok === false, true)
  })

  it("compensates when linking fails", async () => {
    const deleted: string[] = []
    const result = await createWoodrightDraftProduct(
      {
        title: "X",
        sku: "OL-77-1",
        classification: "STANDARD",
        collection_key: "oliver",
      },
      ports({
        linkClassification: async () => {
          throw new Error("link failed")
        },
        deleteProduct: async (id) => {
          deleted.push(id)
        },
      })
    )
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.code, "create_failed")
    assert.deepEqual(deleted, ["prod_new"])
  })

  it("does not report success when cleanup itself fails", async () => {
    const issues: Array<{ productId: string | null; classificationId: string | null }> = []
    const result = await createWoodrightDraftProduct(
      {
        title: "X",
        sku: "OL-77-2",
        classification: "STANDARD",
        collection_key: "oliver",
      },
      ports({
        createClassification: async () => {
          throw new Error("classification failed")
        },
        deleteProduct: async () => {
          throw new Error("delete failed")
        },
        onCompensationIssue: (info) => {
          issues.push({ productId: info.productId, classificationId: info.classificationId })
        },
      })
    )
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.code, "create_failed")
      assert.equal(result.message.includes("prod_"), false)
    }
    assert.equal(issues.length, 1)
    assert.equal(issues[0]?.productId, "prod_new")
  })
})
