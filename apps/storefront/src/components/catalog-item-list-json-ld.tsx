import { headers } from "next/headers"
import { catalogItemListJsonLdPayload } from "@/lib/catalog-browse-pool"

export async function CatalogItemListJsonLd({
  siteUrl,
  entries,
}: {
  siteUrl: string
  entries: Array<{ product: Record<string, unknown> }>
}) {
  const payload = catalogItemListJsonLdPayload(siteUrl, entries)
  if (!payload) return null
  const nonce = (await headers()).get("x-nonce") ?? undefined
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(payload) }}
    />
  )
}
