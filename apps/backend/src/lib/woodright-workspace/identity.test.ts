import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { matchCandidates, normalizeEmail, normalizePhone, withholdIncompleteLookup } from "./identity.ts"

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    assert.equal(normalizeEmail("  Anna@Woodright.ru "), "anna@woodright.ru")
  })
  it("rejects empty", () => {
    assert.equal(normalizeEmail("  "), null)
    assert.equal(normalizeEmail(null), null)
  })
})

describe("normalizePhone", () => {
  it("maps Russian 8 and 10-digit forms to 7", () => {
    assert.equal(normalizePhone("+7 (495) 123-45-67"), "74951234567")
    assert.equal(normalizePhone("8 495 123 45 67"), "74951234567")
    assert.equal(normalizePhone("4951234567"), "74951234567")
  })
  it("rejects short numbers", () => {
    assert.equal(normalizePhone("123"), null)
  })
})

describe("matchCandidates", () => {
  const people = [
    { id: "lead_a", email: "A@X.ru", phone: "+7 900 000-00-01" },
    { id: "lead_b", email: "b@x.ru", phone: "8 900 000-00-02" },
  ]

  it("offers a single email hit without merging", () => {
    assert.deepEqual(matchCandidates(people, { email: "a@x.ru" }), {
      status: "linked",
      ids: ["lead_a"],
    })
  })

  it("does not auto-merge an ambiguous phone", () => {
    const ambiguous = [
      { id: "c1", phone: "+7 900 111-22-33" },
      { id: "c2", phone: "8 (900) 111-22-33" },
    ]
    const result = matchCandidates(ambiguous, { phone: "79001112233" })
    assert.equal(result.status, "needs_review")
    assert.deepEqual(result.ids.sort(), ["c1", "c2"])
  })

  it("returns none when nothing matches", () => {
    assert.equal(matchCandidates(people, { email: "no@one.ru" }).status, "none")
  })

  it("does not keep a unique email hit when the phone lookup failed", () => {
    const result = withholdIncompleteLookup(
      { status: "linked", ids: ["c1"] },
      { phonePresent: true, phoneLookupFailed: true }
    )
    assert.equal(result.status, "needs_review")
    assert.equal(result.lookup_incomplete, true)
  })
})
