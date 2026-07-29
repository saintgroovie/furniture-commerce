/**
 * Read-only dry-run: furniture dimension coverage statistics.
 *
 * Default: scans an embedded anonymized fixture corpus (no DB).
 * Optional live scan: DATABASE_URL=… yarn dlx tsx src/scripts/dry-run-dimension-coverage.ts --live
 *
 * Never writes to DB. Never backfills.
 */
import { resolveFurnitureDimensions } from "../lib/woodright-dimensions"

type ClassKey =
  | "full_variant"
  | "partial_variant"
  | "missing_all"
  | "has_zeros_in_raw"
  | "invalid_raw"
  | "product_fallback_only"
  | "variant_level"
  | "product_variant_conflict"
  | "variants_differ_on_product"
  | "title_mentions_size_pattern"

type SampleProduct = {
  id: string
  title?: string
  metadata?: Record<string, unknown> | null
  variants: Array<{
    id: string
    metadata?: Record<string, unknown> | null
  }>
}

const SIZE_IN_TITLE =
  /\b\d{2,4}\s*[x×х]\s*\d{2,4}(\s*[x×х]\s*\d{2,4})?\b/i

/** Anonymized fixture corpus covering each report class (not live catalog). */
const FIXTURE_CORPUS: SampleProduct[] = [
  {
    id: "p_full_variant",
    title: "Тумба образец",
    metadata: { dimensions: { height_mm: 800, width_mm: 1000, depth_mm: 400 } },
    variants: [
      {
        id: "v_full",
        metadata: {
          dimensions: { height_mm: 900, width_mm: 1200, depth_mm: 450 },
        },
      },
    ],
  },
  {
    id: "p_partial_variant",
    title: "Стеллаж частичный",
    metadata: { dimensions: { depth_mm: 350 } },
    variants: [
      {
        id: "v_partial",
        metadata: { dimensions: { height_mm: 1800, width_mm: 800 } },
      },
    ],
  },
  {
    id: "p_missing",
    title: "Полка без размеров",
    metadata: {},
    variants: [{ id: "v_missing", metadata: {} }],
  },
  {
    id: "p_zeros",
    title: "Комод с нулями в metadata",
    metadata: {
      dimensions: { height_mm: 0, width_mm: 0, depth_mm: 0 },
    },
    variants: [
      {
        id: "v_zeros",
        metadata: {
          dimensions: { height_mm: 0, width_mm: 1200, depth_mm: 0 },
        },
      },
    ],
  },
  {
    id: "p_invalid",
    title: "Стол с битыми значениями",
    metadata: {},
    variants: [
      {
        id: "v_invalid",
        metadata: {
          dimensions: {
            height_mm: "90 cm",
            width_mm: -12,
            depth_mm: Number.NaN,
          },
        },
      },
    ],
  },
  {
    id: "p_product_only",
    title: "Стул только product-level",
    metadata: {
      dimensions_normalized: {
        height_mm: 850,
        width_mm: 450,
        depth_mm: 500,
      },
    },
    variants: [{ id: "v_empty", metadata: {} }],
  },
  {
    id: "p_conflict",
    title: "Кровать конфликт product/variant",
    metadata: {
      dimensions: { height_mm: 1000, width_mm: 1600, depth_mm: 2000 },
    },
    variants: [
      {
        id: "v_conflict",
        metadata: {
          dimensions: { height_mm: 1100, width_mm: 1800, depth_mm: 2100 },
        },
      },
    ],
  },
  {
    id: "p_multi",
    title: "Шкаф 120x60x200 в названии",
    metadata: {
      dimensions: { height_mm: 2000, width_mm: 1200, depth_mm: 600 },
    },
    variants: [
      {
        id: "v_a",
        metadata: {
          dimensions: { height_mm: 2000, width_mm: 1000, depth_mm: 600 },
        },
      },
      {
        id: "v_b",
        metadata: {
          dimensions: { height_mm: 2000, width_mm: 1200, depth_mm: 600 },
        },
      },
    ],
  },
]

function rawBag(meta: Record<string, unknown> | null | undefined) {
  if (!meta) return null
  const d = meta.dimensions ?? meta.dimensions_normalized
  return d && typeof d === "object" ? (d as Record<string, unknown>) : null
}

function rawHasZero(raw: Record<string, unknown> | null): boolean {
  if (!raw) return false
  return [raw.height_mm, raw.width_mm, raw.depth_mm].some((v) => v === 0)
}

function rawHasInvalid(raw: Record<string, unknown> | null): boolean {
  if (!raw) return false
  return [raw.height_mm, raw.width_mm, raw.depth_mm].some((v) => {
    if (v == null || v === "") return false
    if (typeof v === "number") return !Number.isFinite(v) || v < 0
    if (typeof v === "string") return !/^-?\d+(\.\d+)?$/.test(v.trim())
    return true
  })
}

