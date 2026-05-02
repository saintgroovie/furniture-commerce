import "server-only"
import * as fs from "fs"
import * as path from "path"
import { getBaseUrl, medusaFetch } from "@/lib/api/base"

export type OxfordLocalMvpPlanRow = {
  sku: string
  handle: string
  product_in_local_medusa_db?: boolean
  product_missing_for_media_assignment?: boolean
  proposed_primary_url?: string | null
  proposed_primary_tier?: string | null
  proposed_gallery_urls?: string[]
  gallery_review_backlog_urls?: string[]
  local_mvp_apply_allowed?: boolean
  apply_skip_reason?: string | null
}

export type OxfordLocalMvpAssignmentPlan = {
  audit_meta?: Record<string, unknown>
  medusa_local_environment?: Record<string, unknown>
  rows?: OxfordLocalMvpPlanRow[]
  summary?: Record<string, unknown>
}

function planPathCandidates(): string[] {
  const rel = "data/normalized/oxford-local-mvp-media-assignment-plan.json"
  return [
    path.join(process.cwd(), rel),
    path.resolve(process.cwd(), "../../", rel),
    path.resolve(process.cwd(), "../..", rel),
    path.resolve(process.cwd(), "../../../", rel),
  ]
}

export function loadOxfordLocalMvpAssignmentPlan(): OxfordLocalMvpAssignmentPlan | null {
  for (const candidate of planPathCandidates()) {
    if (!fs.existsSync(candidate)) continue
    try {
      const raw = fs.readFileSync(candidate, "utf8")
      return JSON.parse(raw) as OxfordLocalMvpAssignmentPlan
    } catch {
      return null
    }
  }
  return null
}

type StoreProduct = Record<string, unknown>

function parseProducts(payload: unknown): StoreProduct[] {
  if (!payload || typeof payload !== "object") return []
  const products = (payload as { products?: unknown }).products
  return Array.isArray(products) ? (products as StoreProduct[]) : []
}

export async function fetchStoreProductsForHandles(handles: string[]): Promise<StoreProduct[]> {
  const base = getBaseUrl()
  if (!base || handles.length === 0) return []

  const url = new URL(`${base}/store/products`)
  const res = await medusaFetch(url.toString())
  if (!res.ok) return []
  const all = parseProducts(await res.json())
  const want = new Set(handles.map((h) => h.toLowerCase()))
  return all.filter((p) => typeof p.handle === "string" && want.has(String(p.handle).toLowerCase()))
}

export async function getOxfordLocalMvpMediaPreview(): Promise<{
  plan: OxfordLocalMvpAssignmentPlan | null
  productsByHandle: Record<string, StoreProduct | null>
  summary: {
    plan_row_count: number
    medusa_products_found: number
    apply_allowed_rows: number
  }
}> {
  const plan = loadOxfordLocalMvpAssignmentPlan()
  const rows = plan?.rows ?? []
  const handles = [...new Set(rows.map((r) => r.handle).filter(Boolean))]
  const medusaProducts = await fetchStoreProductsForHandles(handles)
  const byHandle = new Map<string, StoreProduct>()
  for (const p of medusaProducts) {
    const h = p.handle
    if (typeof h === "string" && h) byHandle.set(h.toLowerCase(), p)
  }

  const productsByHandle: Record<string, StoreProduct | null> = {}
  for (const h of handles) {
    productsByHandle[h] = byHandle.get(h.toLowerCase()) ?? null
  }

  return {
    plan,
    productsByHandle,
    summary: {
      plan_row_count: rows.length,
      medusa_products_found: medusaProducts.length,
      apply_allowed_rows: rows.filter((r) => r.local_mvp_apply_allowed).length,
    },
  }
}
