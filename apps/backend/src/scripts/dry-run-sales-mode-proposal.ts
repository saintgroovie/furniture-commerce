/**
 * Dry-run: print proposed sales-mode mapping from ProductClassification.
 * No DB writes.
 *
 *   cd apps/backend && yarn dlx tsx src/scripts/dry-run-sales-mode-proposal.ts
 */
import {
  projectSalesModeFromClassification,
  SALES_MODE_OWNER_LABEL,
  type ProductClassificationType,
} from "../lib/woodright-sales/sales-modes"
import { buildBuyerPurchaseContract } from "../lib/woodright-sales/buyer-purchase-contract"

const CLASSIFICATIONS: ProductClassificationType[] = [
  "STANDARD",
  "CONFIGURABLE",
  "BESPOKE",
]

console.log("Woodright sales-mode proposal (compat projection, read-only)\n")
console.log(
  "classification → sales_mode → owner label → CTA → purchase_flow → can_purchase\n"
)

for (const classification of CLASSIFICATIONS) {
  const sales_mode = projectSalesModeFromClassification(classification)
  const contract = buildBuyerPurchaseContract({
    classification,
    sales_mode,
  })
  console.log(
    [
      classification.padEnd(14),
      "→",
      (sales_mode ?? "null").padEnd(22),
      SALES_MODE_OWNER_LABEL[sales_mode!]?.padEnd(42) ?? "",
      "| CTA:",
      contract.cta_label,
      "| flow:",
      contract.purchase_flow,
      "| cart:",
      contract.can_purchase ? "yes" : "no",
    ].join(" ")
  )
}

console.log("\nModifiers / overrides are not applied in this dry-run.")
console.log("No writes performed.")
