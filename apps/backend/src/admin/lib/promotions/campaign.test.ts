import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { checkCampaignCompatibility, describeCampaign } from "./campaign.ts"

const NOW = new Date("2026-07-12T12:00:00.000Z")

describe("checkCampaignCompatibility", () => {
  it("accepts a plain campaign without budget", () => {
    const out = checkCampaignCompatibility({
      campaign: { id: "camp_1", name: "Лето" },
      now: NOW,
    })
    assert.equal(out.ok, true)
    assert.deepEqual(out.errors, [])
  })

  it("blocks currency mismatch against spend budget", () => {
    const out = checkCampaignCompatibility({
      promotion_currency_code: "usd",
      campaign: {
        id: "camp_1",
        budget: { type: "spend", currency_code: "rub", limit: 100000 },
      },
      now: NOW,
    })
    assert.equal(out.ok, false)
    assert.ok(out.errors.some((e) => /USD/.test(e) && /RUB/.test(e)))
  })

  it("accepts matching currency against spend budget", () => {
    const out = checkCampaignCompatibility({
      promotion_currency_code: "rub",
      campaign: {
        id: "camp_1",
        budget: { type: "spend", currency_code: "rub", limit: 100000 },
      },
      now: NOW,
    })
    assert.equal(out.ok, true)
  })

  it("does not require currency for usage budgets", () => {
    const out = checkCampaignCompatibility({
      promotion_currency_code: "rub",
      campaign: {
        id: "camp_1",
        budget: { type: "usage", limit: 100 },
      },
      now: NOW,
    })
    assert.equal(out.ok, true)
  })

  it("blocks spend budget without currency", () => {
    const out = checkCampaignCompatibility({
      campaign: { id: "camp_1", budget: { type: "spend", limit: 100000 } },
      now: NOW,
    })
    assert.equal(out.ok, false)
  })

  it("blocks inverted campaign dates", () => {
    const out = checkCampaignCompatibility({
      campaign: {
        id: "camp_1",
        starts_at: "2026-08-01T00:00:00.000Z",
        ends_at: "2026-07-01T00:00:00.000Z",
      },
      now: NOW,
    })
    assert.equal(out.ok, false)
  })

  it("warns about ended campaigns without blocking", () => {
    const out = checkCampaignCompatibility({
      campaign: { id: "camp_1", ends_at: "2026-06-01T00:00:00.000Z" },
      now: NOW,
    })
    assert.equal(out.ok, true)
    assert.ok(out.warnings.some((w) => /завершилась/.test(w)))
  })

  it("warns about exhausted budget", () => {
    const out = checkCampaignCompatibility({
      campaign: {
        id: "camp_1",
        budget: { type: "usage", limit: 10, used: 10 },
      },
      now: NOW,
    })
    assert.equal(out.ok, true)
    assert.ok(out.warnings.some((w) => /исчерпан/.test(w)))
  })
})

describe("describeCampaign", () => {
  it("describes name, dates and usage budget", () => {
    const out = describeCampaign({
      id: "camp_1",
      name: "Лето 2026",
      starts_at: "2026-08-01T00:00:00.000Z",
      ends_at: "2026-08-31T00:00:00.000Z",
      budget: { type: "usage", limit: 100 },
    })
    assert.match(out, /Лето 2026/)
    assert.match(out, /лимит 100 применений/)
  })

  it("handles missing dates honestly", () => {
    const out = describeCampaign({ id: "camp_1", name: "Без дат" })
    assert.match(out, /без ограничения по датам/)
  })
})
