/**
 * Pure fidelity tests for Woodright order process (no DB).
 *
 *   cd apps/backend && yarn dlx tsx src/lib/woodright-order-process/order-process.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  deriveCustomerOrderStatus,
  mapPaymentBuyerLabel,
  mapDeliveryBuyerLabel,
} from "./derive-customer-status"
import {
  dispatchFakeNotification,
  getFakeNotificationOutbox,
  resetFakeNotificationProvider,
} from "./fake-notifications"
import {
  hashOrderAccessToken,
  buildGuestOrderTrackPath,
  mintOrderAccessToken,
  tokensMatch,
} from "./guest-access-token"
import { assertStageTransition } from "./stages"
import {
  applyProcessTransitionPure,
  toStoreProcessEvent,
  type ProcessRecord,
} from "./transition"

function baseProcess(
  overrides: Partial<ProcessRecord> = {}
): ProcessRecord {
  return {
    id: "proc_1",
    order_id: "order_1",
    current_stage: "new",
    previous_stage: null,
    version: 1,
    estimated_completion_date: null,
    customer_message: null,
    internal_note: null,
    paused_reason: null,
    ...overrides,
  }
}

// --- stage transitions valid / invalid ---
{
  const ok = assertStageTransition("new", "confirmed")
  assert.equal(ok.ok, true)
}

{
  const bad = assertStageTransition("new", "in_production")
  assert.equal(bad.ok, false)
  if (!bad.ok) assert.equal(bad.code, "INVALID_TRANSITION")
}

{
  const hold = assertStageTransition("confirmed", "on_hold")
  assert.equal(hold.ok, true)
}

{
  const cancel = assertStageTransition("new", "canceled", {
    medusa_order_canceled: true,
  })
  assert.equal(cancel.ok, true)
}

{
  const cancelNo = assertStageTransition("new", "canceled")
  assert.equal(cancelNo.ok, false)
  if (!cancelNo.ok) assert.equal(cancelNo.code, "CANCEL_REQUIRES_MEDUSA")
}

// --- correction reason ---
{
  const short = assertStageTransition("in_production", "confirmed", {
    correction: true,
    correction_reason: "too short",
  })
  assert.equal(short.ok, false)
  if (!short.ok) assert.equal(short.code, "CORRECTION_REASON_REQUIRED")
}

{
  const ok = assertStageTransition("in_production", "confirmed", {
    correction: true,
    correction_reason: "Ошибочно поставили производство раньше согласования",
  })
  assert.equal(ok.ok, true)
}

// --- CAS stale version ---
{
  const process = baseProcess({ version: 3 })
  const keys = new Set<string>()
  const r = applyProcessTransitionPure(
    process,
    keys,
    {
      to_stage: "confirmed",
      expected_version: 2,
      actor_type: "admin",
    },
    { event_id: "evt_stale", delivery_ids: ["d1"] }
  )
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.code, "STALE_PROCESS_VERSION")
    assert.equal(r.http, 409)
  }
}

// --- idempotency replay ---
{
  const process = baseProcess({ version: 1 })
  const keys = new Set<string>(["idem-1"])
  const r = applyProcessTransitionPure(
    process,
    keys,
    {
      to_stage: "confirmed",
      expected_version: 1,
      actor_type: "admin",
      idempotency_key: "idem-1",
    },
    { event_id: "evt_replay", delivery_ids: ["d1"] }
  )
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.replay, true)
    assert.equal(r.process.version, 1)
  }
}

{
  const process = baseProcess({ version: 1 })
  const keys = new Set<string>()
  const r = applyProcessTransitionPure(
    process,
    keys,
    {
      to_stage: "confirmed",
      expected_version: 1,
      actor_type: "admin",
      idempotency_key: "idem-new",
      notify_customer: true,
      customer_message: "Заказ подтверждён",
    },
    { event_id: "evt_ok", delivery_ids: ["d1", "d2"] }
  )
  assert.equal(r.ok, true)
  if (r.ok && !r.replay) {
    assert.equal(r.process.version, 2)
    assert.equal(r.process.current_stage, "confirmed")
    assert.equal(r.event.internal_note, null)
    assert.equal(r.deliveries.length, 2)
    assert.ok(keys.has("idem-new"))
  }
}

// --- deriveCustomerOrderStatus precedence:
// canceled > on_hold > delivered > shipped > payment awaiting ---
{
  const payment = mapPaymentBuyerLabel({ medusa_payment_status: "not_paid" })
  const delivery = mapDeliveryBuyerLabel({
    medusa_fulfillment_status: "delivered",
  })
  const s = deriveCustomerOrderStatus({
    stage: "canceled",
    payment,
    delivery,
    canceled: true,
  })
  assert.equal(s.code, "canceled")
}

{
  const payment = mapPaymentBuyerLabel({ medusa_payment_status: "not_paid" })
  const delivery = mapDeliveryBuyerLabel({
    medusa_fulfillment_status: "delivered",
  })
  const s = deriveCustomerOrderStatus({
    stage: "on_hold",
    payment,
    delivery,
  })
  assert.equal(s.code, "on_hold")
}

{
  const payment = mapPaymentBuyerLabel({ medusa_payment_status: "not_paid" })
  const delivery = mapDeliveryBuyerLabel({
    medusa_fulfillment_status: "delivered",
  })
  const s = deriveCustomerOrderStatus({
    stage: "in_production",
    payment,
    delivery,
  })
  assert.equal(s.code, "delivered")
}

{
  const payment = mapPaymentBuyerLabel({ medusa_payment_status: "not_paid" })
  const delivery = mapDeliveryBuyerLabel({
    medusa_fulfillment_status: "shipped",
  })
  const s = deriveCustomerOrderStatus({
    stage: "in_production",
    payment,
    delivery,
  })
  assert.equal(s.code, "shipped")
}

{
  const payment = mapPaymentBuyerLabel({ medusa_payment_status: "awaiting" })
  const delivery = mapDeliveryBuyerLabel({
    medusa_fulfillment_status: null,
  })
  const s = deriveCustomerOrderStatus({
    stage: "new",
    payment,
    delivery,
  })
  assert.equal(s.code, "awaiting_payment")
}

// --- payment operator_marked_paid label ---
{
  const p = mapPaymentBuyerLabel({
    medusa_payment_status: "not_paid",
    payment_link_status: "paid",
  })
  assert.equal(p.code, "operator_marked_paid")
  assert.equal(p.label, "Оплата отмечена менеджером")
}

{
  const p = mapPaymentBuyerLabel({
    medusa_payment_status: "captured",
    payment_link_status: "paid",
  })
  assert.equal(p.code, "paid")
  assert.equal(p.label, "Оплата подтверждена")
}

// --- notification dedupe ---
{
  resetFakeNotificationProvider()
  const msg = {
    event_id: "evt_n1",
    channel: "email" as const,
    recipient_key: "order:1",
    subject: "Woodright: test",
    body: "hello",
  }
  assert.equal(dispatchFakeNotification(msg), "sent")
  assert.equal(dispatchFakeNotification(msg), "deduped")
  assert.equal(getFakeNotificationOutbox().length, 1)
}

// --- guest token hash match ---
{
  const minted = mintOrderAccessToken()
  assert.ok(minted.token.length > 16)
  assert.equal(minted.token_hash, hashOrderAccessToken(minted.token))
  assert.equal(tokensMatch(minted.token, minted.token_hash), true)
  assert.equal(tokensMatch("wrong-token", minted.token_hash), false)
  const track = buildGuestOrderTrackPath("order_01TEST", minted.token)
  assert.ok(track.includes("#token="))
  assert.equal(track.includes("?token="), false)
  assert.equal(track.includes("&token="), false)
  const httpTarget = track.split("#")[0]
  assert.equal(httpTarget.includes("token"), false)
}

// --- store event strips internal_note ---
{
  const storeEvt = toStoreProcessEvent({
    id: "evt_1",
    process_id: "proc_1",
    order_id: "order_1",
    previous_stage: "new",
    next_stage: "confirmed",
    event_type: "stage_changed",
    actor_type: "admin",
    actor_id: "user_1",
    actor_display: "Manager",
    customer_visible: true,
    customer_message: "Подтвердили",
    internal_note: "SECRET_INTERNAL",
    notification_requested: true,
    source: "admin_api",
    idempotency_key: null,
    correlation_id: null,
    created_at: "2026-07-25T12:00:00.000Z",
  })
  assert.equal(storeEvt.message, "Подтвердили")
  assert.equal("internal_note" in storeEvt, false)
  assert.equal(
    JSON.stringify(storeEvt).includes("SECRET_INTERNAL"),
    false
  )
}

console.log("order-process.fidelity.test.ts: ok")
