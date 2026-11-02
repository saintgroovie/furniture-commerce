import { NextResponse } from "next/server"
import { getSitemapSources } from "@/lib/api/sitemap-sources"
import { KIDS_ROOM_TYPE } from "@/lib/kids"
import { isIndexingAllowed } from "@/lib/indexing-policy"
import { resolvePublicIndexableOrigin } from "@/lib/seo-mode"
import {
  collectProductSitemapEntries,
  collectRoomSitemapEntries,
  collectMotifSitemapEntries,
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
export async function GET(request?: Request) {
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
  let entries: ReturnType<typeof collectStaticSitemapEntries>
  try {
    const sources = await getSitemapSources(request?.signal)
    entries = mergeSitemapEntries([
      ...collectStaticSitemapEntries(origin, {
        includeKidsRooms: sources.rooms.some(room => room.is_active === true && room.room_type === KIDS_ROOM_TYPE),
      }),
      ...collectProductSitemapEntries(origin, sources.products),
      ...collectRoomSitemapEntries(origin, sources.rooms),
      ...collectMotifSitemapEntries(origin, sources.motifs),
    ])
  } catch {
    return new NextResponse(null, {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    })
  }

  const xml = renderSitemapXml(entries)
  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  })
}
