import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  allRulesSupported,
  classifyRuleAttribute,
  describeOperator,
  describeRule,
} from "./rules.ts"

describe("classifyRuleAttribute", () => {
  it("supports the proven target attributes", () => {
    for (const attr of [
      "items.product.id",
      "items.product.collection_id",
      "items.product.categories.id",
      "items.product.type_id",
      "items.product.tags.id",
    ]) {
      const out = classifyRuleAttribute(attr, "target-rules")
      assert.equal(out.kind, "supported", attr)
    }
  })

  it("supports the proven condition attributes", () => {
    for (const attr of [
      "customer.groups.id",
      "region.id",
      "shipping_address.country_code",
      "sales_channel_id",
      "currency_code",
    ]) {
      const out = classifyRuleAttribute(attr, "rules")
      assert.equal(out.kind, "supported", attr)
    }
  })

  it("fails closed on variant targeting", () => {
    const out = classifyRuleAttribute("items.variant.id", "target-rules")
    assert.equal(out.kind, "fail_closed")
    if (out.kind === "fail_closed") {
      assert.match(out.reason, /вариант/i)
    }
  })

  it("fails closed on unknown attributes", () => {
    const out = classifyRuleAttribute("items.product.metadata.secret", "target-rules")
    assert.equal(out.kind, "fail_closed")
  })

  it("fails closed when attribute is valid but context is wrong", () => {
    const out = classifyRuleAttribute("customer.groups.id", "target-rules")
    assert.equal(out.kind, "fail_closed")
  })

  it("fails closed on empty attribute", () => {
    assert.equal(classifyRuleAttribute("", "rules").kind, "fail_closed")
    assert.equal(classifyRuleAttribute(null, "rules").kind, "fail_closed")
  })
})

describe("describeOperator", () => {
  it("maps proven operators", () => {
    assert.equal(describeOperator("in"), "включая")
    assert.equal(describeOperator("ne"), "кроме")
    assert.equal(describeOperator("eq"), "равно")
  })

  it("returns null for unknown operators", () => {
    assert.equal(describeOperator("between"), null)
    assert.equal(describeOperator(null), null)
  })
})

describe("describeRule", () => {
  it("builds a Russian sentence without raw attribute paths", () => {
    const out = describeRule(
      {
        attribute: "items.product.collection_id",
        operator: "in",
        values: [{ value: "col_1", label: "Спальня" }],
      },
      "target-rules"
    )
    assert.equal(out.kind, "supported")
    if (out.kind === "supported") {
      assert.equal(out.text, "Коллекция: включая Спальня")
      assert.equal(out.is_exclusion, false)
      assert.ok(!out.text.includes("items.product"))
    }
  })

  it("marks ne rules as exclusions", () => {
    const out = describeRule(
      { attribute: "items.product.id", operator: "ne", values: ["prod_1"] },
      "target-rules"
    )
    assert.equal(out.kind, "supported")
    if (out.kind === "supported") {
      assert.equal(out.is_exclusion, true)
      assert.match(out.text, /кроме/)
    }
  })

  it("fails closed on unproven operator", () => {
    const out = describeRule(
      { attribute: "items.product.id", operator: "between", values: ["a"] },
      "target-rules"
    )
    assert.equal(out.kind, "fail_closed")
  })
})

describe("allRulesSupported", () => {
  it("is true for empty and fully supported lists", () => {
    assert.equal(allRulesSupported([], "target-rules"), true)
    assert.equal(allRulesSupported(null, "target-rules"), true)
    assert.equal(
      allRulesSupported(
        [{ attribute: "items.product.id", operator: "in", values: ["p"] }],
        "target-rules"
      ),
      true
    )
  })

  it("is false when any rule is unsupported", () => {
    assert.equal(
      allRulesSupported(
        [
          { attribute: "items.product.id", operator: "in", values: ["p"] },
          { attribute: "items.variant.id", operator: "in", values: ["v"] },
        ],
        "target-rules"
      ),
      false
    )
  })
})
