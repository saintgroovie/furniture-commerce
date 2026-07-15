/**
 * Gated normalizer: canonical `metadata.material_tiers` for every published product.
 *
 * Dry-run (no writes, prints + saves report):
 *   MATERIAL_TIERS_DRY_RUN=1 MATERIAL_TIERS_CONFIRM=1 \
 *     npx medusa exec ./src/scripts/normalize-material-tiers-gated.ts
 *
 * Apply (local dev DB only, after review):
 *   MATERIAL_TIERS_CONFIRM=1 \
 *     npx medusa exec ./src/scripts/normalize-material-tiers-gated.ts
 *
 * Contract: the single Medusa variant RUB price is the `solid_full` price;
 * `solid_front_ldsp_body` derives as round(base × 0.7) at read/cart time —
 * this script writes ONLY `metadata.material_tiers` (labels, descriptions,
 * multipliers, positions). It never touches prices, titles, images, gallery,
 * SKU, dimensions or any other metadata key.
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"
import {
  CANONICAL_MATERIAL_TIERS,
  MATERIAL_TIER_FULL_SOLID,
  MATERIAL_TIER_LDSP,
  parseMaterialTiers,
} from "../lib/material-tier-contract"

type ReportRow = {
  handle: string
  status:
    | "already_normalized"
    | "normalized_from_legacy"
    | "normalized_new"
    | "skipped_unexpected_shape"
    | "invalid_variant_count"
    | "invalid_rub_price_count"
  legacy_keys?: string[]
}

type Report = {
  generated_at: string
  dry_run: boolean
  total_published: number
  with_two_normalized_tiers_before: number
  with_legacy_material_tiers_before: number
  without_material_metadata_before: number
  only_full_solid_before: number
  only_ldsp_before: number
  request_quote_products: number
  with_rub_price: number
  without_rub_price: string[]
  invalid_variant_count: string[]
  conflicting_price_products: string[]
  cannot_normalize: string[]
  would_update: number
  rows: ReportRow[]
}

/**
 * Hard guard: this script may only write to a local dev database. There is no
 * override flag on purpose — production normalization is a separate, explicitly
 * approved operation.
 */
function assertLocalDatabase(): void {
  const url = process.env.DATABASE_URL ?? ""
  let host = ""
  try {
    host = new URL(url).hostname
  } catch {
    throw new Error("DATABASE_URL is missing or unparsable — refusing to run.")
  }
  /* "postgres" is deliberately NOT accepted: it is a common service DNS name
     in remote Docker/Kubernetes environments, so it cannot prove locality. */
  const local = new Set(["localhost", "127.0.0.1", "::1"])
  if (!local.has(host)) {
    throw new Error(
      `DATABASE_URL host "${host}" is not local — this script is local-dev-only.`
    )
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("NODE_ENV=production — this script is local-dev-only.")
  }
}

function repoRoot(): string {
  const cwd = process.cwd()
  if (path.basename(cwd) === "backend" && path.basename(path.dirname(cwd)) === "apps") {
    return path.resolve(cwd, "../..")
  }
  return path.resolve(cwd, "../..")
}

function rubAmounts(variants: Array<Record<string, unknown>>): number[] {
  const amounts: number[] = []
  for (const variant of variants) {
    const priceSet = variant?.price_set as
      | { prices?: Array<{ amount?: unknown; currency_code?: unknown }> }
      | undefined
    for (const p of priceSet?.prices ?? []) {
      if (String(p.currency_code ?? "").toLowerCase() !== "rub") continue
      const n = Number(p.amount)
      if (Number.isFinite(n) && n > 0) amounts.push(n)
    }
  }
  return amounts
}

