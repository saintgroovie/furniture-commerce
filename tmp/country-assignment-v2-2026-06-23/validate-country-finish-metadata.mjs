#!/usr/bin/env node
/**
 * Post-apply guard: Country finish metadata must not have stale paint_finish_executions.
 * Usage: node tmp/country-assignment-v2-2026-06-23/validate-country-finish-metadata.mjs
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "../..")
const ENV_LOCAL = path.join(ROOT, "apps/storefront/.env.local")

const WHITELIST = [
  "co-02-1",
  "co-05-1",
  "co-08-1",
  "co-14-2",
  "co-15-2",
  "co-61-1",
  "co-62-1",
  "co-62-2",
  "co-62-3",
  "co-65-1",
  "co-65-2",
  "co-66-1",
  "co-69-1",
]

function loadKey() {
  if (!fs.existsSync(ENV_LOCAL)) return process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""
  for (const line of fs.readFileSync(ENV_LOCAL, "utf8").split("\n")) {
    const m = line.match(/^\s*NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY\s*=\s*(.*)$/)
    if (m) return m[1].trim().replace(/^["']|["']$/g, "")
  }
  return ""
}

function sig(executions) {
  if (!Array.isArray(executions)) return ""
  return executions
    .map((e) => e?.key)
    .filter(Boolean)
    .sort()
    .join("|")
}

function isMilkLike(key, label) {
  const k = String(key || "").toLowerCase()
  if (["cream", "milk", "molochny"].includes(k)) return true
  return /молоч/i.test(String(label || ""))
}

const key = loadKey()
if (!key) {
  console.error("Missing publishable key")
  process.exit(2)
}

const MEDUSA = (process.env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")
const errors = []
const warnings = []
const details = {}

for (const handle of WHITELIST) {
  const res = await fetch(`${MEDUSA}/store/products?handle=${encodeURIComponent(handle)}&fields=+metadata`, {
    headers: { "x-publishable-api-key": key },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    errors.push(`${handle}: API ${res.status}`)
    continue
  }
  const product = (await res.json()).products?.[0]
  const meta = product?.metadata ?? {}
  const finish = meta.finish_color_executions
  const paint = meta.paint_finish_executions
  const entry = {
    finish_keys: Array.isArray(finish) ? finish.map((e) => e.key) : [],
    paint_keys: Array.isArray(paint) ? paint.map((e) => e.key) : [],
    cream_label: meta.finish_color_labels?.cream ?? null,
    default_finish_key: meta.default_finish_key ?? null,
  }
  details[handle] = entry

  if (!Array.isArray(finish) || finish.length < 2) {
    if (handle !== "co-62-3") {
      warnings.push(`${handle}: finish_color_executions < 2 (single-variant SKU?)`)
    }
    continue
  }

  if (sig(finish) !== sig(paint)) {
    errors.push(
      `${handle}: paint_finish_executions out of sync (finish=[${entry.finish_keys}] paint=[${entry.paint_keys}])`
    )
  }

  const cream = finish.find((e) => e.key === "cream" || e.key === "milk")
  if (cream) {
    if (!/молоч/i.test(String(cream.label || ""))) {
      errors.push(`${handle}: milk bucket label is "${cream.label}" (expected «Молочный»)`)
    }
  }

  const hasMilk = finish.some((e) => isMilkLike(e.key, e.label))
  if (hasMilk && finish[0] && !isMilkLike(finish[0].key, finish[0].label)) {
    warnings.push(`${handle}: first finish execution is not milk-like (${finish[0].key})`)
  }
}

const out = {
  checked_at: new Date().toISOString(),
  pass: errors.length === 0,
  errors,
  warnings,
  details,
}
const outPath = path.join(__dirname, "validate-country-finish-metadata.json")
fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`)
console.log(JSON.stringify({ pass: out.pass, errors: out.errors.length, warnings: out.warnings.length, out: outPath }))
process.exit(out.pass ? 0 : 1)
