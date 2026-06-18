import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Legacy Media Assignment Board v2 (QA)",
  description: "Redirects to Woodright Media Ops Assign mode.",
}

type PageProps = {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>
}

function toQueryString(params: Record<string, string | string[] | undefined>): string {
  const sp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue
    if (Array.isArray(value)) {
      for (const v of value) sp.append(key, v)
    } else {
      sp.set(key, value)
    }
  }
  const q = sp.toString()
  return q ? `?${q}` : ""
}

export default async function LegacyMediaBoardV2Page({ searchParams }: PageProps) {
  const resolved = searchParams ? await Promise.resolve(searchParams) : {}
  redirect(`/qa/media-ops/assign${toQueryString(resolved)}`)
}
