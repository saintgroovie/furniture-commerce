/**
 * Public-page SEO audit crawl (read-only GET, bounded concurrency).
 *
 *   yarn dlx -q tsx scripts/seo-audit-crawl.ts --base https://woodright.ru --out <dir> [--sitemap-base <url>] [--limit N]
 *
 * URLs: `<base>/sitemap.xml` (`--sitemap-base` lets a preview crawl the production URL list
 * with paths rewritten to `--base`). Writes `<out>/seo-audit-board.{csv,json}` + summary.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

function arg(name: string): string | null {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] ?? null : null
}

const base = (arg("--base") ?? "").replace(/\/$/, "")
const outDir = arg("--out")
if (!base || !outDir) {
  console.error("usage: seo-audit-crawl.ts --base <url> --out <dir> [--sitemap-base <url>] [--limit N]")
  process.exit(2)
}
const sitemapBase = (arg("--sitemap-base") ?? base).replace(/\/$/, "")
const limit = Number(arg("--limit") ?? "0") || Infinity
const CONCURRENCY = 4

type Page = {
  url: string
  path: string
  status: number
  page_type: string
  title: string
  meta_description: string
  canonical: string
  robots: string
  og_title: string
  h1: string[]
  ld_product_name: string
  ld_has_offer: boolean
  ld_offer_price: string
  ld_breadcrumb: boolean
  in_sitemap: boolean
}

function decode(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;|&#160;|\u00a0|\u202f/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
}

function metaContent(html: string, attr: "name" | "property", key: string): string {
  const re = new RegExp(`<meta[^>]*${attr}="${key}"[^>]*>`, "i")
  const tag = html.match(re)?.[0] ?? ""
  return decode(tag.match(/content="([^"]*)"/i)?.[1] ?? "")
}

function pageType(path: string): string {
  if (path === "/") return "home"
  if (path.startsWith("/product/")) return "product"
  if (path.startsWith("/rooms/") || path.startsWith("/kids/rooms/")) return "room_set"
  if (path.startsWith("/kids/willie-winkie/")) return "motif"
  if (/^\/(catalog|kids\/catalog)$/.test(path)) return "catalog"
  if (/^\/(privacy|terms|delivery|payment|returns|warranty|offer|cookies|requisites|personal-data)$/.test(path)) return "legal"
  return "static"
}

function parse(url: string, status: number, html: string): Page {
  const path = new URL(url).pathname
  const ld = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].flatMap((m) => {
    try {
      const v = JSON.parse(m[1]!)
      return Array.isArray(v) ? v : [v]
    } catch {
      return []
    }
  }) as Array<Record<string, unknown>>
  const product = ld.find((x) => x["@type"] === "Product")
  const offers = product?.offers as Record<string, unknown> | undefined
  return {
    url,
    path,
    status,
    page_type: pageType(path),
    title: decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""),
    meta_description: metaContent(html, "name", "description"),
    canonical: decode(html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]*)"/i)?.[1] ?? ""),
    robots: metaContent(html, "name", "robots"),
    og_title: metaContent(html, "property", "og:title"),
    h1: [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => decode(m[1]!.replace(/<[^>]+>/g, ""))),
    ld_product_name: decode(String(product?.name ?? "")),
    ld_has_offer: Boolean(offers),
    ld_offer_price: String(offers?.price ?? ""),
    ld_breadcrumb: ld.some((x) => x["@type"] === "BreadcrumbList"),
    in_sitemap: true,
  }
}

async function fetchText(url: string): Promise<{ status: number; text: string }> {
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(30000) })
    return { status: res.status, text: await res.text() }
  } catch {
    return { status: 0, text: "" }
  }
}

async function main() {
  const sm = await fetchText(`${sitemapBase}/sitemap.xml`)
  const urls = [...sm.text.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => `${base}${new URL(m[1]!).pathname}`)
    .slice(0, limit)
  if (!urls.length) {
    console.error(`no URLs in ${sitemapBase}/sitemap.xml (status ${sm.status})`)
    process.exit(1)
  }
  const pages: Page[] = []
  let next = 0
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < urls.length) {
        const url = urls[next++]!
        const r = await fetchText(url)
        pages.push(parse(url, r.status, r.text))
      }
    })
  )
  pages.sort((a, b) => a.path.localeCompare(b.path))

  const groups = (key: (p: Page) => string) => {
    const m = new Map<string, Page[]>()
    for (const p of pages) {
      const k = key(p)
      if (k) m.set(k, [...(m.get(k) ?? []), p])
    }
    return new Map([...m].filter(([, v]) => v.length > 1))
  }
  const dupTitle = groups((p) => p.title)
  const dupMeta = groups((p) => p.meta_description)
  const dupGroupId = new Map<string, string>()
  let gid = 0
  for (const [, ps] of dupTitle) {
    gid += 1
    for (const p of ps) dupGroupId.set(p.path, `T${gid}`)
  }

  const rows = pages.map((p) => {
    const issues: string[] = []
    if (p.status !== 200) issues.push("status_not_200")
    if (dupTitle.has(p.title)) issues.push("duplicate_title")
    if (dupMeta.has(p.meta_description)) issues.push("duplicate_meta")
    if (!p.meta_description) issues.push("missing_meta")
    if (p.meta_description.includes("...")) issues.push("meta_ascii_ellipsis")
    if (p.meta_description.length > 160) issues.push("meta_over_160")
    if ((p.title.match(/Woodright/g) ?? []).length > 1) issues.push("double_brand_title")
    if (p.title.length > 70) issues.push("title_over_70")
    if (p.h1.length !== 1) issues.push("h1_count")
    if (/noindex/i.test(p.robots)) issues.push("noindex")
    if (p.canonical && new URL(p.canonical, base).pathname !== p.path) issues.push("canonical_not_self")
    if (!p.canonical) issues.push("missing_canonical")
    if (p.page_type === "product") {
      if (!p.ld_product_name) issues.push("missing_ld_product")
      else if (p.h1[0] && !p.ld_product_name.startsWith(p.h1[0])) issues.push("ld_name_not_h1")
      if (!p.ld_breadcrumb) issues.push("missing_ld_breadcrumb")
      if (p.og_title && p.ld_product_name && p.og_title !== p.ld_product_name) issues.push("og_title_not_entity")
    }
    return {
      url: p.url,
      page_type: p.page_type,
      canonical_name: p.ld_product_name || p.h1[0] || "",
      h1: p.h1.join(" / "),
      title: p.title,
      meta: p.meta_description,
      canonical: p.canonical,
      indexability: /noindex/i.test(p.robots) ? "noindex" : "index",
      sitemap: p.in_sitemap ? "yes" : "no",
      og_title: p.og_title,
      json_ld: [p.ld_product_name ? "Product" : "", p.ld_has_offer ? `Offer(${p.ld_offer_price})` : "", p.ld_breadcrumb ? "BreadcrumbList" : ""]
        .filter(Boolean)
        .join("+"),
      duplicate_group: dupGroupId.get(p.path) ?? "",
      issue: issues.join(", "),
      proposed_action: issues.length ? "see issue_class" : "none",
      issue_class: issues.length ? (issues.some((i) => /status|canonical|noindex|missing_ld/.test(i)) ? "P1" : "P2") : "",
    }
  })

  const summary = {
    base,
    pages: pages.length,
    status_200: pages.filter((p) => p.status === 200).length,
    duplicate_title_groups: dupTitle.size,
    duplicate_title_pages: [...dupTitle.values()].reduce((s, v) => s + v.length, 0),
    duplicate_meta_groups: dupMeta.size,
    duplicate_meta_pages: [...dupMeta.values()].reduce((s, v) => s + v.length, 0),
    meta_ascii_ellipsis: rows.filter((r) => r.issue.includes("meta_ascii_ellipsis")).length,
    double_brand_title: rows.filter((r) => r.issue.includes("double_brand_title")).length,
    title_over_70: rows.filter((r) => r.issue.includes("title_over_70")).length,
    h1_not_one: rows.filter((r) => r.issue.includes("h1_count")).length,
    noindex: rows.filter((r) => r.indexability === "noindex").length,
    canonical_not_self: rows.filter((r) => r.issue.includes("canonical_not_self")).length,
    product_pages: pages.filter((p) => p.page_type === "product").length,
    product_with_offer: pages.filter((p) => p.ld_has_offer).length,
    ld_name_not_h1: rows.filter((r) => r.issue.includes("ld_name_not_h1")).length,
  }

  const COLS = Object.keys(rows[0]!) as Array<keyof (typeof rows)[number]>
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  mkdirSync(resolve(outDir!), { recursive: true })
  writeFileSync(resolve(outDir!, "seo-audit-board.csv"), `${[COLS.join(","), ...rows.map((r) => COLS.map((c) => cell(String(r[c]))).join(","))].join("\n")}\n`)
  writeFileSync(resolve(outDir!, "seo-audit-board.summary.json"), `${JSON.stringify(summary, null, 1)}\n`)
  console.log(JSON.stringify(summary, null, 1))
}

void main()
