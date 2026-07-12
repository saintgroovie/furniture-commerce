/**
 * Phase A smoke: exact id-set equality vs locked baselines + card counts.
 *
 * Default = verify-only (never writes baselines).
 * Explicit lock after successful checks:
 *   ../backend/node_modules/.bin/tsx scripts/phase-a-catalog-smoke.ts --lock-baseline
 *
 * Run from apps/storefront (loads .env.local externally):
 *   set -a && source .env.local && set +a
 *   ../backend/node_modules/.bin/tsx scripts/phase-a-catalog-smoke.ts
 */
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import {
  fetchKidsRoomSetMembership,
  resolveKidsProducts,
} from "../src/lib/kids"
import { getCatalogProducts, getProducts } from "../src/lib/api/products"
import {
  isMedusaCanonicalSeedDemoProduct,
  isProductInActiveCatalogScope,
  isProductInMainCatalogScope,
} from "../src/lib/catalog-scope"
import { BESPOKE_PRODUCT_TYPE } from "../src/lib/bespoke"
import { groupProductsForDisplay } from "../src/lib/display-group"

const OUT = resolve(process.cwd(), "../../tmp/catalog-perf")
mkdirSync(OUT, { recursive: true })

const CATALOG_BASELINE = resolve(OUT, "baseline-ids-catalog-scoped.json")
const KIDS_BASELINE = resolve(OUT, "baseline-ids-kids-resolved.json")
const LOCK_BASELINE = process.argv.includes("--lock-baseline")

