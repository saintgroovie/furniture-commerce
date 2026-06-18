import { redirect } from "next/navigation"

export const metadata = {
  title: "Source Media Orphan Review (QA)",
  description: "Redirects to Media Ops Inbox orphan tab.",
}

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function SourceMediaOrphanReviewPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {}
  const q = new URLSearchParams()
  q.set("tab", "orphan")
  for (const [key, val] of Object.entries(sp)) {
    if (key === "tab") continue
    if (typeof val === "string") q.set(key, val)
    else if (Array.isArray(val) && val[0]) q.set(key, val[0])
  }
  redirect(`/qa/media-ops/inbox?${q.toString()}`)
}
