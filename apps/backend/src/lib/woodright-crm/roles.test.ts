import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { isCompanyType, isPersonRole, PERSON_ROLE_LABEL } from "./constants.ts"

describe("person roles", () => {
  it("keeps one person able to hold several roles", () => {
    const roles = ["buyer", "designer", "partner"]
    assert.deepEqual(roles.filter(isPersonRole), roles)
    assert.equal(new Set(roles).size, roles.length)
    assert.equal(PERSON_ROLE_LABEL.designer, "Дизайнер")
  })

  it("rejects an unknown role and accepts the small company type set", () => {
    assert.equal(isPersonRole("vip"), false)
    assert.equal(isCompanyType("design_studio"), true)
    assert.equal(isCompanyType("holding"), false)
  })
})
