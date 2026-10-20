/**
 * Deterministic SEO regression over Store API product rows.
 * Used by `scripts/catalog-seo-regression.ts` (live dump) and fidelity tests (fixtures).
 * Read-only: never writes product data.
 */
import { isRequestQuoteProduct } from "@/lib/request-quote"
import { buildMaterialTierOptions } from "@/lib/material-tiers"
import { getBuyerFacingProductTitle } from "@/lib/product-metadata"
import {
  buildProductMetaDescription,
  getBuyerDescription,
  getProductSeoName,
  META_DESCRIPTION_MAX,
} from "@/lib/product-seo"

type ProductLike = Record<string, unknown>

export type SeoIssueClass =
  | "duplicate_seo_name"
  | "duplicate_meta_description"
  | "meta_too_long"
  | "meta_ascii_ellipsis"
  | "meta_promise_or_cliche"
  | "name_promise_or_cliche"
  | "name_brand_or_sku"
  | "name_empty"
  | "description_internal_provenance"
  | "long_dash"

export type SeoAuditRow = {
  handle: string
  h1: string
  seo_name: string
  title: string
  meta_description: string
  meta_length: number
  issues: SeoIssueClass[]
}

export const SITE_TITLE_SUFFIX = " | Woodright"

/** Commercial promises and marketplace clichés the catalog copy must not carry. */
export const PROMISE_OR_CLICHE_RE =
  /в наличии|доставк|скидк|акци[яиюй]|бесплатн|гаранти|в срок|недорог|дешёв|дешев|по низкой цене|лучш|премиальн|идеальн|уникальн|эксклюзивн|элитн|роскошн|№\s?1|хит продаж|купить/iu

const INTERNAL_PROVENANCE_RE = /ячейк[аи] прайса|Источник - |В названии прайса|Порядок: высота/u

function isPublishedRow(p: ProductLike): boolean {
  return p.status == null || p.status === "published"
}

function nameLeaksBrandOrSku(name: string, p: ProductLike): boolean {
  if (/woodright|вудрайт/iu.test(name)) return true
  const handle = typeof p.handle === "string" ? p.handle : ""
  const m = p.metadata as Record<string, unknown> | undefined
  const sku = typeof m?.sku === "string" ? m.sku : ""
  const codes = [handle, sku].filter((c) => c.length >= 4)
  if (codes.some((c) => name.toLowerCase().includes(c.toLowerCase()))) return true
  return /\b[A-Z]{1,4}-\d{2}(?:-\d+)?\b/.test(name)
}

export function auditCatalogSeo(products: ProductLike[]): {
  rows: SeoAuditRow[]
  summary: Record<SeoIssueClass, number> & { products: number }
} {
  const rows: SeoAuditRow[] = []
  for (const p of products.filter(isPublishedRow)) {
    const h1 = getBuyerFacingProductTitle(p)
    const seoName = getProductSeoName(p)
    const meta = buildProductMetaDescription(p, {
      hasOptions: (buildMaterialTierOptions(p)?.length ?? 0) > 0,
      priceMode: isRequestQuoteProduct(p) ? "quote" : "price",
    })
    const visible = getBuyerDescription(p) ?? ""
    const issues: SeoIssueClass[] = []
    if (!seoName.trim()) issues.push("name_empty")
    if (meta.length > META_DESCRIPTION_MAX) issues.push("meta_too_long")
    if (meta.includes("...")) issues.push("meta_ascii_ellipsis")
    if (PROMISE_OR_CLICHE_RE.test(meta)) issues.push("meta_promise_or_cliche")
    if (PROMISE_OR_CLICHE_RE.test(seoName)) issues.push("name_promise_or_cliche")
    if (nameLeaksBrandOrSku(seoName, p)) issues.push("name_brand_or_sku")
    if (INTERNAL_PROVENANCE_RE.test(visible)) issues.push("description_internal_provenance")
    if (/[—–]/u.test(`${seoName} ${meta}`)) issues.push("long_dash")
    rows.push({
      handle: String(p.handle ?? p.id ?? ""),
      h1,
      seo_name: seoName,
      title: `${seoName}${SITE_TITLE_SUFFIX}`,
      meta_description: meta,
      meta_length: meta.length,
      issues,
    })
  }

  const markDuplicates = (key: "seo_name" | "meta_description", cls: SeoIssueClass) => {
    const groups = new Map<string, SeoAuditRow[]>()
    for (const r of rows) groups.set(r[key], [...(groups.get(r[key]) ?? []), r])
    for (const g of groups.values()) if (g.length > 1) for (const r of g) r.issues.push(cls)
  }
  markDuplicates("seo_name", "duplicate_seo_name")
  markDuplicates("meta_description", "duplicate_meta_description")

  const summary = {
    products: rows.length,
    duplicate_seo_name: 0,
    duplicate_meta_description: 0,
    meta_too_long: 0,
    meta_ascii_ellipsis: 0,
    meta_promise_or_cliche: 0,
    name_promise_or_cliche: 0,
    name_brand_or_sku: 0,
    name_empty: 0,
    description_internal_provenance: 0,
    long_dash: 0,
  } satisfies Record<SeoIssueClass, number> & { products: number }
  for (const r of rows) for (const i of r.issues) summary[i] += 1
  return { rows, summary }
}
