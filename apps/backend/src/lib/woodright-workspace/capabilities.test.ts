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

  it("lets ordinary staff do CRM work", () => {
    const decision = decideDeskWrite({
      actorId: "user_1",
      email: "seller@woodright.ru",
      action: "crm.follow_up",
    })
    assert.equal(decision.ok, true)
    const access = resolveStaffAccess({ email: "seller@woodright.ru" })
    assert.equal(accessAllows(access, "crm.view"), true)
    assert.equal(accessAllows(access, "crm.link_customer"), true)
    assert.equal(accessAllows(access, "crm.assign"), true)
  })

  it("does not give mailbox access to ordinary staff or to an owner who is not on the mail list", () => {
    const staff = decideDeskWrite({ actorId: "user_1", email: "seller@woodright.ru", action: "mail.view" })
    assert.equal(staff.ok, false)
    const owner = resolveStaffAccess({
      email: "owner@woodright.ru",
      ownerEmailsRaw: "owner@woodright.ru",
    })
    assert.equal(owner.capabilities.view_mail, false)
    assert.equal(accessAllows(owner, "mail.reply"), false)
    const listed = resolveStaffAccess({
      email: "desk@woodright.ru",
      mailEmailsRaw: "desk@woodright.ru",
    })
    assert.equal(listed.capabilities.view_mail, true)
    assert.equal(accessAllows(listed, "mail.admin"), true)
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
