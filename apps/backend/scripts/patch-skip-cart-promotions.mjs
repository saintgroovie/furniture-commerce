#!/usr/bin/env node
/**
 * Skips updateCartPromotionsWorkflow.runAsStep in Medusa core-flows cart workflows.
 * Workaround for promotion SQL bug (Medusa #14149) breaking POST /store/carts.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workflowsDir = path.resolve(
  __dirname,
  "../node_modules/@medusajs/core-flows/dist/cart/workflows"
)

const files = ["create-carts.js", "refresh-cart-items.js"]
const block =
  /\s*update_cart_promotions_1\.updateCartPromotionsWorkflow\.runAsStep\(\{[\s\S]*?\}\);\n/

for (const file of files) {
  const filePath = path.join(workflowsDir, file)
  if (!fs.existsSync(filePath)) {
    console.warn(`skip: missing ${filePath}`)
    continue
  }
  const original = fs.readFileSync(filePath, "utf8")
  if (original.includes("Woodright: skip broken automatic promotion SQL")) {
    console.log(`already patched ${file}`)
    continue
  }
  if (!block.test(original)) {
    console.warn(`skip: pattern not found in ${file}`)
    continue
  }
  const patched = original.replace(
    block,
    "\n    // Woodright: skip broken automatic promotion SQL (Medusa #14149)\n"
  )
  fs.writeFileSync(filePath, patched)
  console.log(`patched ${file}`)
}