function classifyCorpus(products: SampleProduct[]) {
  const counts: Record<ClassKey, number> = {
    full_variant: 0,
    partial_variant: 0,
    missing_all: 0,
    has_zeros_in_raw: 0,
    invalid_raw: 0,
    product_fallback_only: 0,
    variant_level: 0,
    product_variant_conflict: 0,
    variants_differ_on_product: 0,
    title_mentions_size_pattern: 0,
  }
  const examples: Partial<Record<ClassKey, string[]>> = {}
  const push = (k: ClassKey, id: string) => {
    counts[k] += 1
    examples[k] ??= []
    if (examples[k]!.length < 3) examples[k]!.push(id)
  }

  for (const p of products) {
    if (p.title && SIZE_IN_TITLE.test(p.title)) {
      push("title_mentions_size_pattern", p.id)
    }

    const resolvedVariants = p.variants.map((v) => {
      const resolved = resolveFurnitureDimensions({
        product: { metadata: p.metadata ?? null },
        variant: { metadata: v.metadata ?? null },
      })
      const vRaw = rawBag(v.metadata)
      const pRaw = rawBag(p.metadata)
      if (rawHasZero(vRaw) || rawHasZero(pRaw)) {
        push("has_zeros_in_raw", `${p.id}/${v.id}`)
      }
      if (rawHasInvalid(vRaw) || rawHasInvalid(pRaw)) {
        push("invalid_raw", `${p.id}/${v.id}`)
      }
      return { v, resolved }
    })

    if (p.variants.length > 1) {
      const keys = resolvedVariants.map((x) =>
        JSON.stringify(x.resolved.mm)
      )
      if (new Set(keys).size > 1) {
        push("variants_differ_on_product", p.id)
      }
    }

    for (const { v, resolved } of resolvedVariants) {
      const id = `${p.id}/${v.id}`
      const known = [
        resolved.mm.height_mm,
        resolved.mm.width_mm,
        resolved.mm.depth_mm,
      ].filter((x) => x != null).length

      if (known === 0) push("missing_all", id)
      else if (known === 3) push("full_variant", id)
      else push("partial_variant", id)

      const sources = Object.values(resolved.provenance)
      if (sources.includes("variant")) push("variant_level", id)
      if (
        sources.every((s) => s === "product" || s === "none") &&
        sources.includes("product")
      ) {
        push("product_fallback_only", id)
      }

      const pRaw = rawBag(p.metadata)
      const vRaw = rawBag(v.metadata)
      if (pRaw && vRaw) {
        for (const key of ["height_mm", "width_mm", "depth_mm"] as const) {
          const a = pRaw[key]
          const b = vRaw[key]
          if (
            typeof a === "number" &&
            a > 0 &&
            typeof b === "number" &&
            b > 0 &&
            a !== b
          ) {
            push("product_variant_conflict", id)
            break
          }
        }
      }
    }
  }

  return { counts, examples, product_count: products.length }
}

async function tryLiveScan(): Promise<{
  ok: boolean
  error?: string
  products?: SampleProduct[]
}> {
  const url = process.env.DATABASE_URL
  if (!url) return { ok: false, error: "DATABASE_URL not set" }
  try {
    // Prefer workspace pg if present; otherwise skip live scan cleanly.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pg = require("pg") as {
      Client: new (cfg: { connectionString: string }) => {
        connect: () => Promise<void>
        query: (sql: string) => Promise<{ rows: Array<Record<string, unknown>> }>
        end: () => Promise<void>
      }
    }
    const client = new pg.Client({ connectionString: url })
    await client.connect()
    try {
      const productsRes = await client.query(`
        select id, title, metadata
        from product
        where deleted_at is null
        limit 500
      `)
      const variantsRes = await client.query(`
        select id, product_id, metadata
        from product_variant
        where deleted_at is null
        limit 2000
      `)
      const byProduct = new Map<string, SampleProduct>()
      for (const row of productsRes.rows) {
        byProduct.set(String(row.id), {
          id: String(row.id),
          title: typeof row.title === "string" ? row.title : undefined,
          metadata: (row.metadata as Record<string, unknown>) ?? null,
          variants: [],
        })
      }
      for (const row of variantsRes.rows) {
        const pid = String(row.product_id)
        const p = byProduct.get(pid)
        if (!p) continue
        p.variants.push({
          id: String(row.id),
          metadata: (row.metadata as Record<string, unknown>) ?? null,
        })
      }
      return { ok: true, products: [...byProduct.values()] }
    } finally {
      await client.end()
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

async function main() {
  const live = process.argv.includes("--live")
  const fixture = classifyCorpus(FIXTURE_CORPUS)

  let liveReport: unknown = null
  if (live) {
    const scanned = await tryLiveScan()
    if (scanned.ok && scanned.products) {
      liveReport = {
        mode: "live_readonly_select",
        ...classifyCorpus(scanned.products),
      }
    } else {
      liveReport = {
        mode: "live_unavailable",
        error: scanned.error,
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: live ? "fixture_plus_live_attempt" : "fixture_corpus",
        axis_order: ["height", "width", "depth"],
        zero_policy: "0 is unknown, never a size",
        medusa_length_mapping: "not used as furniture depth",
        writes: "none",
        fixture,
        live: liveReport,
      },
      null,
      2
    )
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
