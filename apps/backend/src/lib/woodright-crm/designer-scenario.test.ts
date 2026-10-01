import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { assessDesignerScenario } from "./designer-scenario.ts"

const okInput = {
  designer: { id: "lead_designer", roles: ["designer"], company_ids: ["comp_1"] },
  company: { id: "comp_1" },
  end_customer: { id: "lead_client" },
  request: { lead_id: "lead_designer", company_id: "comp_1", counterparty_lead_id: "lead_client" },
  order_ids: ["order_1", "order_2"],
}

describe("designer scenario", () => {
  it("accepts one designer person, one company, one end customer, and order ids", () => {
    assert.deepEqual(assessDesignerScenario(okInput), { ok: true })
  })

  it("refuses a second customer record and a copied order", () => {
    const same = assessDesignerScenario({ ...okInput, end_customer: { id: "lead_designer" } })
    assert.equal(same.ok, false)
    const noRole = assessDesignerScenario({
      ...okInput,
      designer: { id: "lead_designer", roles: ["buyer"], company_ids: ["comp_1"] },
    })
    assert.equal(noRole.ok, false)
    if (!noRole.ok) assert.equal(noRole.reason, "designer_role")
  })
})