export default async function normalizeMaterialTiers({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve("logger")
  const dryRun = process.env.MATERIAL_TIERS_DRY_RUN === "1"

  if (process.env.MATERIAL_TIERS_CONFIRM !== "1") {
    logger.info("Skipped. Set MATERIAL_TIERS_CONFIRM=1 (add MATERIAL_TIERS_DRY_RUN=1 for dry-run).")
    return
  }
  assertLocalDatabase()

  const query = container.resolve("query") as {
    graph: (args: {
      entity: string
      fields: string[]
      filters?: Record<string, unknown>
      pagination?: { take: number; skip: number }
    }) => Promise<{ data: unknown[] }>
  }
  const productModule = container.resolve(Modules.PRODUCT)

  const products: Array<Record<string, unknown>> = []
  const take = 100
  for (let skip = 0; ; skip += take) {
    const { data } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "handle",
        "status",
        "metadata",
        "variants.id",
        "variants.price_set.prices.amount",
        "variants.price_set.prices.currency_code",
      ],
      filters: { status: "published" },
      pagination: { take, skip },
    })
    const page = (data ?? []) as Array<Record<string, unknown>>
    products.push(...page)
    if (page.length < take) break
  }

  const report: Report = {
    generated_at: new Date().toISOString(),
    dry_run: dryRun,
    total_published: products.length,
    with_two_normalized_tiers_before: 0,
    with_legacy_material_tiers_before: 0,
    without_material_metadata_before: 0,
    only_full_solid_before: 0,
    only_ldsp_before: 0,
    request_quote_products: 0,
    with_rub_price: 0,
    without_rub_price: [],
    invalid_variant_count: [],
    conflicting_price_products: [],
    cannot_normalize: [],
    would_update: 0,
    rows: [],
  }

  /* Pass 1 — classify every product and plan updates (no writes). */
  const planned: Array<{ productId: string; meta: Record<string, unknown> }> = []

  for (const product of products) {
    const handle = String(product.handle ?? product.id)
    const meta = { ...((product.metadata as Record<string, unknown>) ?? {}) }
    const variants = (product.variants as Array<Record<string, unknown>>) ?? []
    const prices = rubAmounts(variants)

    if ((meta.launch_mode as string | undefined) === "request_quote") {
      report.request_quote_products++
    }
    if (variants.length !== 1) {
      report.invalid_variant_count.push(handle)
      report.rows.push({ handle, status: "invalid_variant_count" })
      continue
    }
    if (prices.length > 0) report.with_rub_price++
    else report.without_rub_price.push(handle)
    if (prices.length !== 1) {
      // The contract requires exactly one RUB base price (the solid_full price).
      if (prices.length > 1) {
        report.conflicting_price_products.push(handle)
        report.rows.push({ handle, status: "invalid_rub_price_count" })
        continue
      }
      report.rows.push({ handle, status: "invalid_rub_price_count" })
      continue
    }

    const rawTiers = meta.material_tiers
    const normalized = parseMaterialTiers(meta)
    const hasLegacyShape =
      rawTiers != null && typeof rawTiers === "object" && !Array.isArray(rawTiers) && !normalized
    const legacyKeys = hasLegacyShape ? Object.keys(rawTiers as Record<string, unknown>) : []

    if (normalized) {
      report.with_two_normalized_tiers_before++
      const codes = new Set(normalized.map((t) => t.key))
      if (codes.has(MATERIAL_TIER_FULL_SOLID) && !codes.has(MATERIAL_TIER_LDSP)) {
        report.only_full_solid_before++
      }
      if (codes.has(MATERIAL_TIER_LDSP) && !codes.has(MATERIAL_TIER_FULL_SOLID)) {
        report.only_ldsp_before++
      }
    } else if (hasLegacyShape) {
      report.with_legacy_material_tiers_before++
      const codes = new Set(legacyKeys)
      if (codes.has(MATERIAL_TIER_FULL_SOLID) && !codes.has(MATERIAL_TIER_LDSP)) {
        report.only_full_solid_before++
      }
      if (codes.has(MATERIAL_TIER_LDSP) && !codes.has(MATERIAL_TIER_FULL_SOLID)) {
        report.only_ldsp_before++
      }
    } else if (rawTiers == null) {
      report.without_material_metadata_before++
    } else {
      // Non-object material_tiers — do not guess, surface for the operator.
      report.cannot_normalize.push(handle)
      report.rows.push({ handle, status: "skipped_unexpected_shape" })
      continue
    }

    // Build normalized tiers: canonical fields win; unknown extra fields from
    // existing entries (price_rub / price_known / …) are preserved verbatim.
    const existing =
      rawTiers != null && typeof rawTiers === "object" && !Array.isArray(rawTiers)
        ? (rawTiers as Record<string, unknown>)
        : {}
    const nextTiers: Record<string, unknown> = {}
    let canonicalEntryConflict = false
    for (const code of [MATERIAL_TIER_LDSP, MATERIAL_TIER_FULL_SOLID]) {
      const hasPrior = Object.prototype.hasOwnProperty.call(existing, code)
      const prior = existing[code]
      if (hasPrior && (prior == null || typeof prior !== "object" || Array.isArray(prior))) {
        canonicalEntryConflict = true
        break
      }
      nextTiers[code] = {
        ...((prior as Record<string, unknown> | undefined) ?? {}),
        ...CANONICAL_MATERIAL_TIERS[code],
      }
    }
    if (canonicalEntryConflict) {
      // A canonical code holds a non-object value — do not guess, surface it.
      report.cannot_normalize.push(handle)
      report.rows.push({ handle, status: "skipped_unexpected_shape" })
      continue
    }
    // Preserve any non-canonical tiers an operator may have added — verbatim,
    // whatever their value type.
    for (const [code, entry] of Object.entries(existing)) {
      if (!(code in nextTiers)) {
        nextTiers[code] = entry
      }
    }

    const before = JSON.stringify(rawTiers ?? null)
    const after = JSON.stringify(nextTiers)
    if (before === after) {
      report.rows.push({ handle, status: "already_normalized" })
      continue
    }

    const status: ReportRow["status"] = hasLegacyShape
      ? "normalized_from_legacy"
      : rawTiers == null
        ? "normalized_new"
        : "normalized_from_legacy"
    report.rows.push({ handle, status, ...(legacyKeys.length ? { legacy_keys: legacyKeys } : {}) })
    report.would_update++
    planned.push({
      productId: product.id as string,
      meta: { ...meta, material_tiers: nextTiers },
    })
  }

  /* Pass 2 — fail-fast before the first write when any product is broken. */
  const blockers = [
    ...report.cannot_normalize.map((h) => `cannot_normalize: ${h}`),
    ...report.invalid_variant_count.map((h) => `invalid_variant_count: ${h}`),
    ...report.without_rub_price.map((h) => `no_rub_price: ${h}`),
    ...report.conflicting_price_products.map((h) => `conflicting_rub_prices: ${h}`),
  ]

  let updated = 0
  if (!dryRun) {
    if (blockers.length > 0) {
      throw new Error(
        `Refusing to apply: ${blockers.length} blocker(s) found. ` +
          `Run dry-run and resolve first:\n${blockers.join("\n")}`
      )
    }
    for (const { productId, meta } of planned) {
      await productModule.updateProducts(productId, { metadata: meta })
      updated++
    }
  }

  const outDir = path.join(repoRoot(), "tmp/material-tiers-normalize")
  fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(
    outDir,
    dryRun ? "dry-run-report.json" : "apply-report.json"
  )
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2))

  logger.info(
    `${dryRun ? "[DRY-RUN] " : ""}published=${report.total_published} ` +
      `normalized_before=${report.with_two_normalized_tiers_before} ` +
      `legacy_before=${report.with_legacy_material_tiers_before} ` +
      `no_metadata_before=${report.without_material_metadata_before} ` +
      `request_quote=${report.request_quote_products} ` +
      `no_rub_price=${report.without_rub_price.length} ` +
      `invalid_variant_count=${report.invalid_variant_count.length} ` +
      `conflicting_prices=${report.conflicting_price_products.length} ` +
      `cannot_normalize=${report.cannot_normalize.length} ` +
      `${dryRun ? "would_update" : "updated"}=${dryRun ? report.would_update : updated}`
  )
  logger.info(`Report: ${outPath}`)
}
