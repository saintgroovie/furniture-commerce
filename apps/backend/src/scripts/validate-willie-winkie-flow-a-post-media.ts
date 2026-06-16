/**
 * Post product-media apply validation (read-only).
 *
 *   WW_FLOW_A_POST_MEDIA_VALIDATE=1 \
 *     npx medusa exec ./src/scripts/validate-willie-winkie-flow-a-post-media.ts
 */
import type { ExecArgs } from "@medusajs/framework/types"
import * as fs from "fs"
import * as path from "path"

const WHITELIST_PATH = "tmp/launch-a-ingest-gate/flow-a-ingest-whitelist.json"
const OUT_DIR = "tmp/flow-a-product-media-apply-gate"
const OXFORD_HANDLES = ["ox-14-1", "ox-14-11", "ox-90-1", "s-ox-05"]

function repoRoot(): string {
  const cwd = process.cwd()
  if (path.basename(cwd) === "backend" && path.basename(path.dirname(cwd)) === "apps") {
    return path.resolve(cwd, "../..")
  }
  return path.resolve(cwd, "../..")
}

export default async function validateWillieWinkieFlowAPostMedia({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve("logger")
  const root = repoRoot()
  const outPath = path.join(root, OUT_DIR, "post-media-validation.json")

  if (process.env.WW_FLOW_A_POST_MEDIA_VALIDATE !== "1") {
    logger.info("Skipped. Set WW_FLOW_A_POST_MEDIA_VALIDATE=1")
    return
  }

  const whitelist = JSON.parse(
    fs.readFileSync(path.join(root, WHITELIST_PATH), "utf8")
  ) as { handles: string[] }
  const pilotHandles = whitelist.handles
  const violations: string[] = []
  const query = container.resolve("query")

  const { data: pilotProducts } = await query.graph({
    entity: "product",
    fields: ["*", "variants.*", "images.*"],
    filters: { handle: pilotHandles },
  })
  let list = (pilotProducts ?? []).filter((p: { handle?: string }) =>
    pilotHandles.includes(p.handle ?? "")
  )

  if (list.length !== 28) {
    violations.push(`expected 28 pilot products, found ${list.length}`)
  }

  for (const handle of pilotHandles) {
    const pr = list.find((p: { handle: string }) => p.handle === handle)
    if (!pr) {
      violations.push(`missing:${handle}`)
      continue
    }
    if (String(pr.status) !== "draft") {
      violations.push(`${handle}: must remain draft`)
    }
    const meta = (pr.metadata ?? {}) as Record<string, unknown>
    if (meta.launch_mode !== "request_quote") violations.push(`${handle}: launch_mode`)
    if (meta.cart_group !== "Woodright Kids") violations.push(`${handle}: cart_group`)
    if (meta.collection !== "willie-winkie") violations.push(`${handle}: collection`)
    const thumb = pr.thumbnail
    const imgs = pr.images ?? []
    if (typeof thumb !== "string" || thumb.length < 8) {
      violations.push(`${handle}: missing thumbnail`)
    }
    if (!Array.isArray(imgs) || imgs.length < 1) {
      violations.push(`${handle}: missing images`)
    }
  }

  const { data: oxfordProducts } = await query.graph({
    entity: "product",
    fields: ["handle", "status", "thumbnail", "images.*", "metadata"],
    filters: { handle: OXFORD_HANDLES },
  })
  const oxBefore = JSON.parse(
    fs.readFileSync(path.join(root, "tmp/launch-a-ingest-gate/pre-apply-db-baseline.json"), "utf8")
  )
  const oxBaseline = new Map(
    (oxBefore.oxford_products ?? []).map((o: { handle: string; status: string }) => [o.handle, o.status])
  )

  for (const ox of oxfordProducts ?? []) {
    if (String(ox.status) !== "published") {
      violations.push(`oxford status changed: ${ox.handle}`)
    }
    const baseline = oxBaseline.get(ox.handle)
    if (baseline && baseline !== ox.status) {
      violations.push(`oxford baseline mismatch: ${ox.handle}`)
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    pilot_products_in_db: list.length,
    violations,
    verdict: violations.length === 0 ? "ok" : "fail",
    store_api_note:
      "Draft pilot products are not visible on public /store/products until publish gate",
  }

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf8")
  logger.info(`Wrote ${outPath} verdict=${report.verdict} violations=${violations.length}`)

  if (violations.length > 0) {
    for (const v of violations) logger.info(`  - ${v}`)
    throw new Error(`Post-media validation failed (${violations.length})`)
  }
}
