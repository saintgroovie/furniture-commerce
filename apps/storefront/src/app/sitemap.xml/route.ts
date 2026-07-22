import { NextResponse } from "next/server"
import { isIndexingAllowed } from "@/lib/indexing-policy"

/**
 * Sitemap publication is disabled in noindex mode (owner SEO policy).
 * Prefer explicit 404 over an empty URL list.
 * Index-mode sitemap generation is deferred to production-domain cutover.
 */
export function GET() {
  if (!isIndexingAllowed()) {
    return new NextResponse(null, {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    })
  }

  // Fail-closed until a production sitemap implementation ships.
  return new NextResponse(null, {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  })
}
