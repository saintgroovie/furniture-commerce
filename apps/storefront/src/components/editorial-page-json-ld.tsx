import { headers } from "next/headers"
import { jsonLdHtml } from "@/lib/json-ld"
import type { EditorialPageJsonLd as Payload } from "@/lib/editorial-page-json-ld"

export async function EditorialPageJsonLd({ payload }: { payload: Payload | null }) {
  if (!payload) return null
  const nonce = (await headers()).get("x-nonce") ?? undefined
  return <script type="application/ld+json" data-editorial-page-jsonld="" nonce={nonce}
    dangerouslySetInnerHTML={{ __html: jsonLdHtml(payload) }} />
}
