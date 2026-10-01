import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { dueInstant, dueOnFromPreset, followUpHref, isFollowUpDue, moscowCalendarDate } from "./follow-up.ts"

describe("follow-up due dates", () => {
  const now = new Date("2026-10-01T21:30:00.000Z")

  it("uses the Moscow calendar date", () => {
    assert.equal(moscowCalendarDate(now), "2026-10-02")
  })

  it("maps the quick values onto Moscow dates", () => {
    assert.equal(dueOnFromPreset("today", now), "2026-10-02")
    assert.equal(dueOnFromPreset("tomorrow", now), "2026-10-03")
    assert.equal(dueOnFromPreset("in_3_days", now), "2026-10-05")
  })

  it("shows a follow-up on Сегодня only when its date has arrived", () => {
    assert.equal(isFollowUpDue("2026-10-02T00:00:00.000Z", now), true)
    assert.equal(isFollowUpDue("2026-10-01T00:00:00.000Z", now), true)
    assert.equal(isFollowUpDue("2026-10-03T00:00:00.000Z", now), false)
    assert.equal(isFollowUpDue(null, now), false)
  })

  it("rejects a date that is not a calendar day", () => {
    assert.equal(dueInstant("2026-10-02"), "2026-10-02T00:00:00.000Z")
    assert.equal(dueInstant("02.10.2026"), null)
    assert.equal(dueInstant("2026-13-40"), null)
    assert.equal(dueInstant("2026-02-31"), null)
  })

  it("points each entity at its existing screen", () => {
    assert.equal(followUpHref("person", "lead_1"), "/people/lead_1")
    assert.equal(followUpHref("request", "req_1"), "/requests/req_1")
    assert.equal(followUpHref("company", "comp_1"), "/companies/comp_1")
    assert.equal(followUpHref("order", "order_1"), "/orders/order_1")
  })
})
