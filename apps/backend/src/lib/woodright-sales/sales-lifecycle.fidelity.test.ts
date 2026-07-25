/**
 * Pure fidelity tests for Woodright sales lifecycle (no DB).
 *
 *   cd apps/backend && yarn dlx tsx src/lib/woodright-sales/sales-lifecycle.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { buildBuyerPurchaseContract } from "./buyer-purchase-contract"
import { evaluateCartSalesGate } from "./cart-sales-gate"
import {
  buildSalesSnapshot,
  SALES_SNAPSHOT_SCHEMA,
  stripClientSalesSnapshot,
} from "./sales-snapshot"
import { validateSalesPolicy } from "./validate-sales-policy"

// --- sales validation conflicts ---
{
  const r = validateSalesPolicy({
    sales_mode: "unavailable",
    modifiers: ["preorder"],
  })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.code, "MODIFIER_CONFLICT")
}

{
  const r = validateSalesPolicy({
    sales_mode: "in_stock",
    modifiers: ["discontinued"],
  })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.code, "MODIFIER_CONFLICT")
}

{
  const r = validateSalesPolicy({
    sales_mode: "bespoke_project",
    modifiers: ["preorder"],
  })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.code, "MODIFIER_CONFLICT")
}

{
  const r = validateSalesPolicy({
    sales_mode: "showroom_sample",
    modifiers: ["only_as_set"],
  })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.code, "MODIFIER_CONFLICT")
}

{
  const r = validateSalesPolicy({
    sales_mode: "made_to_order",
    modifiers: ["only_as_set"],
    related_room_set_id: null,
  })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.code, "RELATED_SET_REQUIRED")
}

{
  const r = validateSalesPolicy({
    sales_mode: "made_to_order",
    modifiers: ["preorder", "limited_series"],
    related_room_set_id: null,
  })
  assert.equal(r.ok, true)
}

// --- buyer DTO CTAs ---
{
  const c = buildBuyerPurchaseContract({ sales_mode: "made_to_order" })
  assert.equal(c.cta_label, "Заказать")
  assert.equal(c.purchase_flow, "cart")
  assert.equal(c.can_purchase, true)
}

{
  const c = buildBuyerPurchaseContract({ sales_mode: "configurable_to_order" })
  assert.equal(c.cta_label, "Настроить и заказать")
  assert.equal(c.requires_configuration, true)
}

{
  const c = buildBuyerPurchaseContract({ sales_mode: "quote_required" })
  assert.equal(c.cta_label, "Запросить расчёт")
  assert.equal(c.purchase_flow, "quote")
  assert.equal(c.can_purchase, false)
}

{
  const c = buildBuyerPurchaseContract({ sales_mode: "bespoke_project" })
  assert.equal(c.cta_label, "Обсудить проект")
  assert.equal(c.purchase_flow, "bespoke")
}

{
  const c = buildBuyerPurchaseContract({ sales_mode: "unavailable" })
  assert.equal(c.cta_label, "Узнать о возобновлении")
  assert.equal(c.purchase_flow, "none")
  assert.equal(c.reason_code, "UNAVAILABLE")
}

{
  const c = buildBuyerPurchaseContract({
    classification: "STANDARD",
    sales_mode: null,
  })
  assert.equal(c.sales_mode, "made_to_order")
}

// --- cart gate: BESPOKE + unavailable + quote ---
{
  const g = evaluateCartSalesGate({ classification: "BESPOKE" })
  assert.equal(g.allow, false)
  if (!g.allow) {
    assert.equal(g.code, "BESPOKE_NOT_ALLOWED_IN_CART")
    assert.equal(g.status, 400)
  }
}

{
  const g = evaluateCartSalesGate({
    classification: "STANDARD",
    sales_mode: "unavailable",
  })
  assert.equal(g.allow, false)
  if (!g.allow) assert.equal(g.code, "UNAVAILABLE")
}

{
  const g = evaluateCartSalesGate({
    classification: "STANDARD",
    sales_mode: "quote_required",
  })
  assert.equal(g.allow, false)
  if (!g.allow) assert.equal(g.code, "QUOTE_REQUIRED")
}

{
  const g = evaluateCartSalesGate({
    classification: "STANDARD",
    sales_mode: "made_to_order",
  })
  assert.equal(g.allow, true)
}

{
  const g = evaluateCartSalesGate({ classification: null })
  assert.equal(g.allow, false)
  if (!g.allow) {
    assert.equal(g.code, "PRODUCT_TYPE_VALIDATION_FAILED")
    assert.equal(g.status, 500)
  }
}

// --- snapshot schema ---
{
  const contract = buildBuyerPurchaseContract({
    sales_mode: "made_to_order",
    buyer_message: "Срок около 6 недель",
  })
  const snap = buildSalesSnapshot({
    contract,
    configuration_summary: "oak / oil",
    now: new Date("2026-07-25T10:00:00.000Z"),
  })
  assert.equal(snap.schema, SALES_SNAPSHOT_SCHEMA)
  assert.equal(snap.schema, "woodright_sales_snapshot_v1")
  assert.equal(snap.sales_mode, "made_to_order")
  assert.equal(snap.configuration_summary, "oak / oil")
  assert.equal(snap.customer_visible_promise, "Срок около 6 недель")
  assert.equal(snap.captured_at, "2026-07-25T10:00:00.000Z")
  assert.equal(snap.dimensions, null)
}

{
  const contract = buildBuyerPurchaseContract({ sales_mode: "made_to_order" })
  const snap = buildSalesSnapshot({
    contract,
    dimensions: {
      height_mm: 900,
      width_mm: 0 as unknown as number,
      depth_mm: 450,
    },
  })
  assert.deepEqual(snap.dimensions, {
    unit: "mm",
    height_mm: 900,
    depth_mm: 450,
  })
  assert.equal(
    snap.dimensions && "width_mm" in snap.dimensions,
    false
  )
}

{
  const stripped = stripClientSalesSnapshot({
    woodright_sales_snapshot: { fake: true },
    woodright_sales_snapshot_v1: { fake: true },
    keep: 1,
  })
  assert.equal(stripped.keep, 1)
  assert.equal("woodright_sales_snapshot" in stripped, false)
  assert.equal("woodright_sales_snapshot_v1" in stripped, false)
}

console.log("sales-lifecycle.fidelity.test.ts: ok")
