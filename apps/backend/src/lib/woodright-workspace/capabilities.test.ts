import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { accessAllows, decideDeskWrite } from "./capabilities.ts"
import { resolveStaffAccess } from "./permissions.ts"

describe("decideDeskWrite", () => {
  it("denies a request without an actor", () => {
    const decision = decideDeskWrite({ actorId: null, email: "seller@woodright.ru", action: "orders.process.write" })
    assert.equal(decision.ok, false)
    if (!decision.ok) assert.equal(decision.status, 401)
  })

  it("allows an authenticated admin to change a manufacturing stage", () => {
    const decision = decideDeskWrite({
      actorId: "user_1",
      email: "seller@woodright.ru",
      action: "orders.process.write",
    })
    assert.equal(decision.ok, true)
  })

  it("denies a capability that was turned off", () => {
    const access = resolveStaffAccess({ email: "seller@woodright.ru" })
    access.capabilities.edit_order_process = false
    assert.equal(accessAllows(access, "orders.process.write"), false)
    assert.equal(accessAllows(access, "orders.note.write"), false)
  })

  it("keeps the Medusa escape hatch off for ordinary staff", () => {
    const decision = decideDeskWrite({
      actorId: "user_1",
      email: "seller@woodright.ru",
      action: "admin.escape",
    })
    assert.equal(decision.ok, false)
    if (!decision.ok) assert.equal(decision.status, 403)
  })
})
