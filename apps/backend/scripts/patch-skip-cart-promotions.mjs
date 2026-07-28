#!/usr/bin/env node
/**
 * Skips updateCartPromotionsWorkflow.runAsStep in Medusa core-flows cart workflows.
 * Workaround for promotion SQL bug (Medusa #14149) breaking POST /store/carts.
 *
 * Fail-fast contract:
 * - Target files must exist after install.
 * - Either already Woodright-patched, or the known runAsStep block must still match.
 * - Silent no-op on unexpected Medusa output is not allowed.
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
const MARKER = "Woodright: skip broken automatic promotion SQL"

let failures = 0

for (const file of files) {
  const filePath = path.join(workflowsDir, file)
  if (!fs.existsSync(filePath)) {
    console.error(`patch-skip-cart-promotions: missing ${filePath}`)
    failures += 1
    continue
  }
  const original = fs.readFileSync(filePath, "utf8")
  if (original.includes(MARKER)) {
    console.log(`already patched ${file}`)
    continue
  }
  if (!block.test(original)) {
    console.error(
      `patch-skip-cart-promotions: pattern not found in ${file} (Medusa core-flows shape changed; refuse silent skip)`
    )
    failures += 1
    continue
  }
  const patched = original.replace(
    block,
    `\n    // ${MARKER} (Medusa #14149)\n`
  )
  fs.writeFileSync(filePath, patched)
  console.log(`patched ${file}`)
}

if (failures > 0) {
  console.error(
    `patch-skip-cart-promotions: failed for ${failures} file(s); aborting postinstall`
  )
  process.exit(1)
}
