/**
 * Willie Winkie Flow A — post-ingestion validation (read-only).
 *
 * Run from apps/backend after pilot seed apply:
 *   WW_FLOW_A_PILOT_POST_INGESTION_VALIDATE=1 \
 *     npx medusa exec ./src/scripts/validate-willie-winkie-flow-a-post-ingestion.ts
 *
 * Writes report to tmp/launch-a-ingest-gate/post-ingestion-validation.json (not data/normalized).
 */
import type { ExecArgs } from "@medusajs/framework/types"
import * as fs from "fs"
import * as path from "path"

const OXFORD_HANDLES = ["ox-14-1", "ox-14-11", "ox-90-1", "s-ox-05"]
const REQUIRED_COLLECTION = "willie-winkie"
const REQUIRED_KIDS = {
  storefront_section: "kids",
  room_type: "детская",
  cart_group: "Woodright Kids",
}

type WhitelistFile = { handles: string[] }
type DraftFile = {
  products: Array<{
    medusa_product_handle: string
    medusa_product_title: string
    medusa_variant_sku: string
    medusa_price_amount: number
    currency_code: string
    medusa_product_type: string
    status: string
    launch_mode: string
    metadata: Record<string, unknown>
  }>
}

function repoRoot(): string {
  const cwd = process.cwd()
  if (path.basename(cwd) === "backend" && path.basename(path.dirname(cwd)) === "apps") {
    return path.resolve(cwd, "../..")
  }
  return path.resolve(cwd, "../..")
}

function loadJson<T>(relativePath: string): T {
  const root = repoRoot()
  const candidate = path.join(root, relativePath)
  if (!fs.existsSync(candidate)) {
    throw new Error(`Missing ${relativePath}`)
  }
  return JSON.parse(fs.readFileSync(candidate, "utf-8")) as T
}

function metaStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  return String(v)
}

