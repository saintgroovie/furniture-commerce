import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  buildCreatePromotionPayload,
  campaignIdentifierFromName,
  type PromotionWizardValues,
} from "./payload.ts"

function base(overrides?: Partial<PromotionWizardValues>): PromotionWizardValues {
  return {
    trigger: "code",
    code: "SUMMER10",
    kind: "percentage",
    percent: 10,
    scope: "order",
    status: "draft",
    ...overrides,
  }
}

describe("buildCreatePromotionPayload", () => {
  it("builds a percentage code promotion on the whole order", () => {
    const out = buildCreatePromotionPayload(base())
    assert.equal(out.ok, true)
    if (out.ok) {
      assert.deepEqual(out.payload, {
        code: "SUMMER10",
        type: "standard",
        status: "draft",
        is_automatic: false,
        application_method: {
          type: "percentage",
          value: 10,
          target_type: "order",
        },
      })
    }
  })

  it("builds an automatic percentage promotion (code still required)", () => {
    const out = buildCreatePromotionPayload(base({ trigger: "automatic", code: "auto5" }))
    assert.equal(out.ok, true)
    if (out.ok) {
      assert.equal(out.payload.is_automatic, true)
      assert.equal(out.payload.code, "auto5")
    }
  })

  it("builds fixed RUB with currency on method and mirrored currency rule", () => {
    const out = buildCreatePromotionPayload(
      base({ kind: "fixed", percent: null, amount: 3000, currency_code: "rub" })
    )
    assert.equal(out.ok, true)
    if (out.ok) {
      assert.equal(out.payload.application_method.type, "fixed")
      assert.equal(out.payload.application_method.value, 3000)
      assert.equal(out.payload.application_method.currency_code, "rub")
      assert.deepEqual(out.payload.rules, [
        { attribute: "currency_code", operator: "eq", values: ["rub"] },
      ])
    }
  })

  it("targets products with in-rule and across allocation", () => {
    const out = buildCreatePromotionPayload(
      base({ scope: "products", product_ids: ["prod_1", "prod_2", "prod_1"] })
    )
    assert.equal(out.ok, true)
    if (out.ok) {
      assert.equal(out.payload.application_method.target_type, "items")
      assert.equal(out.payload.application_method.allocation, "across")
      assert.deepEqual(out.payload.application_method.target_rules, [
        { attribute: "items.product.id", operator: "in", values: ["prod_1", "prod_2"] },
      ])
      assert.equal("max_quantity" in out.payload.application_method, false)
    }
  })

  it("targets collections", () => {
    const out = buildCreatePromotionPayload(
      base({ scope: "collections", collection_ids: ["col_1"] })
    )
    assert.equal(out.ok, true)
    if (out.ok) {
      assert.deepEqual(out.payload.application_method.target_rules, [
        { attribute: "items.product.collection_id", operator: "in", values: ["col_1"] },
      ])
    }
  })

  it("emits one ne rule per excluded product id", () => {
    const out = buildCreatePromotionPayload(
      base({
        scope: "collections",
        collection_ids: ["col_1"],
        excluded_product_ids: ["prod_8", "prod_9"],
      })
    )
    assert.equal(out.ok, true)
    if (out.ok) {
      assert.deepEqual(out.payload.application_method.target_rules, [
        { attribute: "items.product.collection_id", operator: "in", values: ["col_1"] },
        { attribute: "items.product.id", operator: "ne", values: ["prod_8"] },
        { attribute: "items.product.id", operator: "ne", values: ["prod_9"] },
      ])
    }
  })

  it("passes campaign_id through", () => {
    const out = buildCreatePromotionPayload(base({ campaign_id: "camp_1" }))
    assert.equal(out.ok, true)
    if (out.ok) assert.equal(out.payload.campaign_id, "camp_1")
  })

  it("fails closed on nested inline campaign (stock Admin first)", () => {
    const out = buildCreatePromotionPayload(
      base({
        campaign: {
          name: "Лето 2026",
          campaign_identifier: "leto-2026",
          starts_at: "2026-08-01T00:00:00.000Z",
          ends_at: "2026-08-31T00:00:00.000Z",
        },
      })
    )
    assert.equal(out.ok, false)
    if (!out.ok) {
      assert.match(out.errors.join(" "), /стандартной админке/i)
    }
  })

  it("rejects missing code", () => {
    const out = buildCreatePromotionPayload(base({ code: "  " }))
    assert.equal(out.ok, false)
    if (!out.ok) assert.ok(out.errors.some((e) => /код/i.test(e)))
  })

  it("rejects percentage out of range", () => {
    for (const percent of [0, -5, 101]) {
      const out = buildCreatePromotionPayload(base({ percent }))
      assert.equal(out.ok, false, String(percent))
    }
  })

  it("rejects fixed amount that is zero, negative or fractional", () => {
    for (const amount of [0, -100, 99.5]) {
      const out = buildCreatePromotionPayload(
        base({ kind: "fixed", percent: null, amount })
      )
      assert.equal(out.ok, false, String(amount))
    }
  })

  it("rejects products scope without products", () => {
    const out = buildCreatePromotionPayload(base({ scope: "products", product_ids: [] }))
    assert.equal(out.ok, false)
  })

  it("rejects a product both selected and excluded", () => {
    const out = buildCreatePromotionPayload(
      base({
        scope: "products",
        product_ids: ["prod_1"],
        excluded_product_ids: ["prod_1"],
      })
    )
    assert.equal(out.ok, false)
    if (!out.ok) assert.ok(out.errors.some((e) => /исключить/i.test(e)))
  })

  it("rejects exclusions for order scope", () => {
    const out = buildCreatePromotionPayload(
      base({ scope: "order", excluded_product_ids: ["prod_1"] })
    )
    assert.equal(out.ok, false)
  })

  it("rejects campaign_id together with inline campaign", () => {
    const out = buildCreatePromotionPayload(
      base({
        campaign_id: "camp_1",
        campaign: { name: "X", campaign_identifier: "x" },
      })
    )
    assert.equal(out.ok, false)
  })

  it("rejects inverted inline campaign dates", () => {
    const out = buildCreatePromotionPayload(
      base({
        campaign: {
          name: "X",
          campaign_identifier: "x",
          starts_at: "2026-09-01T00:00:00.000Z",
          ends_at: "2026-08-01T00:00:00.000Z",
        },
      })
    )
    assert.equal(out.ok, false)
  })
})

describe("campaignIdentifierFromName", () => {
  it("transliterates Russian names", () => {
    assert.equal(campaignIdentifierFromName("Лето 2026"), "leto-2026")
  })

  it("never returns an empty identifier", () => {
    assert.equal(campaignIdentifierFromName("!!!"), "campaign")
  })
})
