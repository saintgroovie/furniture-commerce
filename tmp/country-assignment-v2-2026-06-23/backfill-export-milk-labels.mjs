#!/usr/bin/env node
/**
 * Backfill Country assignment_v2 export: cream/milk → operator_variant_label «Молочный».
 * Use when validating a pre-fix board export without re-exporting from UI.
 *
 * Usage:
 *   node tmp/country-assignment-v2-2026-06-23/backfill-export-milk-labels.mjs
 *   node tmp/country-assignment-v2-2026-06-23/validate-assignment-v2-export.mjs
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXPORT_PATH = path.join(__dirname, "operator-assignment-v2-export.json")
const BACKUP_PATH = path.join(__dirname, "operator-assignment-v2-export.pre-milk-backfill.json")
const MILK_KEYS = ["cream", "milk", "molochny"]
const MILK_LABEL = "Молочный"

if (!fs.existsSync(EXPORT_PATH)) {
  console.error(`Missing ${EXPORT_PATH}`)
  process.exit(2)
}

const payload = JSON.parse(fs.readFileSync(EXPORT_PATH, "utf8"))
const assignments = payload?.assignment?.assignments ?? {}
let touched = 0

for (const [handle, product] of Object.entries(assignments)) {
  const variants = product.variants ?? {}
  const milkKey = MILK_KEYS.find((k) => variants[k])
  if (!milkKey) continue

  const variant = variants[milkKey]
  if (variant.operator_variant_label !== MILK_LABEL) {
    variant.operator_variant_label = MILK_LABEL
    touched++
  }

  product.operator_variant_edits = product.operator_variant_edits ?? {}
  if (!product.operator_variant_edits.default_variant_key) {
    product.operator_variant_edits.default_variant_key = milkKey
    touched++
  }
}

if (touched === 0) {
  console.log(JSON.stringify({ ok: true, touched: 0, message: "already has milk labels" }))
  process.exit(0)
}

if (!fs.existsSync(BACKUP_PATH)) {
  fs.copyFileSync(EXPORT_PATH, BACKUP_PATH)
}

fs.writeFileSync(EXPORT_PATH, `${JSON.stringify(payload, null, 2)}\n`)
console.log(
  JSON.stringify({
    ok: true,
    touched,
    backup: BACKUP_PATH,
    export: EXPORT_PATH,
  })
)