function eq(a: string[], b: string[]) {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

function readIds(path: string): string[] {
  return JSON.parse(readFileSync(path, "utf8")) as string[]
}

async function main() {
  const t0 = Date.now()
  // Sequential fetches: parallel full+catalog dumps have crashed local Medusa under memory pressure.
  const storeData = await getProducts()
  const catalogData = await getCatalogProducts()
  const membership = await fetchKidsRoomSetMembership()
  const defaultProducts = (storeData.products ?? []) as Array<
    Record<string, unknown>
  >
  const storeProducts = (catalogData.products ?? []) as Array<
    Record<string, unknown>
  >
  const defaultIds = defaultProducts.map((p) => p.id as string).sort()
  const catalogIdsRaw = storeProducts.map((p) => p.id as string).sort()
  if (!eq(defaultIds, catalogIdsRaw)) {
    throw new Error(
      `catalog-products id-set ≠ default list (${defaultIds.length} vs ${catalogIdsRaw.length})`
    )
  }
  const kids = await resolveKidsProducts({ storeProducts, membership })
  const wallMs = Date.now() - t0

  const catalogScoped = storeProducts.filter((p) => {
    if (kids.ids.has(p.id as string)) return false
    if (!isProductInMainCatalogScope(p)) return false
    if (isMedusaCanonicalSeedDemoProduct(p)) return false
    const classification = (
      p.product_classification as { product_type?: string } | undefined
    )?.product_type
    return classification !== BESPOKE_PRODUCT_TYPE
  })

  const kidsScoped = kids.products.filter((p) =>
    isProductInActiveCatalogScope(p)
  )
  const catalogCards = groupProductsForDisplay(catalogScoped).length
  const kidsCards = groupProductsForDisplay(kidsScoped).length

  const kidsMembership = [...membership.kidsRoomSetProductIds].sort()
  const nonKidsMembership = [...membership.nonKidsRoomSetProductIds].sort()
  const kidsIds = [...kids.ids].sort()
  const catalogIds = catalogScoped.map((p) => p.id as string).sort()

  const baselineKidsMembership = readIds(
    resolve(OUT, "baseline-ids-kids-membership.json")
  )
  const baselineNonKids = readIds(
    resolve(OUT, "baseline-ids-nonkids-membership.json")
  )

  if (!existsSync(CATALOG_BASELINE) || !existsSync(KIDS_BASELINE)) {
    if (!LOCK_BASELINE) {
      console.error(
        "phase-a smoke: missing baselines. Run once with --lock-baseline after a green gate."
      )
      process.exit(1)
    }
  }

  const catalogDisplayIds = groupProductsForDisplay(catalogScoped)
    .map((e) => (e.product as Record<string, unknown>).id as string)
    .sort()
  const kidsDisplayIds = groupProductsForDisplay(kidsScoped)
    .map((e) => (e.product as Record<string, unknown>).id as string)
    .sort()

  const report = {
    generatedAt: new Date().toISOString(),
    wallMsParallelMembershipPlusProducts: wallMs,
    storeProducts: storeProducts.length,
    kidsIdsCount: kidsIds.length,
    catalogIdsCount: catalogIds.length,
    catalogCards,
    kidsCards,
    kidsMembershipCount: kidsMembership.length,
    nonKidsMembershipCount: nonKidsMembership.length,
    lockBaselineRequested: LOCK_BASELINE,
    baselinesLockedThisRun: { catalog: false, kids: false },
    membershipEqualsBaseline: {
      kids: eq(kidsMembership, [...baselineKidsMembership].sort()),
      nonKids: eq(nonKidsMembership, [...baselineNonKids].sort()),
    },
    idSetEqualsBaseline: {
      catalog: false,
      kids: false,
    },
    phase0CardCounts: { catalog: 107, kidsCatalog: 38 },
    cardCountMatch: {
      catalog: catalogCards === 107,
      kidsCatalog: kidsCards === 38,
    },
    ssrGrid: null as null | {
      catalogLi: number
      kidsLi: number
      catalogLiMatch: boolean
      kidsLiMatch: boolean
      kidsLeakOnCatalog: boolean
    },
  }

  // SSR cross-check on :3002: grid card counts + no kids leak on /catalog.
  try {
    const storefrontBase = "http://127.0.0.1:3002"
    async function load(path: string): Promise<string> {
      const res = await fetch(`${storefrontBase}${path}`, { cache: "no-store" })
      if (!res.ok) throw new Error(`SSR ${path} status ${res.status}`)
      return res.text()
    }
    function gridProductIds(html: string): string[] {
      const m = html.match(
        /<ul class="product-grid[^"]*">([\s\S]*?)<\/ul>/
      )
      if (!m) return []
      const ids = new Set<string>()
      for (const hit of m[1].matchAll(/href="\/product\/(prod_[^"]+)"/g)) {
        ids.add(hit[1])
      }
      return [...ids]
    }
    function gridLiCount(html: string): number {
      const m = html.match(
        /<ul class="product-grid[^"]*">([\s\S]*?)<\/ul>/
      )
      if (!m) return -1
      return (m[1].match(/<li>/g) || []).length
    }

    const [catalogHtml, kidsHtml] = await Promise.all([
      load("/catalog"),
      load("/kids/catalog"),
    ])
    const catalogGridIds = gridProductIds(catalogHtml)
    const kidsIdSet = new Set(kidsIds)
    const leak = catalogGridIds.some((id) => kidsIdSet.has(id))
    const catalogLi = gridLiCount(catalogHtml)
    const kidsLi = gridLiCount(kidsHtml)
    report.ssrGrid = {
      catalogLi,
      kidsLi,
      catalogLiMatch: catalogLi === catalogCards,
      kidsLiMatch: kidsLi === kidsCards,
      kidsLeakOnCatalog: leak,
    }
  } catch (err) {
    console.warn(
      "SSR grid cross-check skipped:",
      err instanceof Error ? err.message : err
    )
  }

  writeFileSync(
    resolve(OUT, "phase-a-id-sets.json"),
    JSON.stringify(
      { ...report, kidsIds, catalogIds, catalogDisplayIds, kidsDisplayIds },
      null,
      2
    )
  )

  console.log(JSON.stringify(report, null, 2))

  const ssrOk =
    report.ssrGrid == null ||
    (report.ssrGrid.catalogLiMatch &&
      report.ssrGrid.kidsLiMatch &&
      !report.ssrGrid.kidsLeakOnCatalog)

  const gateOk =
    report.membershipEqualsBaseline.kids &&
    report.membershipEqualsBaseline.nonKids &&
    report.cardCountMatch.catalog &&
    report.cardCountMatch.kidsCatalog &&
    ssrOk

  if (!gateOk) {
    console.error("phase-a smoke: MISMATCH (pre-baseline)")
    process.exit(1)
  }

  if (LOCK_BASELINE) {
    writeFileSync(CATALOG_BASELINE, JSON.stringify(catalogIds, null, 2))
    writeFileSync(KIDS_BASELINE, JSON.stringify(kidsIds, null, 2))
    report.baselinesLockedThisRun = { catalog: true, kids: true }
    console.log("phase-a smoke: baselines locked after green gate")
  }

  if (!existsSync(CATALOG_BASELINE) || !existsSync(KIDS_BASELINE)) {
    console.error("phase-a smoke: baselines still missing after gate")
    process.exit(1)
  }

  const baselineCatalogIds = readIds(CATALOG_BASELINE)
  const baselineKidsIds = readIds(KIDS_BASELINE)
  report.idSetEqualsBaseline = {
    catalog: eq(catalogIds, [...baselineCatalogIds].sort()),
    kids: eq(kidsIds, [...baselineKidsIds].sort()),
  }

  writeFileSync(
    resolve(OUT, "phase-a-id-sets.json"),
    JSON.stringify(
      { ...report, kidsIds, catalogIds, catalogDisplayIds, kidsDisplayIds },
      null,
      2
    )
  )
  console.log(
    JSON.stringify(
      {
        idSetEqualsBaseline: report.idSetEqualsBaseline,
        baselinesLockedThisRun: report.baselinesLockedThisRun,
      },
      null,
      2
    )
  )

  if (
    !report.idSetEqualsBaseline.catalog ||
    !report.idSetEqualsBaseline.kids
  ) {
    console.error("phase-a smoke: MISMATCH")
    process.exit(1)
  }
  console.log("phase-a smoke: ok")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
