/**
 * Admin sales-policy withPreview / classification parity fidelity.
 *
 *   cd apps/backend && yarn dlx tsx src/lib/woodright-sales/admin-sales-policy-preview.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { buildBuyerPurchaseContract } from "./buyer-purchase-contract"
import { projectSalesModeFromClassification } from "./sales-modes"
import type { ProductClassificationType } from "./sales-modes"

/** Mirrors admin route withPreview contract after D2 fix. */
function withPreview(input: {
  sales_mode?: string | null
  classification?: ProductClassificationType | null
  launch_mode?: string | null
}) {
  return buildBuyerPurchaseContract({
    sales_mode: (input.sales_mode as never) ?? null,
    modifiers: [],
    classification: input.classification ?? null,
    launch_mode: input.launch_mode ?? null,
  })
}

// Owner mapping via classification when policy null
{
  assert.equal(projectSalesModeFromClassification("STANDARD"), "made_to_order")
  assert.equal(
    projectSalesModeFromClassification("CONFIGURABLE"),
    "configurable_to_order"
  )
  assert.equal(projectSalesModeFromClassification("BESPOKE"), "bespoke_project")
  assert.equal(projectSalesModeFromClassification(null), null)
}

{
  const c = withPreview({ classification: "STANDARD", sales_mode: null })
  assert.equal(c.sales_mode, "made_to_order")
}

{
  const c = withPreview({ classification: "CONFIGURABLE", sales_mode: null })
  assert.equal(c.sales_mode, "configurable_to_order")
}

{
  const c = withPreview({ classification: "BESPOKE", sales_mode: null })
  assert.equal(c.sales_mode, "bespoke_project")
}

// Missing classification → fail-closed unavailable (read-time)
{
  const c = withPreview({ classification: null, sales_mode: null })
  assert.equal(c.sales_mode, "unavailable")
}

// Explicit policy precedence over classification
{
  const c = withPreview({
    classification: "STANDARD",
    sales_mode: "quote_required",
  })
  assert.equal(c.sales_mode, "quote_required")
}

// Regression: omitting classification (old withPreview bug) → unavailable
{
  const buggy = buildBuyerPurchaseContract({
    sales_mode: null,
    modifiers: [],
  })
  assert.equal(buggy.sales_mode, "unavailable")
}

console.log("admin-sales-policy-preview.fidelity.test.ts: PASS")
