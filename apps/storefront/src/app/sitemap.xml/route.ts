import { NextResponse } from "next/server"
import { getCatalogProducts } from "@/lib/api/products"
import { isIndexingAllowed } from "@/lib/indexing-policy"
import { resolvePublicIndexableOrigin } from "@/lib/seo-mode"
import {
  collectProductSitemapEntries,
  collectStaticSitemapEntries,
  mergeSitemapEntries,
  renderSitemapXml,
} from "@/lib/sitemap-entries"

export const dynamic = "force-dynamic"

/**
 * Sitemap publication:
 * - demo/private noindex → 404
 * - public_indexable → production HTTPS apex URLs only
 *
 * Fail-closed on catalog fetch errors (no partial corrupt XML of invented URLs).
 */
export async function GET() {
  if (!isIndexingAllowed()) {
    return new NextResponse(null, {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    })
  }

  const origin = resolvePublicIndexableOrigin()
  const staticEntries = collectStaticSitemapEntries(origin)
  let productEntries: ReturnType<typeof collectProductSitemapEntries> = []
  try {
    const catalog = (await getCatalogProducts()) as {
      products?: unknown
    }
    if (!catalog || !Array.isArray(catalog.products)) {
      return new NextResponse(null, {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "text/plain; charset=utf-8",
        },
      })
    }
    productEntries = collectProductSitemapEntries(
      origin,
      catalog.products as Array<{ handle?: unknown; id?: unknown }>
    )
  } catch {
    return new NextResponse(null, {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    })
  }

  const entries = mergeSitemapEntries([...staticEntries, ...productEntries])
  const xml = renderSitemapXml(entries)
  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  })
}