export default async function validateWillieWinkieFlowAPostIngestion({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve("logger")
  const root = repoRoot()
  const outPath = path.join(root, "tmp/launch-a-ingest-gate/post-ingestion-validation.json")

  const report: Record<string, unknown> = {
    audit_meta: {
      pass: "willie-winkie-flow-a-post-ingestion-validation",
      date: new Date().toISOString(),
    },
    guard: { env_required: "WW_FLOW_A_PILOT_POST_INGESTION_VALIDATE=1" },
  }

  if (process.env.WW_FLOW_A_PILOT_POST_INGESTION_VALIDATE !== "1") {
    logger.info(
      "Flow A post-ingestion validation skipped. Set WW_FLOW_A_PILOT_POST_INGESTION_VALIDATE=1 after apply."
    )
    report.skipped = true
    report.verdict = "skipped"
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf-8")
    return
  }

  const violations: string[] = []
  const whitelist = loadJson<WhitelistFile>("tmp/launch-a-ingest-gate/flow-a-ingest-whitelist.json")
  const draft = loadJson<DraftFile>("tmp/launch-a-ingest-gate/flow-a-request-mode-product-draft.json")
  const seedRows = draft.products
  const pilotHandleList = [...whitelist.handles]

  if (pilotHandleList.length !== 28) {
    violations.push(`whitelist must have 28 handles, got ${pilotHandleList.length}`)
  }
  if (seedRows.length !== 28) {
    violations.push(`seed JSON must have 28 rows, got ${seedRows.length}`)
  }

  const query = container.resolve("query")

  const { data: pilotProducts } = await query.graph({
    entity: "product",
    fields: ["*", "variants.*", "variants.prices.*", "images.*"],
    filters: { handle: pilotHandleList },
  })

  let list = (pilotProducts ?? []).filter(
    (p: { handle?: string }) => typeof p.handle === "string" && pilotHandleList.includes(p.handle)
  )
  if (list.length === 0) {
    const { data: allProducts } = await query.graph({
      entity: "product",
      fields: ["*", "variants.*", "variants.prices.*", "images.*"],
    })
    list = (allProducts ?? []).filter(
      (p: { handle?: string }) => typeof p.handle === "string" && pilotHandleList.includes(p.handle)
    )
  }

  report.pilot_products_in_db = {
    count: list.length,
    handles_found: list.map((p: { handle: string }) => p.handle).sort(),
  }

  if (list.length !== 28) {
    violations.push(`expected 28 pilot products in DB, found ${list.length}`)
  }

  const seedByHandle = new Map(seedRows.map((r) => [r.medusa_product_handle, r]))

  for (const handle of pilotHandleList) {
    const seed = seedByHandle.get(handle)
    const pr = list.find((p: { handle: string }) => p.handle === handle)
    if (!seed) {
      violations.push(`missing seed row for ${handle}`)
      continue
    }
    if (!pr) {
      violations.push(`missing product in DB: ${handle}`)
      continue
    }

    if (String(pr.status) !== "draft") {
      violations.push(`${handle}: status must remain draft (got ${String(pr.status)})`)
    }

    const meta = (pr.metadata ?? {}) as Record<string, unknown>
    if (metaStr(meta.collection) !== REQUIRED_COLLECTION) {
      violations.push(`${handle}: metadata.collection must be ${REQUIRED_COLLECTION}`)
    }
    if (metaStr(meta.launch_mode) !== "request_quote") {
      violations.push(`${handle}: metadata.launch_mode must be request_quote`)
    }
    for (const [key, expected] of Object.entries(REQUIRED_KIDS)) {
      if (metaStr(meta[key]) !== expected) {
        violations.push(`${handle}: metadata.${key} expected ${JSON.stringify(expected)} got ${JSON.stringify(meta[key])}`)
      }
    }
    if (!meta.painting_name || !meta.motif) {
      violations.push(`${handle}: painting_name and motif metadata required`)
    }
    if (meta.willie_winkie_flow_a_pilot !== true) {
      violations.push(`${handle}: metadata.willie_winkie_flow_a_pilot must be true`)
    }

    const thumb = pr.thumbnail
    const imgs = pr.images ?? []
    if ((typeof thumb === "string" && thumb.length > 0) || (Array.isArray(imgs) && imgs.length > 0)) {
      violations.push(`${handle}: product-media must not be applied yet (images/thumbnail present)`)
    }

    const variant = pr.variants?.[0]
    if (!variant) {
      violations.push(`${handle}: no default variant`)
    } else {
      if (variant.sku !== seed.medusa_product_handle) {
        violations.push(`${handle}: variant sku must equal handle (got ${String(variant.sku)})`)
      }
      const price = variant.prices?.[0]
      const amt = price?.amount
      const n = typeof amt === "bigint" ? Number(amt) : Number(amt)
      if (!Number.isFinite(n) || n !== seed.medusa_price_amount) {
        violations.push(`${handle}: variant price expected ${seed.medusa_price_amount} got ${String(amt)}`)
      }
    }

    const metaType = metaStr(meta.medusa_product_type)
    if (metaType === "CONFIGURABLE") {
      // metadata confirms CONFIGURABLE (graph product_classification resolver may fail on ProductType module naming)
    } else {
      try {
        const { data } = await query.graph({
          entity: "product",
          fields: ["id", "handle", "product_classification.product_type"],
          filters: { id: pr.id },
        })
        const pt = data?.[0]?.product_classification?.product_type
        if (pt !== "CONFIGURABLE") {
          violations.push(
            `${handle}: ProductClassification.product_type expected CONFIGURABLE got ${String(pt)}`
          )
        }
      } catch (e: unknown) {
        violations.push(
          `${handle}: classification check failed and metadata.medusa_product_type missing (got ${JSON.stringify(metaType)})`
        )
      }
    }
  }

  const { data: oxfordProducts } = await query.graph({
    entity: "product",
    fields: ["handle", "status", "metadata"],
    filters: { handle: OXFORD_HANDLES },
  })
  const oxList = oxfordProducts ?? []
  report.oxford_spot_check = {
    expected: OXFORD_HANDLES.length,
    found: oxList.length,
    handles: oxList.map((p: { handle: string }) => p.handle).sort(),
  }
  if (oxList.length !== OXFORD_HANDLES.length) {
    violations.push(`Oxford-4 spot check failed: expected ${OXFORD_HANDLES.length} found ${oxList.length}`)
  }
  for (const ox of oxList) {
    const meta = (ox.metadata ?? {}) as Record<string, unknown>
    if (metaStr(meta.collection) !== "oxford") {
      violations.push(`${ox.handle}: Oxford metadata.collection must remain oxford`)
    }
    if (String(ox.status) !== "published") {
      violations.push(`${ox.handle}: Oxford product status changed from published`)
    }
  }

  report.violations = violations
  report.verdict = violations.length === 0 ? "ok" : "fail"
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf-8")
  logger.info(`Wrote ${outPath}`)
  logger.info(`Flow A post-ingestion verdict=${report.verdict} violations=${violations.length}`)

  if (violations.length > 0) {
    for (const v of violations) {
      logger.info(`  - ${v}`)
    }
    throw new Error(`Flow A post-ingestion validation failed (${violations.length} violation(s))`)
  }
}
